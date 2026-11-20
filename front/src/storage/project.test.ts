// Tests for the project file: schema, round trip through bytes, stored source columns, import
// dedupe, re-deriving fields from a changed profile and the sample project.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultProfile } from "../engine/profiles";
import { loadSample } from "../engine/testing/sampleProject";
import { importFile, rebuildLedger } from "../project/service";
import { runSample, sampleInputFromDisk } from "../engine/testing/sampleData";
import { ledgerOrder, Project, ProjectFileError } from "./project";
import { SCHEMA_VERSION } from "./schema";
import { loadSqlJs } from "./sqljs";

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
const csv = (rows: string[]) => new TextEncoder().encode(["Päivä;Summa;Saaja;Viesti;Arkisto", ...rows].join("\r\n"));
const FILE = csv(["1.2.2024;-5,00;Prisma;ruoka;A1", "1.2.2024;-5,00;Prisma;ruoka;A1", "3.2.2024;2000;Palkka;;A2"]);

function reopen(p: Project): Project {
  return Project.open(SQL, p.export());
}

describe("project file", () => {
  it("creates the current schema and refuses other files", () => {
    const p = Project.create(SQL);
    expect(p.db.exec("PRAGMA user_version")[0]?.values[0]?.[0]).toBe(SCHEMA_VERSION);
    expect(() => Project.open(SQL, new TextEncoder().encode("not sqlite"))).toThrow(ProjectFileError);
    expect(() => Project.open(SQL, new SQL.Database().export())).toThrow(ProjectFileError);
    // the kind lets the app say why in the user's language
    const kind = (bytes: Uint8Array) => {
      try {
        Project.open(SQL, bytes);
        return "";
      } catch (e) {
        return e instanceof ProjectFileError ? e.kind : "other";
      }
    };
    expect(kind(new TextEncoder().encode("not sqlite"))).toBe("notProject");
    const newer = Project.create(SQL);
    newer.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(kind(newer.db.export())).toBe("tooNew");
  });

  it("refuses a file from a newer app version", () => {
    const p = Project.create(SQL);
    p.db.run(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => Project.open(SQL, p.export())).toThrow(/newer/);
  });

  it("round-trips settings, rules, splits, targets and fixes", () => {
    const p = Project.create(SQL);
    p.setSettings({ lockedThrough: "2024-06", defaultOwner: "a", language: "en" });
    p.setRules([
      { id: "1", account: "", description: "Prisma", info: "", amount: "neg", class: "menot", category: "ruoka", subCategory: "" },
    ]);
    p.setSplits([{ start: "2023-01-01", end: "2023-12-31", account: "x", share: 0.5, owner: "a" }]);
    p.setTargets([
      { name: "T", start: "2023-01-01", end: "2023-12-31", owner: "a", monthlyAmount: -5, class: "menot", category: "", subCategory: "" },
    ]);
    p.setFixes([{ id: "f", txId: "abc-1", description: "x", amount: 3 }]);
    p.setProfiles([bank]);
    const q = reopen(p);
    expect(q.getSettings()).toEqual(p.getSettings());
    expect(q.getRules()).toEqual(p.getRules());
    expect(q.getSplits()).toEqual(p.getSplits());
    expect(q.getTargets()).toEqual(p.getTargets());
    expect(q.getFixes()).toEqual(p.getFixes());
    expect(q.getProfiles()).toEqual([bank]);
  });
});

