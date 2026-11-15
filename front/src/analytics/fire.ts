// FiRe projection: when investments could cover spending (the 4 % rule, 25 times a year's spending,
// grossed up for the tax paid on dividends and sales). Monthly compounding, figures in today's
// money (the expected return is after inflation). Pure.
import { addMonths } from "./period";

export interface FireInputs {
  /** Spending per month in euros. */
  spendMonthly: number;
  /** Extra investment per month in euros. */
  investMonthly: number;
  /** Expected yearly return after inflation, 0.07 = 7 %. */
  returnRate: number;
  /** Tax on dividends and capital gains, 0.25 = 25 %. */
  taxRate: number;
  /** Investments now. */
  start: number;
  /** Month of `start`, `YYYY-MM`. */
  startMonth: string;
}

export interface FireYear {
  year: number;
  /** Investments at the end of the year (projected). */
  value: number;
}

export interface FireResult {
  /** Investments needed: 25 x yearly spending / (1 - tax). */
  target: number;
  /** Months from startMonth until the target is reached; null when it is never reached in 100 years. */
  months: number | null;
  /** Month the target is reached, `YYYY-MM`, or null. */
  month: string | null;
  /** Year-end projection from the year after startMonth up to 10 years past the target year. */
  years: FireYear[];
}

const MAX_MONTHS = 1200;

export function fireTarget(spendMonthly: number, taxRate: number): number {
  const keep = 1 - Math.min(Math.max(taxRate, 0), 0.95);
  return ((Math.max(spendMonthly, 0) * 12) / keep) * 25;
}

export function projectFire(i: FireInputs): FireResult {
  const target = fireTarget(i.spendMonthly, i.taxRate);
  const rm = (1 + i.returnRate) ** (1 / 12) - 1;
  let v = i.start;
  let months: number | null = v >= target ? 0 : null;
  const yearEnd = new Map<number, number>();
  let month = i.startMonth;
  for (let n = 1; n <= MAX_MONTHS; n++) {
    v = v * (1 + rm) + i.investMonthly;
    month = addMonths(month, 1);
    if (months === null && v >= target) months = n;
    if (month.endsWith("-12")) yearEnd.set(Number(month.slice(0, 4)), v);
    const lastYear = months === null ? null : Number(addMonths(i.startMonth, months).slice(0, 4)) + 10;
    if (lastYear !== null && Number(month.slice(0, 4)) >= lastYear && month.endsWith("-12")) break;
  }
  const reached = months === null ? null : addMonths(i.startMonth, months);
  const startYear = Number(i.startMonth.slice(0, 4));
  const endYear = reached ? Number(reached.slice(0, 4)) + 10 : startYear + 30;
  const years: FireYear[] = [];
  for (let y = startYear + 1; y <= endYear; y++) {
    const value = yearEnd.get(y);
    if (value !== undefined) years.push({ year: y, value });
  }
  return { target, months, month: reached, years };
}
