// Report measures, ported from the DAX of the v2 Power BI report. One function
// per measure; the DAX name is in each comment. Amounts are euros; the UI divides balances by 1000.
//
// Decisions where the DAX was unclear or inconsistent:
// - "12kk ka" divides the 12-month sum by the months in the window that have any data in the
//   ledger (all owners). The DAX counts months with data of the measure's own class, which gave
//   dividends 527 / 7 = 75 on one page and 527 / 12 = 44 on another. The count only matters at
//   the start of the history, where it stops a short first year from looking small.
// - Balances (varat, velat) are snapshots: the sum of the rows in the last month of the period
//   that has actual rows. Target rows do not move that month.
import type { LedgerRow } from "../engine/types";
import { addMonths, monthsBetween, shiftPeriod, window12, type Period } from "./period";

export interface RowFilter {
  class?: string;
  category?: string;
  subCategory?: string;
  description?: string;
  /** Any of these categories (lower case). */
  categories?: readonly string[];
  /** Any of these classes (lower case). */
  classes?: readonly string[];
}

const lc = (s: string) => s.toLowerCase();

export function matches(r: LedgerRow, f: RowFilter): boolean {
  return (
    (f.class === undefined || lc(r.class) === f.class) &&
    (f.category === undefined || lc(r.category) === lc(f.category)) &&
    (f.subCategory === undefined || lc(r.subCategory) === lc(f.subCategory)) &&
    (f.description === undefined || r.description === f.description) &&
    (f.categories === undefined || f.categories.includes(lc(r.category))) &&
    (f.classes === undefined || f.classes.includes(lc(r.class)))
  );
}

/** The ledger seen by the reports: actual rows of one owner ("" = everyone), indexed by month. */
export class Model {
  readonly rows: LedgerRow[];
  readonly targets: LedgerRow[];
  readonly owners: string[];
  readonly firstMonth: string;
  readonly lastMonth: string;
  private readonly byMonth = new Map<string, LedgerRow[]>();
  /** Months with any actual row, all owners: the denominator of the 12-month averages. */
  private readonly coverage = new Set<string>();

  constructor(ledger: LedgerRow[], owner = "") {
    this.owners = [...new Set(ledger.map((r) => r.owner))].sort();
    const actual = ledger.filter((r) => r.rowType === "Actual");
    for (const r of actual) this.coverage.add(r.month);
    this.rows = actual.filter((r) => owner === "" || r.owner === owner);
    this.targets = ledger.filter((r) => r.rowType === "Target" && (owner === "" || r.owner === owner));
    for (const r of this.rows) {
      let list = this.byMonth.get(r.month);
      if (!list) this.byMonth.set(r.month, (list = []));
      list.push(r);
    }
    const months = [...this.byMonth.keys()].sort();
    this.firstMonth = months[0] ?? "";
    this.lastMonth = months.at(-1) ?? "";
  }

  rowsIn(p: Period, f: RowFilter = {}): LedgerRow[] {
    const out: LedgerRow[] = [];
    for (const m of monthsBetween(p.from, p.to)) for (const r of this.byMonth.get(m) ?? []) if (matches(r, f)) out.push(r);
    return out;
  }

  /** `_eur`: SUM(Data[summa]) over the rows matching the filter in the period. */
  sum(p: Period, f: RowFilter = {}): number {
    let s = 0;
    for (const m of monthsBetween(p.from, p.to)) for (const r of this.byMonth.get(m) ?? []) if (matches(r, f)) s += r.amount;
    return s;
  }

  hasData(month: string): boolean {
    return this.byMonth.has(month);
  }

  coveredMonths(p: Period): number {
    return monthsBetween(p.from, p.to).filter((m) => this.coverage.has(m)).length;
  }
}

export type Measure = (m: Model, p: Period, f?: RowFilter) => number;

/** `Tulot`. */
export const tulot: Measure = (m, p, f = {}) => m.sum(p, { ...f, class: "tulot" });
/** `Menot`: shown positive. */
export const menot: Measure = (m, p, f = {}) => -m.sum(p, { ...f, class: "menot" });
/** `Säästö`. */
export const saasto: Measure = (m, p, f = {}) => tulot(m, p, f) - menot(m, p, f);
/** `Ansiotulot`. */
export const ansiotulot: Measure = (m, p) => tulot(m, p, { category: "ansiotulot" });
/** `Pääomatulot`. */
export const paaomatulot: Measure = (m, p) => tulot(m, p, { category: "pääomatulot" });
/** `Osinkotulot`: sub-category osinkotulot in any class. */
export const osinkotulot: Measure = (m, p, f = {}) => m.sum(p, { ...f, subCategory: "osinkotulot" });
/** `Pois (summa)`. */
export const pois: Measure = (m, p, f = {}) => m.sum(p, { ...f, class: "pois" });

/** `Säästö %`: DIVIDE, so null when there is no income. */
export function saastoPct(m: Model, p: Period): number | null {
  const t = tulot(m, p);
  return t === 0 ? null : (t - menot(m, p)) / t;
}