describe("import", () => {
  it("stores the file, every column and distinct ids for identical rows", () => {
    const p = Project.create(SQL);
    const s = importFile(p, "bank_2024.csv", FILE, bank);
    expect(s).toMatchObject({ added: 3, alreadyImported: 0, problems: [] });
    const q = reopen(p);
    const rows = q.getSourceRows();
    expect(rows.map((r) => Object.keys(r.columns))).toEqual(Array(3).fill(["Päivä", "Summa", "Saaja", "Viesti", "Arkisto"]));
    expect(new Set(rows.map((r) => r.txId)).size).toBe(3);
    expect(q.getSourceFiles()).toMatchObject([{ name: "bank_2024.csv", rowCount: 3, profileId: "bank" }]);
    expect(q.getSourceFileBytes(1)).toEqual(FILE);
  });

  it("adds nothing for a repeated file and only new rows for an overlapping one", () => {
    const p = Project.create(SQL);
    importFile(p, "bank_1.csv", FILE, bank);
    expect(importFile(p, "bank_1-copy.csv", FILE, bank)).toMatchObject({ added: 0, alreadyImported: 3 });
    const later = csv(["1.2.2024;-5,00;Prisma;ruoka;A1", "4.2.2024;-9,00;Lidl;;A3"]);
    expect(importFile(p, "bank_2.csv", later, bank)).toMatchObject({ added: 1, alreadyImported: 1 });
    expect(p.counts()).toMatchObject({ sourceFiles: 2, rawRows: 4 });
  });

  it("re-derives fields when the profile changes, without re-import and with the same ids", () => {
    const p = Project.create(SQL);
    importFile(p, "bank.csv", FILE, bank);
    const before = p.getSourceRows();
    p.setProfiles([{ ...bank, columns: { ...bank.columns, description: ["Saaja", "Arkisto"] } }]);
    const after = reopen(p).getSourceRows();
    expect(after.map((r) => r.txId)).toEqual(before.map((r) => r.txId));
    expect(after[0]?.fields.description).toBe("Prisma A1");
  });

  it("flags rows that may duplicate earlier ones from a changed export format", () => {
    const p = Project.create(SQL);
    importFile(p, "bank.csv", FILE, bank);
    const changed = new TextEncoder().encode("Päivä;Summa;Saaja;Viesti\r\n3.2.2024;2000;Palkka;\r\n");
    const s = importFile(p, "bank_new.csv", changed, bank);
    expect(s.added).toBe(1);
    expect(s.possibleDuplicates).toHaveLength(1);
  });
});

describe("sample project", () => {
  it("builds the same ledger as the parity run", () => {
    const p = Project.create(SQL);
    const res = loadSample(p, sampleInputFromDisk());
    expect(res.unmatchedFixes).toBe(0);
    expect(res.imports.every((i) => i.alreadyImported === 0)).toBe(true);
    const rename = (s: string) => (s === "nordnet_salkkuraportti.csv" ? "nordnet_salkkuraportti_preprocessed.csv" : s);
    const key = (r: { rowId: string; sourceFile: string; amount: number; class: string; date: string }) =>
      JSON.stringify([r.rowId, rename(r.sourceFile), r.amount, r.class, r.date]);
    const q = reopen(p);
    expect(q.getLedger().map(key).sort()).toEqual(runSample().ledger.map(key).sort());
  });

  it("keeps every source column and the ledger through save and reload", () => {
    const p = Project.create(SQL);
    loadSample(p, sampleInputFromDisk());
    const q = reopen(p);
    expect(q.getSourceRows()).toEqual(p.getSourceRows());
    expect(q.getLedger()).toEqual(p.getLedger());
    expect(q.counts()).toEqual(p.counts());
  });

  it("gives an identical ledger on a full refresh with nothing changed", () => {
    const p = Project.create(SQL);
    loadSample(p, sampleInputFromDisk());
    const before = p.getLedger();
    rebuildLedger(p);
    expect(p.getLedger()).toEqual(before);
  });

  it("keeps the cached ledger the same as the stored one after a write of some months", () => {
    const p = Project.create(SQL);
    loadSample(p, sampleInputFromDisk());
    const ledger = p.getLedger();
    const month = ledger[ledger.length - 1]!.month;
    // one month's rows changed and one dropped, read back from the cache and from the file
    const changed = ledger.filter((r) => r.month === month).map((r) => ({ ...r, category: "muutettu" }));
    p.replaceLedger(changed.slice(1), new Set([month]));
    expect(p.getLedger()).toEqual(reopen(p).getLedger());
    expect(p.getLedger()).toHaveLength(ledger.length - 1);
  });
});

describe("ledger order of the cache", () => {
  const row = (date: string, rowId: string) => ({ date, rowId }) as Parameters<typeof ledgerOrder>[0];
  const sorted = (rows: ReturnType<typeof row>[]) => [...rows].sort(ledgerOrder).map((r) => r.rowId);

  it("orders row ids by code point, as SQLite does, not by locale", () => {
    // locale order puts "a" before "B"; code point order puts "B" first
    expect(sorted([row("2025-01-01", "a"), row("2025-01-01", "B")])).toEqual(["B", "a"]);
    // an astral character (U+1F600) sorts after U+FF5E by code point, but before it by UTF-16 unit
    expect(sorted([row("2025-01-01", "\u{1F600}"), row("2025-01-01", "\uFF5E")])).toEqual(["\uFF5E", "\u{1F600}"]);
  });

  it("orders newest date first", () => {
    expect(sorted([row("2025-01-01", "x"), row("2025-02-01", "y")])).toEqual(["y", "x"]);
  });
});
