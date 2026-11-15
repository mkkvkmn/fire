// Ledger diff (successor of s_09_log_changes.py): rows added, removed, or changed in class,
// category, sub-category or amount, keyed by rowId and summed per month.
import type { LedgerRow } from "./types";

export type ChangedField = "class" | "category" | "subCategory" | "amount" | "date" | "owner";

export interface RowChange {
  rowId: string;
  before: LedgerRow;
  after: LedgerRow;
  fields: ChangedField[];
}

export interface MonthSummary {
  month: string;
  added: number;
  removed: number;
  changed: number;
  /** Sum of amounts after minus before. */
  amountDelta: number;
}

export interface LedgerDiff {
  added: LedgerRow[];
  removed: LedgerRow[];
  changed: RowChange[];
  months: MonthSummary[];
}

const FIELDS: ChangedField[] = ["class", "category", "subCategory", "amount", "date", "owner"];

function changedFields(a: LedgerRow, b: LedgerRow): ChangedField[] {
  return FIELDS.filter((f) => (f === "amount" ? Math.abs(a.amount - b.amount) > 1e-9 : a[f] !== b[f]));
}

export function diffLedger(before: LedgerRow[], after: LedgerRow[]): LedgerDiff {
  const old = new Map(before.map((r) => [r.rowId, r]));
  const now = new Map(after.map((r) => [r.rowId, r]));
  const added = after.filter((r) => !old.has(r.rowId));
  const removed = before.filter((r) => !now.has(r.rowId));
  const changed: RowChange[] = [];
  for (const r of after) {
    const prev = old.get(r.rowId);
    if (!prev) continue;
    const fields = changedFields(prev, r);
    if (fields.length > 0) changed.push({ rowId: r.rowId, before: prev, after: r, fields });
  }

  const months = new Map<string, MonthSummary>();
  const month = (m: string) => {
    let s = months.get(m);
    if (!s) {
      s = { month: m, added: 0, removed: 0, changed: 0, amountDelta: 0 };
      months.set(m, s);
    }
    return s;
  };
  for (const r of added) {
    const s = month(r.month);
    s.added++;
    s.amountDelta += r.amount;
  }
  for (const r of removed) {
    const s = month(r.month);
    s.removed++;
    s.amountDelta -= r.amount;
  }
  for (const c of changed) {
    month(c.after.month).changed++;
    month(c.after.month).amountDelta += c.after.amount;
    month(c.before.month).amountDelta -= c.before.amount;
  }
  return {
    added,
    removed,
    changed,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export function isEmptyDiff(d: LedgerDiff): boolean {
  return d.added.length === 0 && d.removed.length === 0 && d.changed.length === 0;
}