/** DIVIDE(a, b): null for a zero divisor. */
export function divide(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/** `X 12kk ka`: the 12-month sum divided by the months in the window that have data. */
export function avg12(m: Model, month: string, measure: Measure, f?: RowFilter): number | null {
  const w = window12(month);
  return divide(measure(m, w, f), m.coveredMonths(w));
}

/** `X (-1V)`: the same measure a year earlier. */
export function lastYear(m: Model, p: Period, measure: Measure, f?: RowFilter): number {
  return measure(m, shiftPeriod(p, -12), f);
}

/** `X 12kk muutos`: 12kk ka now minus 12kk ka a year earlier. */
export function change12(m: Model, month: string, measure: Measure, f?: RowFilter): number | null {
  const now = avg12(m, month, measure, f);
  const before = avg12(m, addMonths(month, -12), measure, f);
  return now === null || before === null ? null : now - before;
}

// ---- balances

const BALANCE: RowFilter = {};
const isBalance = (r: LedgerRow) => {
  const c = lc(r.class);
  return c === "varat" || c === "velat";
};
export const INVESTMENT_CATEGORIES = ["sijoitusvarallisuus", "sijoitusvelat"];

/** The month whose rows a balance in the period is read from: the last one with actual rows. */
export function snapshotMonth(m: Model, p: Period): string | null {
  const months = monthsBetween(p.from, p.to);
  for (let i = months.length - 1; i >= 0; i--) if (m.hasData(months[i]!)) return months[i]!;
  return null;
}

/** `_tase_arvo`: varat + velat rows of one month matching the filter. */
export function balance(m: Model, month: string, f: RowFilter = BALANCE): number {
  return m.rowsIn({ from: month, to: month }, f).reduce((s, r) => (isBalance(r) ? s + r.amount : s), 0);
}

/** `Nettovarallisuus` (= `Arvo`) at a month. */
export const nettovarallisuus = (m: Model, month: string) => balance(m, month);
/** `Sijoitusvarallisuus` at a month. */
export const sijoitusvarallisuus = (m: Model, month: string) => balance(m, month, { categories: INVESTMENT_CATEGORIES });

/** `Kassa vuosina`: investments / (Menot 12kk ka x 12), in years. */
export function kassaVuosina(m: Model, month: string): number | null {
  const spend = avg12(m, month, menot);
  return spend === null ? null : divide(sijoitusvarallisuus(m, month), spend * 12);
}

/** True when the month has investment balance rows (its investments are known, even if zero). */
export function hasInvestments(m: Model, month: string): boolean {
  return m.rowsIn({ from: month, to: month }, { categories: INVESTMENT_CATEGORIES }).some(isBalance);
}

/**
 * The latest month whose investments are known: FiRe starts there, since a later month without
 * them (data not entered yet) would count the investments as zero. Null when no month has them.
 */
export function lastInvestmentMonth(m: Model): string | null {
  if (!m.firstMonth) return null;
  const months = monthsBetween(m.firstMonth, m.lastMonth);
  for (let i = months.length - 1; i >= 0; i--) if (hasInvestments(m, months[i]!)) return months[i]!;
  return null;
}

/** One named target in a period: its goal and the actual amount of the rows it covers. */
export interface TargetProgress {
  name: string;
  /** Sum of the target's monthly amounts in the period (income +, spending -). */
  goal: number;
  /** Sum of the actual rows matching any of the target's lines: owner, class, category, sub-category. */
  actual: number;
  /** A net spending target (goal below zero): staying under it is good. */
  lowerIsBetter: boolean;
}

/**
 * Progress of every target with rows in the period. A target is a name with one or more lines
 * (v2's "Säästötavoite" is income +1000 and spending -500), so goal and actual are signed sums:
 * a savings target compares income minus spending, a dividend target only dividends. An empty
 * category or sub-category covers all of them. A line counts only its owner's rows in its own
 * months, so one member's target is not compared with the whole household, nor a 2026 budget
 * with 2025. `targets` holds the target rows as actual rows.
 */
export function targetProgress(m: Model, targets: Model, p: Period): TargetProgress[] {
  const byName = targetsIn(targets, p);
  const rows = byName.size ? m.rowsIn(p) : [];
  return [...byName]
    .map(([name, t]) => {
      let actual = 0;
      for (const r of rows) if (t.covers(r)) actual += r.amount;
      return { name, goal: t.goal, actual, lowerIsBetter: t.goal < 0 };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The actual rows behind one target in a period: the rows Tapahtumat lists for it. */
export function targetMatches(m: Model, targets: Model, p: Period, name: string): LedgerRow[] {
  const t = targetsIn(targets, p).get(name);
  return t ? m.rowsIn(p).filter((r) => t.covers(r)) : [];
}

/** Each target of the period by name: its goal, and which actual rows it covers. */
function targetsIn(targets: Model, p: Period): Map<string, { goal: number; covers: (r: LedgerRow) => boolean }> {
  type Line = { owner: string; f: RowFilter; months: Set<string> };
  const byName = new Map<string, { goal: number; lines: Map<string, Line> }>();
  for (const r of targets.rowsIn(p)) {
    let t = byName.get(r.description);
    if (!t) byName.set(r.description, (t = { goal: 0, lines: new Map() }));
    t.goal += r.amount;
    const key = JSON.stringify([r.owner, lc(r.class), lc(r.category), lc(r.subCategory)]);
    let line = t.lines.get(key);
    if (!line) {
      const f: RowFilter = {
        class: lc(r.class),
        ...(r.category ? { category: r.category } : {}),
        ...(r.subCategory ? { subCategory: r.subCategory } : {}),
      };
      t.lines.set(key, (line = { owner: r.owner, f, months: new Set() }));
    }
    line.months.add(r.month);
  }
  return new Map(
    [...byName].map(([name, t]) => {
      const lines = [...t.lines.values()];
      const covers = (r: LedgerRow) => lines.some((l) => l.owner === r.owner && l.months.has(r.month) && matches(r, l.f));
      return [name, { goal: t.goal, covers }];
    }),
  );
}
