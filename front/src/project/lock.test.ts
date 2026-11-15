// Locking and refresh tests: locked months never change automatically, late rows wait in Review,
// a refresh shows the exact diff.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { isLocked, mergeLocked, previousMonth } from "../engine/lock";
import { defaultProfile } from "../engine/profiles";
import type { Rule } from "../engine/types";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { sampleInputFromDisk } from "../engine/testing/sampleData";
import { loadSample } from "../engine/testing/sampleProject";
import {
  acceptLate,
  applyRefresh,
  ignoreLate,
  importFile,
  planRefresh,
  previewDraft,
  previewLock,
  rebuildLedger,
  reviewData,
  saveDraft,
  setLock,
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
const enc = (lines: string[]) => new TextEncoder().encode(lines.join("\n"));
const rule = (id: string, description: string, category: string): Rule => ({
  id,
  account: "",
  description,
  info: "",
  amount: "any",
  class: "menot",
  category,
  subCategory: "",
});

function setup(): Project {
  const p = Project.create(SQL);
  p.setSettings({ defaultOwner: "a" });
  p.setRules([rule("1", "Prisma", "ruoka")]);
  importFile(p, "bank.csv", enc(["Päivä;Summa;Saaja", "10.1.2024;-5,00;Prisma", "10.3.2024;-7,00;Prisma"]), bank);
  rebuildLedger(p);
  return p;
}

const category = (p: Project, month: string) => p.getLedger().find((r) => r.month === month)?.category;

describe("lock helpers", () => {
  it("compares months and finds last month", () => {
    expect(isLocked("2024-01", "2024-02")).toBe(true);
    expect(isLocked("2024-02", "2024-02")).toBe(true);
    expect(isLocked("2024-03", "2024-02")).toBe(false);
    expect(isLocked("2024-01", "")).toBe(false);
    expect(previousMonth(new Date(2025, 0, 15))).toBe("2024-12");
    expect(previousMonth(new Date(2025, 10, 13))).toBe("2025-10");
  });
  it("returns the computed ledger when nothing is locked", () => {
    expect(mergeLocked([], [], "")).toEqual({ ledger: [], late: [] });
  });
});

describe("locked periods", () => {
  it("a rule change touching both sides of the lock changes only open rows", () => {
    const p = setup();
    setLock(p, "2024-02");
    const draft = { rules: [rule("1", "Prisma", "ruoka"), rule("2", "Prisma", "kauppa")] };
    const diff = previewDraft(p, draft);
    expect(diff.changed.map((c) => c.after.month)).toEqual(["2024-03"]);
    saveDraft(p, draft);
    expect(category(p, "2024-01")).toBe("ruoka");
    expect(category(p, "2024-03")).toBe("kauppa");
  });

  it("unlocking brings the opened months up to date, with a preview first", () => {
    const p = setup();
    setLock(p, "2024-02");
    saveDraft(p, { rules: [rule("2", "Prisma", "kauppa")] });
    expect(previewLock(p, "").changed.map((c) => c.after.month)).toEqual(["2024-01"]);
    setLock(p, "");
    expect(category(p, "2024-01")).toBe("kauppa");
  });

  it("holds rows imported into a locked month as late rows until accepted", () => {
    const p = setup();
    setLock(p, "2024-02");
    importFile(p, "bank_2.csv", enc(["Päivä;Summa;Saaja", "20.2.2024;-9,00;Prisma", "20.4.2024;-3,00;Prisma"]), bank);
    rebuildLedger(p);
    const late = reviewData(p).late;
    expect(late.map((r) => r.fields.date)).toEqual(["2024-02-20"]);
    expect(p.getLedger().some((r) => r.date === "2024-02-20")).toBe(false);
    expect(p.getLedger().some((r) => r.date === "2024-04-20")).toBe(true);
    acceptLate(p, new Set([late[0]!.txId]));
    expect(p.getLedger().some((r) => r.date === "2024-02-20")).toBe(true);
    expect(reviewData(p).late).toEqual([]);
  });

  it("can leave a late row out", () => {
    const p = setup();
    setLock(p, "2024-02");
    importFile(p, "bank_2.csv", enc(["Päivä;Summa;Saaja", "20.2.2024;-9,00;Prisma"]), bank);
    rebuildLedger(p);
    ignoreLate(
      p,
      reviewData(p).late.map((r) => r.txId),
    );
    rebuildLedger(p);
    expect(reviewData(p).late).toEqual([]);
    expect(p.getLedger().some((r) => r.date === "2024-02-20")).toBe(false);
  });

  it("does not list uncategorised rows of locked months", () => {
    const p = setup();
    importFile(p, "bank_2.csv", enc(["Päivä;Summa;Saaja", "20.1.2024;-9,00;Lidl", "20.4.2024;-3,00;Lidl"]), bank);
    rebuildLedger(p);
    setLock(p, "2024-02");
    expect(reviewData(p).uncategorized.map((r) => r.fields.date)).toEqual(["2024-04-20"]);
  });
});

describe("refresh", () => {
  it("a full refresh with no changes gives an empty diff", () => {
    const p = Project.create(SQL);
    loadSample(p, sampleInputFromDisk());
    setLock(p, "2024-06");
    const plan = planRefresh(p);
    expect(plan.diff.added).toEqual([]);
    expect(plan.diff.removed).toEqual([]);
    expect(plan.diff.changed).toEqual([]);
  });

  it("a full refresh after a rule change gives the exact diff, locked months included", () => {
    const p = setup();
    setLock(p, "2024-02");
    saveDraft(p, { rules: [rule("2", "Prisma", "kauppa")] });
    const plan = planRefresh(p);
    expect(plan.diff.changed.map((c) => [c.after.month, c.fields])).toEqual([["2024-01", ["category"]]]);
    expect(plan.diff.months).toEqual([{ month: "2024-01", added: 0, removed: 0, changed: 1, amountDelta: 0 }]);
    applyRefresh(p, plan);
    expect(category(p, "2024-01")).toBe("kauppa");
  });

  it("a period refresh replaces only the chosen months", () => {
    const p = setup();
    importFile(p, "bank_2.csv", enc(["Päivä;Summa;Saaja", "10.2.2024;-1,00;Prisma"]), bank);
    rebuildLedger(p);
    setLock(p, "2024-03");
    saveDraft(p, { rules: [rule("2", "Prisma", "kauppa")] });
    const plan = planRefresh(p, "2024-02", "2024-03");
    expect(plan.diff.changed.map((c) => c.after.month).sort()).toEqual(["2024-02", "2024-03"]);
    applyRefresh(p, plan);
    expect(category(p, "2024-01")).toBe("ruoka");
    expect(category(p, "2024-02")).toBe("kauppa");
  });
});

describe("fixes and the lock", () => {
  it("refuses fix changes that touch a locked month", async () => {
    const { lockedFixChanges } = await import("./service");
    const p = setup();
    setLock(p, "2024-02");
    const jan = p.getLedger().find((r) => r.month === "2024-01")!;
    const mar = p.getLedger().find((r) => r.month === "2024-03")!;
    expect(lockedFixChanges(p, [{ id: "1", txId: jan.txId, category: "x" }])).toEqual(["1"]);
    expect(lockedFixChanges(p, [{ id: "1", txId: mar.txId, category: "x" }])).toEqual([]);
    expect(lockedFixChanges(p, [{ id: "1", txId: mar.txId, date: "2024-01-05" }])).toEqual(["1"]);
  });
});
