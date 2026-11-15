// Editing one transaction's fix: only changed fields are kept, the fix is replaced in place, and a
// locked month refuses the change.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultProfile } from "../engine/profiles";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import {
  compiledRules,
  deleteTransaction,
  deletedTransactions,
  restoreTransaction,
  dropInvalid,
  fixFromValues,
  importFile,
  originalValues,
  rebuildLedger,
  reviewData,
  setLock,
  setTransactionFix,
} from "./service";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

const bank = defaultProfile({
  id: "bank",
  name: "bank",
  filePattern: "bank",
  delimiter: ";",
  columns: { date: "Päivä", amount: "Summa", description: ["Saaja"], info: [] },
});

function setup(): Project {
  const p = Project.create(SQL);
  p.setSettings({ defaultOwner: "a" });
  p.setRules([
    {
      id: "1",
      account: "",
      description: "Prisma",
      info: "",
      amount: "any",
      class: "menot",
      category: "ruoka",
      subCategory: "",
    },
  ]);
  importFile(
    p,
    "bank.csv",
    new TextEncoder().encode(["Päivä;Summa;Saaja", "10.1.2024;-5,00;Prisma", "10.3.2024;-7,00;Prisma"].join("\n")),
    bank,
  );
  rebuildLedger(p);
  return p;
}

describe("transaction fix", () => {
  it("keeps only the fields that change", () => {
    const p = setup();
    const row = p.getSourceRows()[0]!;
    const orig = originalValues(row, compiledRules(p));
    expect([orig.class, orig.category, orig.amount]).toEqual(["menot", "ruoka", -5]);
    expect(fixFromValues("1", row.txId, orig, { ...orig })).toBeNull();
    expect(
      fixFromValues("1", row.txId, orig, {
        ...orig,
        category: "Ruoka",
        amount: -5.001,
      }),
    ).toBeNull();
    expect(
      fixFromValues("1", row.txId, orig, {
        ...orig,
        category: "lahjat",
        description: "",
      }),
    ).toEqual({ id: "1", txId: row.txId, category: "lahjat" });
  });

  it("replaces the transaction's fix in place and removes it", () => {
    const p = setup();
    const [a, b] = p.getSourceRows();
    p.setFixes([
      { id: "1", txId: a!.txId, category: "x" },
      { id: "2", txId: b!.txId, category: "y" },
    ]);
    expect(
      setTransactionFix(p, a!.txId, {
        id: "1",
        txId: a!.txId,
        category: "lahjat",
      }),
    ).toEqual([]);
    expect(p.getFixes().map((f) => [f.id, f.category])).toEqual([
      ["1", "lahjat"],
      ["2", "y"],
    ]);
    expect(p.getLedger().find((r) => r.txId === a!.txId)?.category).toBe("lahjat");
    setTransactionFix(p, a!.txId, null);
    expect(p.getFixes().map((f) => f.id)).toEqual(["2"]);
    expect(p.getLedger().find((r) => r.txId === a!.txId)?.category).toBe("ruoka");
  });

  it("refuses a change in a locked month", () => {
    const p = setup();
    setLock(p, "2024-02");
    const jan = p.getSourceRows().find((r) => r.fields.date?.startsWith("2024-01"))!;
    expect(
      setTransactionFix(p, jan.txId, {
        id: "1",
        txId: jan.txId,
        category: "lahjat",
      }),
    ).toEqual(["1"]);
    expect(p.getFixes()).toEqual([]);
  });
});

describe("unreadable rows", () => {
  it("leaves a row with a broken date out for good", () => {
    const p = setup();
    importFile(p, "bank2.csv", new TextEncoder().encode(["Päivä;Summa;Saaja", "31.20.2026;-9,00;Asuntolaina"].join("\n")), bank);
    rebuildLedger(p);
    const bad = reviewData(p).invalid;
    expect(bad.map((r) => r.columns["Päivä"])).toEqual(["31.20.2026"]);
    dropInvalid(p, [bad[0]!.txId]);
    expect(reviewData(p).invalid).toEqual([]);
    expect(p.getLedger()).toHaveLength(2);
  });
});

describe("deleting a transaction", () => {
  it("leaves the ledger, can be restored, and is refused in a locked month", () => {
    const p = setup();
    const [jan, mar] = p.getSourceRows();
    expect(deleteTransaction(p, mar!.txId)).toBe(true);
    expect(p.getLedger().map((r) => r.txId)).toEqual([jan!.txId]);
    expect(deletedTransactions(p).map((r) => r.txId)).toEqual([mar!.txId]);
    restoreTransaction(p, mar!.txId);
    expect(p.getLedger()).toHaveLength(2);
    expect(deletedTransactions(p)).toEqual([]);
    setLock(p, "2024-02");
    expect(deleteTransaction(p, jan!.txId)).toBe(false);
    expect(p.getLedger()).toHaveLength(2);
  });
});
