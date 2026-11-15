// The CSV export writes final_data.csv line for line as v2 did (apart from the id column).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { csvField, ledgerToCsv, pyNumber, textCell } from "./exportCsv";
import { REPO, readText, runSample } from "./testing/sampleData";

// pandas wrote whole target amounts as "-500" (an int column after a concat); both read the same.
const withoutId = (line: string) => line.slice(0, line.lastIndexOf(",")).replace(/(?<=^|,)(-?\d+)\.0(?=,|$)/g, "$1");
const count = (lines: string[]) => {
  const m = new Map<string, number>();
  for (const l of lines) m.set(l, (m.get(l) ?? 0) + 1);
  return m;
};

describe("final_data.csv export", () => {
  it("writes numbers and fields as pandas did", () => {
    expect(pyNumber(500)).toBe("500.0");
    expect(pyNumber(-22.04)).toBe("-22.04");
    expect(pyNumber(1)).toBe("1.0");
    expect(pyNumber(0.5)).toBe("0.5");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("never writes a text cell a spreadsheet would run as a formula", () => {
    for (const v of ["=1+1", "+358", "-Prisma", "@SUM(A1)", "\tx"]) expect(textCell(v)).toBe(`'${v}`);
    expect(textCell("Prisma = ruoka")).toBe("Prisma = ruoka");
    expect(textCell("")).toBe("");
  });

  it("reproduces every dated line of the sample's final_data.csv", () => {
    const expected = readText(join(REPO, "data/final/final_data.csv"))
      .split(/\r?\n/)
      .filter((l) => l !== "");
    const actual = ledgerToCsv(runSample().ledger)
      .split("\n")
      .filter((l) => l !== "");
    expect(withoutId(actual[0]!)).toBe(withoutId(expected[0]!));
    // The three Nordnet rows with the impossible date 40.4.2024 are held back in v3 by design.
    const dated = expected.slice(1).filter((l) => !l.startsWith(","));
    expect(count(actual.slice(1).map(withoutId))).toEqual(count(dated.map(withoutId)));
  });
});
