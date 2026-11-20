// Tests the category list on an old project file (fixtures/projects/no-category-list.sql, made-up
// data): migration keeps every row, rename reaches every place that stores a name, delete only
// what nothing uses, and a new name saved in a rule joins the list.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { RESERVED_PATHS } from "../engine/reserved";
import {
  addCategory,
  categoryUse,
  deleteCategory,
  inUse,
  listOrMigration,
  migrationList,
  nodeKey,
  renameCategory,
  renameRefusal,
  rowCounts,
  syncCategories,
} from "./categories";
import { isEmptyDiff } from "../engine/diff";
import { previewLock, saveDraft, setLock } from "./service";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

const FIXTURE = resolve(__dirname, "../../fixtures/projects/no-category-list.sql");

/** The old project file as a file's bytes, opened as the app opens one. */
function oldProject(): Project {
  const db = new SQL.Database();
  db.exec(readFileSync(FIXTURE, "utf-8"));
  const bytes = db.export();
  db.close();
  return Project.open(SQL, bytes);
}

/** The old project with its migrated list saved, as after Tallenna luokkalista. */
function migrated(): Project {
  const p = oldProject();
  p.setSettings({ categories: migrationList(p, RESERVED_PATHS) });
  return p;
}

/** The project saved to its file bytes and opened again, as after a reload. */
const reopen = (p: Project) => Project.open(SQL, p.export());

const node = (cls: string, category: string, subCategory = "") => ({ class: cls, category, subCategory });

describe("an old project without a category list", () => {
  it("opens with no list, and every row, rule, fix and target as stored", () => {
    const p = oldProject();
    expect(p.getSettings().categories).toBeNull();
    expect(p.counts()).toEqual({ sourceFiles: 1, rawRows: 4, ledgerRows: 7, rules: 4 });
    expect(p.getFixes()).toHaveLength(1);
    expect(p.getTargets()).toHaveLength(1);
    expect(p.getSettings().lockedThrough).toBe("2025-01");
  });

  it("migrates to the categories in use plus the reserved names, and changes no row", () => {
    const p = oldProject();
    const ledger = JSON.stringify(p.getLedger());
    const list = migrationList(p, RESERVED_PATHS);
    expect(list).toEqual([
      { class: "menot", category: "ruoka", subCategories: ["kauppa"] },
      { class: "tulot", category: "ansiotulot", subCategories: ["palkka"] },
      { class: "menot", category: "ravintolat", subCategories: [] },
      { class: "tulot", category: "pääomatulot", subCategories: ["osinkotulot"] },
      { class: "menot", category: "kahvilat", subCategories: [] },
      { class: "varat", category: "sijoitusvarallisuus", subCategories: [] },
      { class: "velat", category: "sijoitusvelat", subCategories: [] },
    ]);
    p.setSettings({ categories: list });
    const again = Project.open(SQL, p.export());
    expect(again.getSettings().categories).toEqual(list);
    expect(JSON.stringify(again.getLedger())).toBe(ledger);
  });

  it("keeps no list while not migrated, even when rules are saved", () => {
    const p = oldProject();
    saveDraft(p, { rules: [...p.getRules(), { ...p.getRules()[0]!, id: "5", category: "uusi" }] });
    expect(p.getSettings().categories).toBeNull();
  });
});

