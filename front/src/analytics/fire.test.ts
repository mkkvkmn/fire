// Tests for the FiRe projection.
import { describe, expect, it } from "vitest";
import { fireTarget, projectFire } from "./fire";

describe("fire", () => {
  it("grosses the 25x target up for tax", () => {
    expect(fireTarget(1578, 0.25)).toBeCloseTo(631200, 0);
    expect(fireTarget(1000, 0)).toBe(300000);
  });

  it("finds the month the investments reach the target (mockup example: 11/2047)", () => {
    const r = projectFire({ spendMonthly: 1578, investMonthly: 500, returnRate: 0.07, taxRate: 0.25, start: 64300, startMonth: "2024-12" });
    expect(r.month).toBe("2047-11");
    expect(r.months).toBe(275);
    expect(r.years[0]).toEqual({ year: 2025, value: expect.closeTo(75000, -2) });
    expect(r.years.at(-1)?.year).toBe(2057);
  });

  it("is reached at once when the investments already cover it, and never with nothing coming in", () => {
    expect(projectFire({ spendMonthly: 100, investMonthly: 0, returnRate: 0, taxRate: 0, start: 1e6, startMonth: "2024-01" }).months).toBe(
      0,
    );
    const never = projectFire({ spendMonthly: 1000, investMonthly: 0, returnRate: 0, taxRate: 0, start: 0, startMonth: "2024-01" });
    expect(never.month).toBeNull();
    expect(never.years.length).toBe(30);
  });
});
