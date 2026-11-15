// The settings draft: number typing, next ids, owner renames across every list, and the checks that
// block saving.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { Project } from "../../storage/project";
import { loadSqlJs } from "../../storage/sqljs";
import { nextNumericId, parseNumber, validate, withRenames, type Draft } from "./model";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

const draft = (patch: Partial<Draft> = {}): Draft => ({
  revision: 0,
  rules: [],
  splits: [],
  fixes: [],
  targets: [],
  defaultOwner: "a",
  accountOwners: {},
  renames: {},
  ...patch,
});

describe("settings draft", () => {
  it("reads numbers as typed in Finnish or English", () => {
    expect(parseNumber("1 234,5")).toBe(1234.5);
    expect(parseNumber("−5")).toBe(-5);
    expect(parseNumber("")).toBeNaN();
  });

  it("gives the next free numeric id, ignoring other ids", () => {
    expect(nextNumericId(["1", "7", "k-x"])).toBe("8");
    expect(nextNumericId([])).toBe("1");
  });

  it("renames a member everywhere: splits, targets, fixes, account owners and the default", () => {
    const d = draft({
      defaultOwner: "a",
      accountOwners: { pankki: "a" },
      splits: [{ start: "2024-01-01", end: "2024-12-31", account: "pankki", share: 0.5, owner: "a" }],
      fixes: [{ id: "1", txId: "t", owner: "a" }],
      targets: [
        { name: "x", start: "2024-01-01", end: "2024-12-31", owner: "a", monthlyAmount: 1, class: "menot", category: "", subCategory: "" },
      ],
      renames: { a: "b" },
    });
    const r = withRenames(d);
    expect([r.defaultOwner, r.accountOwners?.pankki, r.splits?.[0]?.owner, r.fixes?.[0]?.owner, r.targets?.[0]?.owner]).toEqual([
      "b",
      "b",
      "b",
      "b",
      "b",
    ]);
  });

  it("blocks saving a split with a wrong date or share", () => {
    const p = Project.create(SQL);
    p.setSettings({ defaultOwner: "a" });
    const split = { start: "2024-01-01", end: "2024-12-31", account: "pankki", share: 0.5, owner: "a" };
    expect(validate(p, draft({ splits: [split] }))).toBe("");
    expect(validate(p, draft({ splits: [{ ...split, start: "1.1.2024" }] }))).not.toBe("");
    expect(validate(p, draft({ splits: [{ ...split, share: 1.5 }] }))).not.toBe("");
  });
});