describe("the category list", () => {
  it("counts the actual rows of each class, category and subcategory", () => {
    const counts = rowCounts(migrated());
    expect(counts.get(nodeKey(node("menot", "", "")))).toBe(2);
    expect(counts.get(nodeKey(node("menot", "ruoka")))).toBe(1);
    expect(counts.get(nodeKey(node("menot", "ruoka", "kauppa")))).toBe(1);
    expect(counts.get(nodeKey(node("varat", "sijoitusvarallisuus")))).toBeUndefined();
  });

  it("adds a name saved in a rule to the list", () => {
    const p = migrated();
    saveDraft(p, {
      rules: [...p.getRules(), { ...p.getRules()[0]!, id: "5", description: "apteekki", category: "terveys", subCategory: "lääkkeet" }],
    });
    expect(p.getSettings().categories).toContainEqual({ class: "menot", category: "terveys", subCategories: ["lääkkeet"] });
  });

  it("renames a category in rules, fixes, targets and the rows of every month, locked ones too", () => {
    const p = migrated();
    renameCategory(p, node("menot", "ruoka"), "Ruokaostokset");
    expect(p.getRules().find((r) => r.id === "1")?.category).toBe("Ruokaostokset");
    expect(p.getTargets()[0]?.category).toBe("Ruokaostokset");
    // January is locked: its rows get the new name too
    const jan = p.getLedger().filter((r) => r.month === "2025-01" && r.class === "menot");
    expect(jan.map((r) => r.category)).toEqual(["Ruokaostokset", "Ruokaostokset"]);
    expect(p.getLedger().some((r) => r.category === "ruoka")).toBe(false);
    expect(p.getSettings().categories).toContainEqual({ class: "menot", category: "Ruokaostokset", subCategories: ["kauppa"] });
    expect(p.getSettings().categories!.some((e) => e.category === "ruoka")).toBe(false);
  });

  it("renames a name that a fix sets, and a split fix's part", () => {
    const p = migrated();
    const tx = p.getFixes()[0]!.txId;
    renameCategory(p, node("menot", "kahvilat"), "kahvit");
    expect(p.getFixes()[0]).toEqual({ id: "1", txId: tx, category: "kahvit" });
    expect(p.getLedger().find((r) => r.txId === tx)?.category).toBe("kahvit");

    const salary = p.getLedger().find((r) => r.subCategory === "palkka")!.txId;
    p.setFixes([
      ...p.getFixes(),
      {
        id: "2",
        txId: salary,
        parts: [
          { amount: 2000, class: "tulot", category: "ansiotulot", subCategory: "palkka" },
          { amount: 500, class: "tulot", category: "ansiotulot", subCategory: "bonus" },
        ],
      },
    ]);
    renameCategory(p, node("tulot", "ansiotulot", "palkka"), "kuukausipalkka");
    expect(p.getFixes()[1]?.parts?.map((x) => x.subCategory)).toEqual(["kuukausipalkka", "bonus"]);
    expect(p.getRules().find((r) => r.id === "2")?.subCategory).toBe("kuukausipalkka");
  });

  it("does not rename to a name the parent already has, but allows a change of case", () => {
    const p = migrated();
    expect(() => renameCategory(p, node("menot", "ruoka"), "Ravintolat")).toThrow(/exists/);
    renameCategory(p, node("menot", "ruoka"), "Ruoka");
    expect(p.getRules()[0]?.category).toBe("Ruoka");
  });

  it("refuses to add a reserved name, in a new place too", () => {
    const p = migrated();
    expect(() => addCategory(p, node("menot", "ruoka", "osinkotulot"))).toThrow(/reserved/);
    expect(() => addCategory(p, node("varat", "sijoitusvarallisuus"))).toThrow(/reserved/);
    // the list trims names, so a padded name is checked as the trimmed one
    expect(() => addCategory(p, node("menot", "ruoka", " osinkotulot "))).toThrow(/reserved/);
    expect(() => addCategory(p, node("varat", " sijoitusvarallisuus "))).toThrow(/reserved/);
    expect(p.getSettings().categories!.some((e) => e.subCategories.includes("osinkotulot") && e.category === "ruoka")).toBe(false);
  });

  it("deletes only a node that nothing uses", () => {
    const p = migrated();
    addCategory(p, node("menot", "lemmikit"));
    addCategory(p, node("menot", "lemmikit", "ruoka"));
    expect(inUse(categoryUse(p, node("menot", "lemmikit")))).toBe(false);
    deleteCategory(p, node("menot", "lemmikit"));
    expect(p.getSettings().categories!.some((e) => e.category === "lemmikit")).toBe(false);

    // one transaction; the three monthly rows of the food target are counted apart
    expect(categoryUse(p, node("menot", "ruoka"))).toEqual({ rows: 1, targetRows: 3, rules: 1, fixes: 0, targets: 1 });
    expect(categoryUse(p, node("menot", "kahvilat"))).toEqual({ rows: 1, targetRows: 0, rules: 0, fixes: 1, targets: 0 });
    expect(() => deleteCategory(p, node("menot", "ruoka"))).toThrow(/in use/);
    expect(p.getSettings().categories).toContainEqual({ class: "menot", category: "ruoka", subCategories: ["kauppa"] });
  });

  it("refuses a rename to a name in use that a stale list lacks, and the open adds that name back", () => {
    const p = migrated();
    // an older FiRe saved the project without updating the list: kahvilat is used but not listed
    p.setSettings({ categories: p.getSettings().categories!.filter((e) => e.category !== "kahvilat") });
    expect(renameRefusal(p, node("menot", "ravintolat"), "kahvilat")).toBe("exists");
    expect(() => renameCategory(p, node("menot", "ravintolat"), "kahvilat")).toThrow(/exists/);
    expect(syncCategories(p)).toBe(true);
    expect(p.getSettings().categories).toContainEqual({ class: "menot", category: "kahvilat", subCategories: [] });
    expect(syncCategories(p)).toBe(false);
  });

  it("refuses a rename to a reserved name, which would move rows into a report figure", () => {
    const p = migrated();
    expect(renameRefusal(p, node("menot", "ruoka", "kauppa"), "Osinkotulot")).toBe("reserved");
    expect(() => renameCategory(p, node("menot", "ruoka", "kauppa"), "osinkotulot")).toThrow(/reserved/);
    expect(p.getRules()[0]?.subCategory).toBe("kauppa");
    // a reserved category belongs to its own class only
    expect(renameRefusal(p, node("tulot", "palkka"), "pääomatulot")).toBe("reserved");
    expect(renameRefusal(p, node("menot", "ravintolat"), "ansiotulot")).toBe("");
  });

  it("does not rename or delete a reserved name", () => {
    const p = migrated();
    expect(() => renameCategory(p, node("tulot", "pääomatulot"), "pääoma")).toThrow(/reserved/);
    expect(() => deleteCategory(p, node("varat", "sijoitusvarallisuus"))).toThrow(/reserved/);
    expect(p.getSettings().categories).toContainEqual({ class: "varat", category: "sijoitusvarallisuus", subCategories: [] });
  });

  it("counts and renames a fix whose transaction is not in the ledger by its own names", () => {
    const p = migrated();
    addCategory(p, node("menot", "lahjat"));
    p.setFixes([...p.getFixes(), { id: "9", txId: "no-such-transaction", category: "lahjat" }]);
    expect(categoryUse(p, node("menot", "lahjat")).fixes).toBe(1);
    expect(() => deleteCategory(p, node("menot", "lahjat"))).toThrow(/in use/);
    renameCategory(p, node("menot", "lahjat"), "lahjoitukset");
    expect(p.getFixes().find((f) => f.id === "9")?.category).toBe("lahjoitukset");
  });

  it("gives a renamed locked target row its new id, so the lock preview shows no change", () => {
    const p = migrated();
    renameCategory(p, node("menot", "ruoka"), "ruokaostokset");
    const jan = p.getLedger().find((r) => r.rowType === "Target" && r.month === "2025-01")!;
    expect(jan.rowId).toBe("target:Ruokabudjetti:oma:menot:ruokaostokset::2025-01");
    expect(isEmptyDiff(previewLock(p, ""))).toBe(true);
  });

  it("leaves a fix without a transaction alone when its category is in more than one class", () => {
    const p = migrated();
    addCategory(p, node("menot", "lahjat"));
    addCategory(p, node("tulot", "lahjat"));
    p.setFixes([...p.getFixes(), { id: "9", txId: "no-such-transaction", category: "lahjat" }]);
    expect(categoryUse(p, node("menot", "lahjat")).fixes).toBe(0);
    renameCategory(p, node("menot", "lahjat"), "lahjoitukset");
    expect(p.getFixes().find((f) => f.id === "9")?.category).toBe("lahjat");
  });

  it("counts the rows a removed target left in a locked month, so its category cannot be deleted", () => {
    const p = migrated();
    addCategory(p, node("menot", "budjetti"));
    const target = {
      name: "Budjetti",
      start: "2025-01-01",
      end: "2025-01-31",
      owner: "oma",
      monthlyAmount: -50,
      class: "menot",
      category: "budjetti",
      subCategory: "",
    };
    setLock(p, "");
    saveDraft(p, { targets: [...p.getTargets(), target] });
    setLock(p, "2025-01");
    saveDraft(p, { targets: p.getTargets().filter((x) => x.name !== "Budjetti") });
    expect(categoryUse(p, node("menot", "budjetti"))).toEqual({ rows: 0, targetRows: 1, rules: 0, fixes: 0, targets: 0 });
    expect(() => deleteCategory(p, node("menot", "budjetti"))).toThrow(/in use/);
  });
});

