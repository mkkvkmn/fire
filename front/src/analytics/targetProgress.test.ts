// Target progress on the overview: each named target against the actual rows it covers.
import { describe, expect, it } from "vitest";
import { targetRows } from "../engine/targets";
import type { LedgerRow, Target } from "../engine/types";
import { Model, targetMatches, targetProgress } from "./measures";

function actual(month: string, cls: string, category: string, subCategory: string, amount: number, owner = "a"): LedgerRow {
  return {
    rowId: `${month}:${cls}:${category}:${subCategory}:${amount}`,
    txId: "",
    date: `${month}-15`,
    month,
    account: "pankki",
    description: "",
    info: "",
    amountOriginal: amount,
    class: cls,
    category,
    subCategory,
    ruleId: "",
    sourceFile: "x.csv",
    rowType: "Actual",
    share: 1,
    amount,
    owner,
    split: false,
  };
}

const target = (name: string, monthlyAmount: number, cls: string, category = "", subCategory = "", owner = "a"): Target => ({
  name,
  start: "2024-01-01",
  end: "2024-12-31",
  owner,
  monthlyAmount,
  class: cls,
  category,
  subCategory,
});

/** The report model and the target model the way ReportState builds them. */
function models(rows: LedgerRow[], targets: Target[], owner = "") {
  const t = targetRows(targets).map((r) => ({ ...r, rowType: "Actual" as const }));
  return { m: new Model(rows, owner), tm: new Model(t, owner) };
}

const Q1 = { from: "2024-01", to: "2024-03" };

describe("target progress", () => {
  const rows = [
    actual("2024-01", "tulot", "ansiotulot", "palkka", 3000),
    actual("2024-01", "tulot", "pääomatulot", "osinkotulot", 50),
    actual("2024-02", "tulot", "pääomatulot", "osinkotulot", 150),
    actual("2024-02", "menot", "ruoka", "", -400),
    actual("2024-03", "menot", "ruoka", "", -500),
    actual("2024-03", "menot", "asuminen", "", -800),
  ];

  it("compares a dividend target with dividends only, not with all savings", () => {
    const { m, tm } = models(rows, [target("Osingot", 100, "tulot", "pääomatulot", "osinkotulot")]);
    expect(targetProgress(m, tm, Q1)).toEqual([{ name: "Osingot", goal: 300, actual: 200, lowerIsBetter: false }]);
  });

  it("reads a target with income and spending lines as a savings target", () => {
    const { m, tm } = models(rows, [target("Säästö", 1000, "tulot"), target("Säästö", -500, "menot")]);
    // income 3200 - spending 1700 = 1500 saved, against (1000 - 500) * 3 = 1500
    expect(targetProgress(m, tm, Q1)).toEqual([{ name: "Säästö", goal: 1500, actual: 1500, lowerIsBetter: false }]);
  });

  it("marks a spending budget as lower is better, matching its category in any case", () => {
    const { m, tm } = models(rows, [target("Ruoka", -300, "menot", "Ruoka")]);
    expect(targetProgress(m, tm, Q1)).toEqual([{ name: "Ruoka", goal: -900, actual: -900, lowerIsBetter: true }]);
  });

  it("lists only targets with months in the period, sorted by name", () => {
    const late = { ...target("Vene", -100, "menot"), start: "2024-06-01" };
    const { m, tm } = models(rows, [target("Ruoka", -300, "menot", "ruoka"), late, target("Asunto", -800, "menot", "asuminen")]);
    expect(targetProgress(m, tm, Q1).map((t) => t.name)).toEqual(["Asunto", "Ruoka"]);
    expect(targetProgress(m, tm, { from: "2024-06", to: "2024-06" }).map((t) => t.name)).toEqual(["Asunto", "Ruoka", "Vene"]);
  });

  it("follows the chosen member", () => {
    const both = [...rows, actual("2024-01", "tulot", "pääomatulot", "osinkotulot", 999, "b")];
    const targets = [
      target("Osingot", 100, "tulot", "pääomatulot", "osinkotulot"),
      target("Osingot", 100, "tulot", "pääomatulot", "osinkotulot", "b"),
    ];
    const a = models(both, targets, "a");
    expect(targetProgress(a.m, a.tm, Q1)[0]).toMatchObject({ goal: 300, actual: 200 });
    const all = models(both, targets, "");
    expect(targetProgress(all.m, all.tm, Q1)[0]).toMatchObject({ goal: 600, actual: 1199 });
  });

  it("compares one member's target with that member's rows even when everyone is shown", () => {
    const both = [...rows, actual("2024-01", "tulot", "pääomatulot", "osinkotulot", 999, "b")];
    const { m, tm } = models(both, [target("Osingot", 100, "tulot", "pääomatulot", "osinkotulot", "a")], "");
    expect(targetProgress(m, tm, Q1)[0]).toMatchObject({ goal: 300, actual: 200 });
  });

  it("counts a line only in its own months", () => {
    const march = { ...target("Ruoka", -300, "menot", "ruoka"), start: "2024-03-01" };
    const { m, tm } = models(rows, [march]);
    // February's -400 is outside the target; March's -500 is in it
    expect(targetProgress(m, tm, Q1)[0]).toMatchObject({ goal: -300, actual: -500 });
  });

  it("lists the rows behind a target, the same rows the progress sums", () => {
    const { m, tm } = models(rows, [
      target("Säästö", 1000, "tulot"),
      target("Säästö", -500, "menot"),
      target("Ruoka", -300, "menot", "ruoka"),
    ]);
    const ruoka = targetMatches(m, tm, Q1, "Ruoka");
    expect(ruoka.map((r) => r.amount)).toEqual([-400, -500]);
    const saasto = targetMatches(m, tm, Q1, "Säästö");
    expect(saasto).toHaveLength(rows.length);
    expect(saasto.reduce((s, r) => s + r.amount, 0)).toBe(targetProgress(m, tm, Q1).find((g) => g.name === "Säästö")!.actual);
    expect(targetMatches(m, tm, Q1, "Ei ole")).toEqual([]);
  });

  it("lists the chosen member's rows behind a target, the same rows its progress sums", () => {
    const both = [...rows, actual("2024-01", "tulot", "pääomatulot", "osinkotulot", 999, "b")];
    const targets = [
      target("Osingot", 100, "tulot", "pääomatulot", "osinkotulot"),
      target("Osingot", 100, "tulot", "pääomatulot", "osinkotulot", "b"),
    ];
    const a = models(both, targets, "a");
    const listed = targetMatches(a.m, a.tm, Q1, "Osingot");
    expect(listed.every((r) => r.owner === "a")).toBe(true);
    expect(listed.reduce((s, r) => s + r.amount, 0)).toBe(targetProgress(a.m, a.tm, Q1)[0]!.actual);
  });

  it("is empty without targets", () => {
    const { m, tm } = models(rows, []);
    expect(targetProgress(m, tm, Q1)).toEqual([]);
  });
});
