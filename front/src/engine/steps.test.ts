// Tests for categorise, split, fix, targets, diff and duplicates (mirrors test_s_04 to test_s_10).
import { describe, expect, it } from "vitest";
import { categorizeRow, compileRules, decidedTransactions, matchingRules, RuleError } from "./categorize";
import { diffLedger, isEmptyDiff } from "./diff";
import { decisionKey, findPossibleDuplicates } from "./duplicates";
import { applyFixes, fixOf } from "./fix";
import { processRows } from "./pipeline";
import { splitParts } from "./split";
import { monthEnds, targetRows } from "./targets";
import type { LedgerRow, Rule, SourceRow } from "./types";

function rule(r: Partial<Rule> & Pick<Rule, "id">): Rule {
  return { account: "", description: "", info: "", amount: "any", class: "", category: "", subCategory: "", ...r };
}

function source(over: Partial<SourceRow["fields"]> & { txId?: string; hash?: string } = {}): SourceRow {
  const { txId = "h-1", hash = "h", ...fields } = over;
  return {
    txId,
    contentHash: hash,
    occurrence: 1,
    sourceFile: "f.csv",
    columns: {},
    fields: { date: "2023-05-31", account: "acc", description: "d", info: "", amount: 10, ...fields },
  };
}

function ledgerRow(over: Partial<LedgerRow> = {}): LedgerRow {
  return {
    rowId: "t-1",
    txId: "t-1",
    date: "2023-05-31",
    month: "2023-05",
    account: "acc",
    description: "Arbor Realty Trust",
    info: "",
    amountOriginal: 100,
    class: "varat",
    category: "c",
    subCategory: "",
    ruleId: "10",
    sourceFile: "f.csv",
    rowType: "Actual",
    share: 1,
    amount: 100,
    owner: "mkk",
    split: false,
    ...over,
  };
}

describe("rows a rule decides", () => {
  it("gives each transaction to the last rule that matches it, and none to a row without an amount", () => {
    const compiled = compileRules([
      rule({ id: "1", description: "prisma", class: "menot", category: "ruoka" }),
      rule({ id: "2", description: "prisma kassi", class: "menot", category: "muut" }),
    ]);
    const rows = [
      source({ txId: "a", description: "Prisma Kassi" }),
      source({ txId: "b", description: "Prisma" }),
      source({ txId: "c", description: "Prisma", amount: null }),
      source({ txId: "d", description: "Lidl" }),
    ];
    const by = decidedTransactions(compiled, rows);
    expect([...(by.get("1") ?? [])]).toEqual(["b"]);
    expect([...(by.get("2") ?? [])]).toEqual(["a"]);
  });
});

describe("categorize", () => {
  const rules = compileRules([
    rule({
      id: "3",
      account: "luottokortti",
      description: "Netflix",
      info: "MEMBER ORGANIZATIONS - DEF",
      amount: "neg",
      class: "menot",
      category: "media",
      subCategory: "suoratoisto",
    }),
    rule({
      id: "8",
      account: "luottokortti",
      description: "Spotify",
      info: "DIGITAL GOODS – LARGE DIGITAL GOODS MERCHANT",
      amount: "neg",
      class: "menot",
      category: "media",
      subCategory: "musiikki",
    }),
  ]);

  it("categorises the pytest rows", () => {
    expect(
      categorizeRow(rules, { account: "luottokortti", description: "Netflix", info: "MEMBER ORGANIZATIONS - DEF", amount: -11.65 }),
    ).toEqual({
      ruleId: "3",
      class: "menot",
      category: "media",
      subCategory: "suoratoisto",
    });
    expect(
      categorizeRow(rules, {
        account: "luottokortti",
        description: "Spotify",
        info: "DIGITAL GOODS – LARGE DIGITAL GOODS MERCHANT",
        amount: -12.99,
      })?.subCategory,
    ).toBe("musiikki");
  });

  it("is case-insensitive, searches anywhere and checks the sign", () => {
    expect(
      categorizeRow(rules, { account: "LUOTTOKORTTI-2", description: "my netflix", info: "member organizations - def", amount: -1 })
        ?.ruleId,
    ).toBe("3");
    expect(
      categorizeRow(rules, { account: "luottokortti", description: "Netflix", info: "MEMBER ORGANIZATIONS - DEF", amount: 5 }),
    ).toBeNull();
  });

  it("lets the last matching rule win", () => {
    const c = compileRules([rule({ id: "a", class: "x" }), rule({ id: "b", description: "prisma", class: "y" })]);
    expect(categorizeRow(c, { account: "", description: "Prisma", info: "", amount: 1 })?.ruleId).toBe("b");
    expect(categorizeRow(c, { account: "", description: "Lidl", info: "", amount: 1 })?.ruleId).toBe("a");
    expect(matchingRules(c, { account: "", description: "Prisma", info: "", amount: 1 })).toEqual(["a", "b"]);
  });

  it("matches zero amounts and treats * as match-all", () => {
    const c = compileRules([rule({ id: "0", description: "*", amount: "zero", class: "pois" })]);
    expect(categorizeRow(c, { account: "", description: "", info: "", amount: 0 })?.class).toBe("pois");
  });

  it("reports an invalid pattern with its rule id", () => {
    expect(() => compileRules([rule({ id: "bad", description: "(" })])).toThrow(RuleError);
  });
});

