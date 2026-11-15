// Sample-data parity: the engine over data/source_files + config/ must reproduce
// data/final/final_data.csv (every column except the id).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "./tables";
import { REPO, readText, runSample } from "./testing/sampleData";
import type { LedgerRow } from "./types";

function num(s: string): number {
  return s === "" ? 0 : Number(s);
}

function keyOf(r: {
  date: string;
  account: string;
  description: string;
  info: string;
  amountOriginal: number;
  class: string;
  category: string;
  subCategory: string;
  ruleId: string;
  sourceFile: string;
  rowType: string;
  share: number;
  amount: number;
  owner: string;
  split: boolean;
}): string {
  return JSON.stringify([
    r.date,
    r.account,
    r.description,
    r.info,
    r.amountOriginal.toFixed(6),
    r.class,
    r.category,
    r.subCategory,
    r.ruleId,
    r.sourceFile,
    r.rowType,
    r.share.toFixed(6),
    r.amount.toFixed(6),
    r.owner,
    r.split,
  ]);
}

function expectedKeys(): string[] {
  const t = parseCsv(readText(join(REPO, "data/final/final_data.csv")), { delimiter: "," });
  const col = (row: string[], name: string) => row[t.headers.indexOf(name)] ?? "";
  return t.rows.map((r) =>
    keyOf({
      date: col(r, "date"),
      account: col(r, "account"),
      description: col(r, "description"),
      info: col(r, "info"),
      amountOriginal: num(col(r, "amount_original")),
      class: col(r, "class"),
      category: col(r, "category"),
      subCategory: col(r, "sub_category"),
      ruleId: col(r, "rule_id"),
      sourceFile: col(r, "source_file"),
      rowType: col(r, "row_type"),
      share: num(col(r, "share")),
      amount: num(col(r, "amount")),
      owner: col(r, "owner"),
      split: col(r, "split") === "True",
    }),
  );
}

function multiset(keys: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
}

function difference(a: Map<string, number>, b: Map<string, number>): string[] {
  const out: string[] = [];
  for (const [k, n] of a) {
    const extra = n - (b.get(k) ?? 0);
    for (let i = 0; i < extra; i++) out.push(k);
  }
  return out;
}

describe("sample-data parity with final_data.csv", () => {
  const result = runSample();

  it("categorises every row and applies every fix", () => {
    expect(result.uncategorized).toEqual([]);
    expect(result.failedFixes).toEqual([]);
    expect(result.unmatchedFixes).toBe(0);
  });

  // The sample Nordnet report has a block dated "40.4.2024". Python kept those rows with an empty
  // date; v3 holds them back as invalid so Review can show them.
  it("holds back the rows with an invalid date", () => {
    expect(result.invalid.map((r) => [r.columns.date, r.fields.description])).toEqual([
      ["40.4.2024", "Arbor Realty Trust"],
      ["40.4.2024", "Bank Of Nova Scotia"],
      ["40.4.2024", "CubeSmart"],
    ]);
  });

  it("reproduces every dated row of final_data.csv", () => {
    const expected = multiset(expectedKeys().filter((k) => !k.startsWith('[""')));
    const actual = multiset(result.ledger.map((r: LedgerRow) => keyOf(r)));
    expect({ missing: difference(expected, actual), extra: difference(actual, expected) }).toEqual({
      missing: [],
      extra: [],
    });
  });

  it("gives every ledger row a unique id", () => {
    const ids = result.ledger.map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
