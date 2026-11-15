// Reference values from the Power BI report on the sample data, owner mkk (see the plan's
// "Reference values for tests").
import { describe, expect, it } from "vitest";
import { runSample } from "../engine/testing/sampleData";
import { flowTotals, flowTree, monthlySeries } from "./flows";
import {
  ansiotulot,
  avg12,
  change12,
  kassaVuosina,
  menot,
  Model,
  nettovarallisuus,
  osinkotulot,
  paaomatulot,
  saasto,
  saastoPct,
  sijoitusvarallisuus,
  snapshotMonth,
  tulot,
  lastYear,
  balance,
  lastInvestmentMonth,
} from "./measures";
import { addMonths, latestMonth, monthsBetween, resolvePeriod, window12 } from "./period";

const m = new Model(runSample().ledger, "mkk");
const Y23 = { from: "2023-01", to: "2023-12" };
const Y24 = { from: "2024-01", to: "2024-12" };
const ALL = { from: "2023-01", to: "2024-12" };
const r0 = (x: number | null) => (x === null ? null : Math.round(x));
const k1 = (x: number | null) => (x === null ? null : Math.round(x / 100) / 10);

describe("periods", () => {
  it("adds months and resolves presets against the last data month", () => {
    expect(addMonths("2024-01", -1)).toBe("2023-12");
    expect(addMonths("2023-12", 13)).toBe("2025-01");
    expect(monthsBetween("2023-11", "2024-02")).toEqual(["2023-11", "2023-12", "2024-01", "2024-02"]);
    expect(window12("2024-01")).toEqual({ from: "2023-02", to: "2024-01" });
    expect(resolvePeriod("thisYear", "2023-01", "2024-12", { from: "", to: "" })).toEqual(Y24);
    expect(resolvePeriod("lastYear", "2023-01", "2024-12", { from: "", to: "" })).toEqual(Y23);
    expect(resolvePeriod("last12", "2023-01", "2024-06", { from: "", to: "" })).toEqual({ from: "2023-07", to: "2024-06" });
    expect(resolvePeriod("all", "2023-01", "2024-12", { from: "", to: "" })).toEqual(ALL);
    // a year in progress runs to the last month with data
    expect(resolvePeriod("thisYear", "2023-01", "2024-10", { from: "", to: "" })).toEqual({ from: "2024-01", to: "2024-10" });
  });
});

describe("Yhteenveto", () => {
  it.each([
    [Y23, 37653, 37200, 452, 13415, 24238, 64],
    [Y24, 37527, 37000, 527, 5522, 32005, 85],
    [ALL, 75180, 74200, 980, 18937, 56244, 75],
  ])("matches the report for %o", (p, t, a, po, me, s, pct) => {
    expect(r0(tulot(m, p))).toBe(t);
    expect(r0(ansiotulot(m, p))).toBe(a);
    expect(r0(paaomatulot(m, p))).toBe(po);
    expect(r0(menot(m, p))).toBe(me);
    expect(r0(saasto(m, p))).toBe(s);
    expect(r0((saastoPct(m, p) ?? 0) * 100)).toBe(pct);
  });

  it("year-end net worth and investments in thousands", () => {
    expect(snapshotMonth(m, Y23)).toBe("2023-12");
    expect(r0(nettovarallisuus(m, "2023-12") / 1000)).toBe(93);
    expect(k1(nettovarallisuus(m, "2024-12"))).toBe(80.5);
    expect(r0(sijoitusvarallisuus(m, "2023-12") / 1000)).toBe(74);
    expect(k1(sijoitusvarallisuus(m, "2024-12"))).toBe(56);
  });
});