describe("split", () => {
  const splits = [
    { start: "2023-06-01", end: "2024-12-31", account: "nordnet_salkkuraportti", share: 0.5, owner: "mkk" },
    { start: "2023-06-01", end: "2024-12-31", account: "nordnet_salkkuraportti", share: 0.5, owner: "mrs. mkk" },
  ];

  it("keeps rows outside the split dates whole", () => {
    expect(splitParts("nordnet_salkkuraportti", "2023-05-31", splits, "mkk")).toEqual([{ owner: "mkk", share: 1, split: false }]);
  });

  it("splits rows within the dates between owners (pytest values)", () => {
    const res = processRows(
      [
        source({ account: "nordnet_salkkuraportti", date: "2023-05-31", amount: 7080.47, txId: "a-1" }),
        source({ account: "nordnet_salkkuraportti", date: "2023-11-30", amount: 6879.18, txId: "b-1" }),
      ],
      { rules: [rule({ id: "10", class: "varat" })], splits, fixes: [], targets: [], defaultOwner: "mkk" },
    );
    expect(res.ledger.map((r) => [r.rowId, r.owner, r.share, r.amount, r.split])).toEqual([
      ["a-1", "mkk", 1, 7080.47, false],
      ["b-1:mkk", "mkk", 0.5, 3439.59, true],
      ["b-1:mrs. mkk", "mrs. mkk", 0.5, 3439.59, true],
    ]);
  });
});

describe("fix", () => {
  it("overrides only the fields a fix sets", () => {
    const rows = [ledgerRow({ txId: "t-1" }), ledgerRow({ rowId: "t-2", txId: "t-2" })];
    const res = applyFixes(rows, [{ id: "f1", txId: "t-1", description: "Updated Description", amount: 7000 }]);
    expect(res.failed).toEqual([]);
    expect(res.rows[0]).toMatchObject({ description: "Updated Description", amount: 7000, ruleId: "f1", class: "varat" });
    expect(res.rows[1]).toEqual(rows[1]);
  });

  it("moves the month with the date", () => {
    const res = applyFixes([ledgerRow()], [{ id: "f", txId: "t-1", date: "2023-04-30" }]);
    expect(res.rows[0]).toMatchObject({ date: "2023-04-30", month: "2023-04" });
  });

  it("returns fixes that match no row", () => {
    const res = applyFixes(
      [ledgerRow()],
      [
        { id: "f1", txId: "t-1" },
        { id: "f2", txId: "nope" },
      ],
    );
    expect(res.failed.map((f) => f.id)).toEqual(["f2"]);
  });

  it("applies to one owner's split row when the fix names the owner", () => {
    const rows = [ledgerRow({ rowId: "t-1:a", owner: "a", split: true }), ledgerRow({ rowId: "t-1:b", owner: "b", split: true })];
    const res = applyFixes(rows, [{ id: "f", txId: "t-1", owner: "b", class: "pois" }]);
    expect(res.rows.map((r) => r.class)).toEqual(["varat", "pois"]);
  });

  it("splits one transaction into parts, each with its own class", () => {
    const rows = [ledgerRow({ amount: -64.15, amountOriginal: -64.15 }), ledgerRow({ rowId: "t-2", txId: "t-2" })];
    const parts = [
      { amount: -44.15, class: "menot", category: "ruoka", subCategory: "ruoka" },
      { amount: -20, class: "menot", category: "muut", subCategory: "lahjat" },
    ];
    const res = applyFixes(rows, [{ id: "k1", txId: "t-1", parts }]);
    expect(res.rows.map((r) => [r.rowId, r.amount, r.category, r.ruleId])).toEqual([
      ["t-1#1", -44.15, "ruoka", "k1"],
      ["t-1#2", -20, "muut", "k1"],
      ["t-2", rows[1]!.amount, rows[1]!.category, rows[1]!.ruleId],
    ]);
  });

  it("splits a member-split transaction by share, or gives a part to one member", () => {
    const rows = [
      ledgerRow({ rowId: "t-1:a", owner: "a", share: 0.5, amount: -50, amountOriginal: -100, split: true }),
      ledgerRow({ rowId: "t-1:b", owner: "b", share: 0.5, amount: -50, amountOriginal: -100, split: true }),
    ];
    const parts = [
      { amount: -60, class: "menot", category: "ruoka", subCategory: "" },
      { amount: -40, class: "menot", category: "lahjat", subCategory: "", owner: "b" },
    ];
    const res = applyFixes(rows, [{ id: "k", txId: "t-1", parts }]);
    expect(res.rows.map((r) => [r.owner, r.amount, r.category])).toEqual([
      ["a", -30, "ruoka"],
      ["b", -30, "ruoka"],
      ["b", -40, "lahjat"],
    ]);
    expect(new Set(res.rows.map((r) => r.rowId)).size).toBe(3);
  });

  it("finds a row's fix by transaction, not by an id a rule can share", () => {
    // rule 1 decides t-2; fix 1 changes t-1: both rows carry ruleId "1"
    const rows = [ledgerRow({ txId: "t-1" }), ledgerRow({ rowId: "t-2", txId: "t-2", ruleId: "1" })];
    const fixes = [{ id: "1", txId: "t-1", class: "pois" }];
    const out = applyFixes(rows, fixes).rows;
    expect(out.map((r) => r.ruleId)).toEqual(["1", "1"]);
    expect(out.map((r) => fixOf(r, fixes)?.id)).toEqual(["1", undefined]);
  });

  it("finds a member's fix only on that member's row, and a split's fix on its parts", () => {
    const rows = [ledgerRow({ rowId: "t-1:a", owner: "a", split: true }), ledgerRow({ rowId: "t-1:b", owner: "b", split: true })];
    const one = [{ id: "f", txId: "t-1", owner: "b", class: "pois" }];
    expect(applyFixes(rows, one).rows.map((r) => fixOf(r, one)?.id)).toEqual([undefined, "f"]);
    const parts = [{ id: "k", txId: "t-1", parts: [{ amount: -1, class: "menot", category: "x", subCategory: "", owner: "a" }] }];
    expect(applyFixes(rows, parts).rows.map((r) => fixOf(r, parts)?.id)).toEqual(["k"]);
  });
});

