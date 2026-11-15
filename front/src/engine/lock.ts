// Locked periods: months up to the locked-through month keep their stored ledger rows. Only open
// months take freshly computed rows. Source rows dated in a locked month that the stored ledger
// does not have yet are "late rows": they wait in Review until accepted.
import type { LedgerRow } from "./types";

/** True when `month` (`YYYY-MM`) is at or before `lockedThrough`. Nothing is locked when it is "". */
export function isLocked(month: string, lockedThrough: string): boolean {
  return lockedThrough !== "" && month <= lockedThrough;
}

/** `YYYY-MM` of the month before the given date. */
export function previousMonth(today: Date): string {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-based, so this is already the previous month's 1-based number
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, "0")}`;
}

export interface LockMerge {
  /** Stored rows of locked months plus computed rows of open months. */
  ledger: LedgerRow[];
  /** Computed rows in locked months whose transaction the stored ledger does not have. */
  late: LedgerRow[];
}

/**
 * Combines the stored ledger with a fresh computation under a lock. Locked months keep exactly
 * their stored rows (target rows included). Computed actual rows in locked months are late when
 * their transaction is not in the stored ledger and not ignored; `accept` lists late
 * transactions to add now.
 */
export function mergeLocked(
  stored: LedgerRow[],
  computed: LedgerRow[],
  lockedThrough: string,
  opts: { accept?: ReadonlySet<string>; ignore?: ReadonlySet<string> } = {},
): LockMerge {
  if (lockedThrough === "") return { ledger: computed, late: [] };
  const storedTx = new Set(stored.filter((r) => r.txId !== "").map((r) => r.txId));
  const ledger = stored.filter((r) => isLocked(r.month, lockedThrough));
  const late: LedgerRow[] = [];
  for (const r of computed) {
    if (!isLocked(r.month, lockedThrough)) {
      ledger.push(r);
      continue;
    }
    if (r.rowType !== "Actual" || storedTx.has(r.txId) || opts.ignore?.has(r.txId)) continue;
    if (opts.accept?.has(r.txId)) ledger.push(r);
    else late.push(r);
  }
  return { ledger, late };
}

/** Ledger rows of months in `[from, to]` (inclusive `YYYY-MM`; "" leaves that end open). */
export function inMonths(rows: LedgerRow[], from: string, to: string): LedgerRow[] {
  return rows.filter((r) => (from === "" || r.month >= from) && (to === "" || r.month <= to));
}
