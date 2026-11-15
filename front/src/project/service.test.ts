// Tests for the review and profile operations on a project.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultProfile } from "../engine/profiles";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import {
  addRule,
  decideDuplicates,
  deleteFix,
  importFile,
  members,
  rebuildLedger,
  renameMember,
  reviewCount,
  reviewData,
  updateProfile,
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
  columns: { date: "Päivä", amount: "Summa", description: ["Saaja"], info: ["Viesti"] },
});
const enc = (lines: string[]) => new TextEncoder().encode(lines.join("\n"));
const FILE = enc(["Päivä;Summa;Saaja;Viesti;Arkisto", "1.2.2024;-5,00;Prisma;ruoka;A1", "3.2.2024;2000;Palkka;;A2", "x;1;Rikki;;A3"]);

function setup(): Project {
  const p = Project.create(SQL);
  p.setSettings({ defaultOwner: "a" });
  importFile(p, "bank.csv", FILE, bank);
  rebuildLedger(p);
  return p;
}

describe("review", () => {
  it("lists uncategorised and invalid rows", () => {
    const d = reviewData(setup());
    expect(d.uncategorized.map((r) => r.fields.description)).toEqual(["Prisma", "Palkka"]);
    expect(d.invalid.map((r) => r.fields.description)).toEqual(["Rikki"]);
    expect(reviewCount(d)).toBe(3);
  });

  it("clears a row once a rule covers it", () => {
    const p = setup();
    addRule(p, {
      id: "1",
      account: "",
      description: "Prisma",
      info: "",
      amount: "neg",
      class: "menot",
      category: "ruoka",
      subCategory: "",
    });
    expect(reviewData(p).uncategorized.map((r) => r.fields.description)).toEqual(["Palkka"]);
    expect(p.getLedger().find((r) => r.description === "Prisma")?.category).toBe("ruoka");
  });

  it("drops a row decided to be a duplicate and keeps rows decided to be distinct", () => {
    const p = setup();
    importFile(p, "bank_new.csv", enc(["Päivä;Summa;Saaja;Viesti", "1.2.2024;-5,00;Prisma;ruoka"]), bank);
    rebuildLedger(p);
    const groups = reviewData(p).duplicateGroups;
    expect(groups).toHaveLength(1);
    const newer = groups[0]!.find((r) => r.sourceFile === "bank_new.csv")!;
    decideDuplicates(p, groups[0]!, new Set([newer.txId]));
    expect(reviewData(p).duplicateGroups).toEqual([]);
    expect(p.getLedger().filter((r) => r.description === "Prisma")).toHaveLength(1);
  });

  it("lists and deletes fixes that match no row", () => {
    const p = setup();
    p.setFixes([{ id: "f1", txId: "gone-1", class: "pois" }]);
    expect(reviewData(p).failedFixes.map((f) => f.id)).toEqual(["f1"]);
    deleteFix(p, "f1");
    expect(reviewData(p).failedFixes).toEqual([]);
  });
});

describe("profile edits", () => {
  it("re-derives fields for a mapping change without re-reading", () => {
    const p = setup();
    const ids = p.getSourceRows().map((r) => r.txId);
    const res = updateProfile(p, { ...bank, columns: { ...bank.columns, description: ["Saaja", "Arkisto"] } });
    expect(res.reread).toBe(0);
    expect(p.getSourceRows().map((r) => r.txId)).toEqual(ids);
    expect(p.getLedger().some((r) => r.description === "Prisma A1")).toBe(true);
  });

  it("re-reads stored files when a read option changes", () => {
    const p = Project.create(SQL);
    const wrong = { ...bank, delimiter: "," };
    expect(() => importFile(p, "bank.csv", FILE, wrong)).toThrow(/missing columns/);
    const ok = { ...bank, skipRows: 0 };
    importFile(p, "bank.csv", FILE, ok);
    const res = updateProfile(p, { ...ok, account: "bank-2" });
    expect(res.reread).toBe(1);
    expect(p.getSourceRows()).toHaveLength(3);
    expect(p.getSourceRows()[0]?.fields.account).toBe("bank-2");
  });
});

describe("members", () => {
  it("lists the default member first and renames a member everywhere", () => {
    const p = setup();
    p.setSplits([{ start: "2024-01-01", end: "2024-12-31", account: "bank", share: 0.5, owner: "b" }]);
    rebuildLedger(p);
    expect(members(p)).toEqual(["a", "b"]);
    renameMember(p, "b", "Bea");
    expect(members(p)).toEqual(["a", "Bea"]);
    expect(p.getSplits()[0]!.owner).toBe("Bea");
    renameMember(p, "a", "Aino");
    expect(p.getSettings().defaultOwner).toBe("Aino");
  });
});
