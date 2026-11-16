// The settings draft: number typing, next ids, owner renames across every list, and the checks that
// block saving.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { Project } from "../../storage/project";
import { loadSqlJs } from "../../storage/sqljs";
import { moveRule, nextNumericId, parseNumber, validate, withRenames, type Draft } from "./model";

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

  it("blocks a rule without a condition (it would take every row), but an amount alone is a condition", () => {
    const p = Project.create(SQL);
    p.setSettings({ defaultOwner: "a" });
    const rule = { id: "1", account: "", description: "", info: "", amount: "any" as const, class: "menot", category: "", subCategory: "" };
    expect(validate(p, draft({ rules: [rule] }))).toContain("1");
    expect(validate(p, draft({ rules: [{ ...rule, description: "prisma" }] }))).toBe("");
    // v2's rule 0: every zero-sum row out
    expect(validate(p, draft({ rules: [{ ...rule, amount: "zero", class: "pois" }] }))).toBe("");
    // ".*" matches everything too
    expect(validate(p, draft({ rules: [{ ...rule, description: ".*" }] }))).toContain("1");
    // a rule saved like that before is not blocked again: only new or changed rules are asked
    p.setRules([rule]);
    expect(validate(p, draft({ rules: [rule] }))).toBe("");
    expect(validate(p, draft({ rules: [{ ...rule, class: "tulot" }] }))).toContain("1");
  });

  it("moves a rule to the start, to the end, or right after another rule", () => {
    const ids = (rs: { id: string }[]) => rs.map((r) => r.id).join("");
    const mk = () =>
      ["a", "b", "c", "d"].map((id) => ({
        id,
        account: "",
        description: id,
        info: "",
        amount: "any" as const,
        class: "menot",
        category: "",
        subCategory: "",
      }));
    let rs = mk();
    expect(moveRule(rs, 2, "start")).toBe(0);
    expect(ids(rs)).toBe("cabd");
    rs = mk();
    expect(moveRule(rs, 0, "end")).toBe(3);
    expect(ids(rs)).toBe("bcda");
    // after a rule below it, and after a rule above it
    rs = mk();
    expect(moveRule(rs, 0, { after: "c" })).toBe(2);
    expect(ids(rs)).toBe("bcad");
    rs = mk();
    expect(moveRule(rs, 3, { after: "a" })).toBe(1);
    expect(ids(rs)).toBe("adbc");
    rs = mk();
    expect(moveRule(rs, 1, { after: "x" })).toBe(-1);
    expect(ids(rs)).toBe("abcd");
  });
});
