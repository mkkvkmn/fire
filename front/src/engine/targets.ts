// Monthly target rows (port of s_08_target_setter.py): one row per month end between start and end.
import { monthEnd } from "./dates";
import type { LedgerRow, Target } from "./types";

/** Month ends within [start, end], as pandas date_range(freq="M"). */
export function monthEnds(start: string, end: string): string[] {
  const out: string[] = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  for (;;) {
    const d = monthEnd(y, m);
    if (d > end) break;
    if (d >= start) out.push(d);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function targetRowId(t: Target, month: string): string {
  return ["target", t.name, t.owner, t.class, t.category, t.subCategory, month].join(":");
}

export function targetRows(targets: Target[]): LedgerRow[] {
  return targets.flatMap((t) =>
    monthEnds(t.start, t.end).map((date) => ({
      rowId: targetRowId(t, date.slice(0, 7)),
      txId: "",
      date,
      month: date.slice(0, 7),
      account: "Target",
      description: t.name,
      info: "",
      amountOriginal: t.monthlyAmount,
      class: t.class,
      category: t.category,
      subCategory: t.subCategory,
      ruleId: t.name,
      sourceFile: "targets.csv",
      rowType: "Target" as const,
      share: 1,
      amount: t.monthlyAmount,
      owner: t.owner,
      split: false,
    })),
  );
}
