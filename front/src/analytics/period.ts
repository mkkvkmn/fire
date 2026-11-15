// Periods are whole months, `YYYY-MM` inclusive at both ends. Presets resolve against the last
// month with data, so "this year" on an old export still shows that export's year.

export interface Period {
  from: string;
  to: string;
}

export type Preset = "thisYear" | "last12" | "lastYear" | "all" | "custom";
export const PRESETS: Preset[] = ["thisYear", "last12", "lastYear", "all", "custom"];

export type Comparison = "prevMonth" | "prevYear";

export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}`;
}

/** Every month from `from` to `to` inclusive (empty when from > to). */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 1200; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function shiftPeriod(p: Period, months: number): Period {
  return { from: addMonths(p.from, months), to: addMonths(p.to, months) };
}

/** The 12 months ending at `month` (the DAX DATESBETWEEN(NEXTDAY(SAMEPERIODLASTYEAR(...))) window). */
export function window12(month: string): Period {
  return { from: addMonths(month, -11), to: month };
}

/**
 * The month reports count back from: the last complete month (the one before today's), or the
 * last month with data when that is earlier. The month in progress rarely has all its rows, and
 * rows dated ahead (planned payments) must not move "this year" or "the last 12 months". When
 * every row is in the month in progress, that month.
 */
export function latestMonth(firstMonth: string, lastMonth: string, today = new Date()): string {
  const prev = addMonths(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`, -1);
  if (!lastMonth || lastMonth <= prev) return lastMonth || prev;
  return prev >= firstMonth ? prev : lastMonth;
}

/**
 * The period of a preset, clipped to the months that have data at the end: a year still in
 * progress runs to the last month with data, so comparisons with last year compare like with like.
 */
export function resolvePeriod(preset: Preset, firstMonth: string, lastMonth: string, custom: Period): Period {
  const p = presetPeriod(preset, firstMonth, lastMonth, custom);
  const to = p.to > lastMonth ? lastMonth : p.to;
  return { from: p.from > to ? to : p.from, to };
}

function presetPeriod(preset: Preset, firstMonth: string, lastMonth: string, custom: Period): Period {
  const year = lastMonth.slice(0, 4);
  switch (preset) {
    case "thisYear":
      return { from: `${year}-01`, to: `${year}-12` };
    case "last12":
      return window12(lastMonth);
    case "lastYear":
      return { from: `${Number(year) - 1}-01`, to: `${Number(year) - 1}-12` };
    case "all":
      return { from: firstMonth, to: lastMonth };
    case "custom":
      return {
        from: custom.from || firstMonth,
        to: custom.to || lastMonth,
      };
  }
}

/** Month label as in the report: `2024/KK01`. */
export function monthLabel(month: string): string {
  return `${month.slice(0, 4)}/KK${month.slice(5, 7)}`;
}