describe("targets", () => {
  it("gives month ends like pandas date_range(freq='M')", () => {
    expect(monthEnds("2023-01-01", "2023-03-31")).toEqual(["2023-01-31", "2023-02-28", "2023-03-31"]);
    expect(monthEnds("2023-01-15", "2023-02-27")).toEqual(["2023-01-31"]);
    expect(monthEnds("2024-02-01", "2024-02-29")).toEqual(["2024-02-29"]);
  });

  it("builds target rows (pytest values)", () => {
    const rows = targetRows([
      {
        name: "Säästötavoite 1",
        start: "2023-01-01",
        end: "2023-12-31",
        owner: "mkk",
        monthlyAmount: 500,
        class: "menot",
        category: "",
        subCategory: "",
      },
    ]);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({
      date: "2023-01-31",
      account: "Target",
      description: "Säästötavoite 1",
      amountOriginal: 500,
      class: "menot",
      ruleId: "Säästötavoite 1",
      sourceFile: "targets.csv",
      rowType: "Target",
      share: 1,
      amount: 500,
      owner: "mkk",
      split: false,
    });
    expect(new Set(rows.map((r) => r.rowId)).size).toBe(12);
  });
});

describe("diff", () => {
  it("is empty for identical ledgers", () => {
    expect(isEmptyDiff(diffLedger([ledgerRow()], [ledgerRow()]))).toBe(true);
  });

  it("reports added, removed and changed rows per month", () => {
    const before = [ledgerRow(), ledgerRow({ rowId: "gone", month: "2023-06", amount: 5 })];
    const after = [ledgerRow({ category: "other" }), ledgerRow({ rowId: "new", month: "2023-07", amount: 7 })];
    const d = diffLedger(before, after);
    expect(d.added.map((r) => r.rowId)).toEqual(["new"]);
    expect(d.removed.map((r) => r.rowId)).toEqual(["gone"]);
    expect(d.changed.map((c) => [c.rowId, c.fields])).toEqual([["t-1", ["category"]]]);
    expect(d.months).toEqual([
      { month: "2023-05", added: 0, removed: 0, changed: 1, amountDelta: 0 },
      { month: "2023-06", added: 0, removed: 1, changed: 0, amountDelta: -5 },
      { month: "2023-07", added: 1, removed: 0, changed: 0, amountDelta: 7 },
    ]);
  });
});

describe("possible duplicates", () => {
  it("finds rows with the same account, date, amount and description but a different hash", () => {
    const old = source({ txId: "old-1", hash: "old", description: "Prisma" });
    const fresh = source({ txId: "new-1", hash: "new", description: "PRISMA" });
    const other = source({ txId: "x-1", hash: "x", description: "Lidl" });
    const found = findPossibleDuplicates([fresh, other], [old]);
    expect(found.map((c) => [c.newRow.txId, c.existing.map((e) => e.txId)])).toEqual([["new-1", ["old-1"]]]);
    expect(findPossibleDuplicates([fresh], [old], new Set([decisionKey("new-1", "old-1")]))).toEqual([]);
  });

  it("ignores identical hashes and zero amounts", () => {
    expect(findPossibleDuplicates([source()], [source({ txId: "h-2" })])).toEqual([]);
    expect(findPossibleDuplicates([source({ amount: 0, hash: "a" })], [source({ amount: 0 })])).toEqual([]);
  });
});