describe("Tulot and Menot", () => {
  it("12-month averages and their change", () => {
    expect(r0(avg12(m, "2024-12", tulot))).toBe(3127);
    expect(r0(avg12(m, "2024-12", menot))).toBe(460);
    expect(r0(avg12(m, "2024-01", menot))).toBe(1034);
    expect(r0(change12(m, "2024-12", menot))).toBe(-658);
  });

  it("builds the Menot hierarchy for 2024", () => {
    const tree = flowTree(m, "menot", Y24);
    const ruoka = tree.find((n) => n.label === "ruoka")!;
    expect(r0(ruoka.amount)).toBe(5522);
    expect(ruoka.share).toBe(1);
    expect(r0(ruoka.change12)).toBe(-545);
    const leaves = ruoka.children.find((n) => n.label === "ruoka")!.children;
    expect(leaves.filter((n) => !n.inactive).map((n) => [n.label, r0(n.amount), r0(n.avg12)])).toEqual([
      ["Prisma", 5500, 458],
      ["S-MARKET", 22, 2],
    ]);
    expect(tree.find((n) => n.label === "media")?.inactive).toBe(true);
    expect(r0(flowTotals(m, "menot", Y24).change12)).toBe(-658);
  });

  it("monthly series against the previous year", () => {
    const s = monthlySeries(m, menot, Y24);
    expect(s.map((x) => r0(x.value))).toEqual([22, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500]);
    expect(r0(s[0]!.lastYear)).toBe(1025);
    expect(r0(s[11]!.avg12)).toBe(460);
  });
});

describe("Osingot", () => {
  it("dividends this year and last year; 12kk ka over the months with data", () => {
    expect(r0(osinkotulot(m, Y24))).toBe(527);
    expect(r0(lastYear(m, Y24, osinkotulot))).toBe(452);
    expect(r0(avg12(m, "2024-12", osinkotulot))).toBe(44);
  });
});

describe("Varat & Velat", () => {
  it("31.12.2024 against 30.11.2024", () => {
    expect(k1(balance(m, "2024-12", { class: "varat" }))).toBe(159);
    expect(k1(balance(m, "2024-11", { class: "varat" }))).toBe(157);
    expect(k1(balance(m, "2024-11", { category: "sijoitusvarallisuus" }))).toBe(55.3);
    expect(k1(balance(m, "2024-12", { category: "käteinen" }))).toBe(3);
    expect(k1(balance(m, "2024-11", { class: "velat" }))).toBe(-79);
    expect(k1(nettovarallisuus(m, "2024-11"))).toBe(78);
    expect(r0((kassaVuosina(m, "2024-12") ?? 0) * 10)).toBe(101);
    expect(r0((kassaVuosina(m, "2024-11") ?? 0) * 10)).toBe(84);
    expect(r0(balance(m, "2024-12", { subCategory: "osakkeet" }) / 1000)).toBe(24);
    expect(r0(balance(m, "2024-12", { subCategory: "osinkosalkku" }) / 1000)).toBe(32);
  });
});

describe("FiRe start month", () => {
  it("is the latest month with investments, not a later month without them", () => {
    const last = lastInvestmentMonth(m);
    expect(last).not.toBeNull();
    // a spending row after the last snapshot does not move the start
    const later = new Model(
      [
        ...runSample().ledger,
        {
          ...runSample().ledger.find((r) => r.class === "menot")!,
          rowId: "x",
          month: addMonths(m.lastMonth, 2),
          date: `${addMonths(m.lastMonth, 2)}-01`,
        },
      ],
      "mkk",
    );
    expect(later.lastMonth).toBe(addMonths(m.lastMonth, 2));
    expect(lastInvestmentMonth(later)).toBe(last);
  });
});

describe("latest month", () => {
  const nov15 = new Date(2026, 10, 15);
  it("is the last complete month, not a month in progress or ahead", () => {
    expect(latestMonth("2020-01", "2026-12", nov15)).toBe("2026-10");
    expect(latestMonth("2020-01", "2026-11", nov15)).toBe("2026-10");
  });
  it("is the last month with data when that is earlier", () => {
    expect(latestMonth("2020-01", "2025-06", nov15)).toBe("2025-06");
  });
  it("is the month in progress when every row is in it", () => {
    expect(latestMonth("2026-11", "2026-11", nov15)).toBe("2026-11");
  });
});