describe("a saved and reopened project", () => {
  it("saveDraft on the reopened project adds a new name to the list, and it survives another reopen", () => {
    const p = reopen(migrated());
    saveDraft(p, { rules: [...p.getRules(), { ...p.getRules()[0]!, id: "5", category: "uusi", subCategory: "" }] });
    expect(p.getSettings().categories).toContainEqual({ class: "menot", category: "uusi", subCategories: [] });
    const q = reopen(p);
    expect(q.getSettings().categories).toEqual(p.getSettings().categories);
    expect(q.getLedger()).toEqual(p.getLedger());
  });

  it("renameCategory on the reopened project renames everywhere, and the file holds the same after another reopen", () => {
    const p = reopen(migrated());
    renameCategory(p, node("menot", "ruoka"), "Ruokaostokset");
    const q = reopen(p);
    expect(q.getRules()).toEqual(p.getRules());
    expect(q.getTargets()).toEqual(p.getTargets());
    expect(q.getFixes()).toEqual(p.getFixes());
    expect(q.getLedger()).toEqual(p.getLedger());
    expect(q.getSettings().categories).toEqual(p.getSettings().categories);
    expect(q.getLedger().some((r) => r.category === "ruoka")).toBe(false);
    expect(q.getSettings().categories).toContainEqual({ class: "menot", category: "Ruokaostokset", subCategories: ["kauppa"] });
  });
});

describe("the list of a project not migrated yet", () => {
  it("is kept until the project changes, then built again", () => {
    const p = oldProject();
    const first = listOrMigration(p, RESERVED_PATHS);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every((e) => Object.isFrozen(e) && Object.isFrozen(e.subCategories))).toBe(true);
    expect(first).toEqual(migrationList(p, RESERVED_PATHS));
    expect(listOrMigration(p, RESERVED_PATHS)).toBe(first);
    saveDraft(p, { rules: [...p.getRules(), { ...p.getRules()[0]!, id: "5", category: "uusi", subCategory: "" }] });
    const next = listOrMigration(p, RESERVED_PATHS);
    expect(next).not.toBe(first);
    expect(next).toContainEqual({ class: "menot", category: "uusi", subCategories: [] });
    expect(next).toEqual(migrationList(p, RESERVED_PATHS));
  });
});
