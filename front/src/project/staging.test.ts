// Tests for the staged import: nothing reaches the project before commit, and commit stores the
// rows, staged korjaukset and decisions.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultProfile } from "../engine/profiles";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { addRule, importFile, rebuildLedger } from "./service";
import { Staging } from "./staging";

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
const FILE = enc(["Päivä;Summa;Saaja;Viesti", "1.2.2024;-5,00;Prisma;ruoka", "3.2.2024;2000;Palkka;"]);

function project(): Project {
  const p = Project.create(SQL);
  p.setSettings({ defaultOwner: "a" });
  p.setProfiles([bank]);
  return p;
}

describe("staging", () => {
  it("matches the file profile by name and keeps rows out of the project until commit", () => {
    const p = project();
    const s = new Staging();
    s.add(p, [
      { name: "bank_2024.csv", bytes: FILE },
      { name: "card.csv", bytes: FILE },
    ]);
    expect(s.files.map((f) => [f.name, f.profileId, f.recognised, f.rows.length])).toEqual([
      ["bank_2024.csv", "bank", true, 2],
      ["card.csv", "", false, 0],
    ]);
    expect(s.openFiles().map((f) => f.name)).toEqual(["card.csv"]);
    expect(p.getSourceRows()).toEqual([]);
    expect(s.preview(p).uncategorized.map((r) => r.fields.description)).toEqual(["Prisma", "Palkka"]);
  });

  it("shows a new rule in the preview and commits rows and staged korjaukset", () => {
    const p = project();
    const s = new Staging();
    s.add(p, [{ name: "bank.csv", bytes: FILE }]);
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
    expect(s.preview(p).uncategorized.map((r) => r.fields.description)).toEqual(["Palkka"]);
    const pay = s.stagedRows().find((r) => r.fields.description === "Palkka")!;
    s.setFix({ id: "k1", txId: pay.txId, class: "tulot", category: "ansiotulot" });
    expect(s.preview(p).rows.find((r) => r.txId === pay.txId)?.category).toBe("ansiotulot");

    const res = s.commit(p);
    expect(res).toMatchObject({ files: 1, rows: 2, fixes: 1 });
    expect(s.empty).toBe(true);
    expect(p.getFixes().map((f) => f.id)).toEqual(["k1"]);
    expect(
      p
        .getLedger()
        .map((r) => r.category)
        .sort(),
    ).toEqual(["ansiotulot", "ruoka"]);
  });

  it("skips rows the project already has and leaves out possible duplicates unless kept", () => {
    const p = project();
    importFile(p, "bank_old.csv", FILE, bank);
    rebuildLedger(p);
    const s = new Staging();
    // Same rows again (skipped) and one row that looks like a stored one but differs in its columns.
    s.add(p, [{ name: "bank_new.csv", bytes: enc(["Päivä;Summa;Saaja;Viesti;Arkisto", "1.2.2024;-5,00;Prisma;ruoka;X9"]) }]);
    const prev = s.preview(p);
    expect(prev.duplicates).toHaveLength(1);
    const res = s.commit(p);
    expect(res.duplicatesLeftOut).toBe(1);
    expect(p.getLedger().filter((r) => r.description === "Prisma")).toHaveLength(1);
  });

  it("adds late rows to a locked month unless skipped", () => {
    const p = project();
    p.setSettings({ lockedThrough: "2024-02" });
    const s = new Staging();
    s.add(p, [{ name: "bank.csv", bytes: FILE }]);
    expect(s.preview(p).late).toHaveLength(2);
    const skip = s.stagedRows().find((r) => r.fields.description === "Palkka")!;
    s.skipLate.add(skip.txId);
    const res = s.commit(p);
    expect(res.late).toBe(1);
    expect(p.getLedger().map((r) => r.description)).toEqual(["Prisma"]);
  });
});
