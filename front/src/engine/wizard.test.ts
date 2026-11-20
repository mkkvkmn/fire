// Tests for presets, profile guessing, rule drafts and project-wide duplicate groups.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { amountMatchOf, categorizeRow, compileRules, escapeRegex, nextRuleId, ruleFromRow } from "./categorize";
import { decisionKey, findDuplicateGroups } from "./duplicates";
import { guessDateFormat, guessDecimal, guessProfile, patternFromFileName } from "./guess";
import { PRESETS } from "./presets";
import { matchProfile } from "./profiles";
import { readSourceRows, readTable } from "./read";
import { SOURCE_DIR, readBytes, sampleFiles, sampleProfiles } from "./testing/sampleData";
import type { SourceRow } from "./types";

describe("presets", () => {
  it("equal the v2 sample profiles they replace", () => {
    const pick = (p: (typeof PRESETS)[number]) => ({
      columns: p.columns,
      delimiter: p.delimiter,
      dateFormats: p.dateFormats,
      account: p.account,
    });
    for (const v2 of sampleProfiles()) {
      const preset = PRESETS.find((p) => p.account === v2.account || (v2.account === "nordnet_salkkuraportti" && p.preprocessor));
      if (!preset) continue;
      expect(pick(preset)).toEqual(pick(v2));
    }
    expect(PRESETS.filter((p) => p.id !== "preset-fire-standard")).toHaveLength(6);
  });

  it("read the sample files to the same fields as the v2 profiles", () => {
    for (const f of sampleFiles()) {
      if (f.profile.account === "nordnet_salkkuraportti") continue;
      const preset = matchProfile(f.fileName, PRESETS);
      if (!preset) continue;
      const a = readSourceRows(f.fileName, f.table, f.profile).rows.map((r) => r.fields);
      const b = readSourceRows(f.fileName, f.table, preset).rows.map((r) => r.fields);
      expect(b).toEqual(a);
    }
  });

  it("reads the raw Nordnet report through the preprocessor", () => {
    const preset = PRESETS.find((p) => p.preprocessor === "nordnet-portfolio")!;
    const bytes = readBytes(join(SOURCE_DIR, "for_preprocessors/nordnet/nordnet_salkkuraportti.csv"));
    const rows = readSourceRows("nordnet_salkkuraportti.csv", readTable("nordnet_salkkuraportti.csv", bytes, preset), preset).rows;
    expect(rows).toHaveLength(80);
  });
});

describe("guessing a profile", () => {
  it("guesses date formats and decimal separators", () => {
    expect(guessDateFormat(["1.6.2023", "29.12.2023"])).toBe("%d.%m.%Y");
    expect(guessDateFormat(["2024/01/24"])).toBe("%Y/%m/%d");
    expect(guessDateFormat(["2023-03-31 22:28:30.234000", "2023-03-30 00:00:00"])).toBe("%Y-%m-%d %H:%M:%S.%f|%Y-%m-%d %H:%M:%S");
    expect(guessDateFormat(["hello"])).toBeNull();
    expect(guessDecimal(["-22,04", "100"])).toBe(",");
    expect(guessDecimal(["-11.65", "-0.99"])).toBe(".");
  });

  it("maps the sample bank exports like their v2 profiles", () => {
    for (const name of ["s-pankki_2023_07-2023_12.csv", "nordea.csv", "luottokortti.xlsx", "osingot-2023-2024.csv"]) {
      const f = sampleFiles().find((x) => x.fileName === name)!;
      const g = guessProfile(f.table);
      expect([name, g.columns.date, g.columns.amount]).toEqual([name, f.profile.columns.date, f.profile.columns.amount]);
      const rows = readSourceRows(name, f.table, { ...f.profile, ...g }).rows;
      expect(rows.every((r) => r.fields.date !== null && r.fields.amount !== null)).toBe(true);
    }
  });

  it("makes a file name pattern", () => {
    expect(patternFromFileName("s-pankki_2024_01-2024_12.csv")).toBe("s-pankki");
    expect(patternFromFileName("osingot-2023-2024.csv")).toBe("osingot");
    expect(patternFromFileName("tulot.csv")).toBe("tulot");
    expect(patternFromFileName("2024.csv")).toBe("2024");
  });
});

describe("rule drafts", () => {
  it("matches the row it was made from and the next free id", () => {
    const row = { account: "s-pankki", description: "K-Market (Kamppi)", info: "", amount: -3.2 };
    const rule = { ...ruleFromRow(row, nextRuleId([{ ...ruleFromRow(row, "25") }])), class: "menot" };
    expect(rule).toMatchObject({ id: "26", description: "K-Market \\(Kamppi\\)", amount: "neg" });
    expect(categorizeRow(compileRules([rule]), row)?.ruleId).toBe("26");
    expect(escapeRegex("a.b*c")).toBe("a\\.b\\*c");
  });

  it("takes the amount match of a group from its rows: one sign, else any", () => {
    expect(amountMatchOf([-3, -4])).toBe("neg");
    expect(amountMatchOf([3, 4])).toBe("pos");
    // a purchase and its refund: total 0, but the rule must still hit both rows
    expect(amountMatchOf([5, -5])).toBe("any");
    // mixed signs with a non-zero total
    expect(amountMatchOf([-10, -10, 4])).toBe("any");
    expect(amountMatchOf([null])).toBe("any");
    const rows = [
      { account: "a", description: "Shop", info: "", amount: 5 },
      { account: "a", description: "Shop", info: "", amount: -5 },
    ];
    const rule = { ...ruleFromRow({ ...rows[0]!, amountMatch: amountMatchOf(rows.map((r) => r.amount)) }, "1"), class: "menot" };
    expect(rows.map((r) => categorizeRow(compileRules([rule]), r)?.ruleId)).toEqual(["1", "1"]);
  });

  it("carries the info (lisätieto) of the row into the draft", () => {
    const row = { account: "s-pankki", description: "Korttiosto", info: "Example Oy 1234567-8", amount: -9 };
    expect(ruleFromRow(row, "1")).toMatchObject({ description: "Korttiosto", info: "Example Oy 1234567-8" });
  });

  it("matches on info alone: only rows with that info, whatever the description", () => {
    const rule = {
      id: "7",
      account: "",
      description: "",
      info: "example oy",
      amount: "any" as const,
      class: "menot",
      category: "Food",
      subCategory: "",
    };
    const compiled = compileRules([rule]);
    const row = (info: string) => ({ account: "a", description: "Korttiosto", info, amount: -5 });
    expect(categorizeRow(compiled, row("EXAMPLE OY 1234567-8"))?.ruleId).toBe("7");
    expect(categorizeRow(compiled, row("Other Ab"))).toBeNull();
  });
});

describe("duplicate groups", () => {
  const row = (txId: string, hash: string, description = "Prisma"): SourceRow => ({
    txId,
    contentHash: hash,
    occurrence: 1,
    sourceFile: "f",
    columns: {},
    fields: { date: "2024-01-01", account: "a", description, info: "", amount: -5 },
  });

  it("groups rows with the same key but different hashes until decided", () => {
    const rows = [row("a-1", "a"), row("b-1", "b"), row("a-2", "a"), row("c-1", "c", "Lidl")];
    expect(findDuplicateGroups(rows).map((g) => g.map((r) => r.txId))).toEqual([["a-1", "b-1", "a-2"]]);
    const decided = new Set([decisionKey("a-1", "b-1"), decisionKey("a-2", "b-1")]);
    expect(findDuplicateGroups(rows, decided)).toEqual([]);
  });
});
