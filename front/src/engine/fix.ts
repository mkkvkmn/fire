// Fixes (port of s_07_fixer.py): overrides keyed by tx_id. Only the fields a fix sets change.
// Fixes that match no ledger row are returned so the UI can show them.
import type { Fix, FixPart, LedgerRow } from "./types";

export interface FixResult {
  rows: LedgerRow[];
  failed: Fix[];
}

export function applyFix(row: LedgerRow, fix: Fix): LedgerRow {
  const out = { ...row };
  out.ruleId = fix.id || row.ruleId;
  if (fix.date) {
    out.date = fix.date;
    out.month = fix.date.slice(0, 7);
  }
  if (fix.description) out.description = fix.description;
  if (fix.info) out.info = fix.info;
  if (fix.amount !== undefined && Number.isFinite(fix.amount)) out.amount = fix.amount;
  if (fix.class) out.class = fix.class;
  if (fix.category) out.category = fix.category;
  if (fix.subCategory) out.subCategory = fix.subCategory;
  return out;
}

export function applyFixes(rows: LedgerRow[], fixes: Fix[]): FixResult {
  const byTx = new Map<string, number[]>();
  rows.forEach((r, i) => {
    if (!r.txId) return;
    const list = byTx.get(r.txId) ?? [];
    list.push(i);
    byTx.set(r.txId, list);
  });
  const out = rows.slice();
  const failed: Fix[] = [];
  /** Rows of a split transaction replace its rows at the position of the first one. */
  const replaced = new Map<number, LedgerRow[]>();
  for (const fix of fixes) {
    const targets = (byTx.get(fix.txId) ?? []).filter((i) => !fix.owner || out[i]!.owner === fix.owner);
    if (targets.length === 0) {
      failed.push(fix);
      continue;
    }
    if (fix.parts && fix.parts.length > 0) {
      const base = targets.map((i) => out[i]!);
      targets.forEach((i, n) => replaced.set(i, n === 0 ? splitRows(base, fix.id, fix.parts!) : []));
      continue;
    }
    for (const i of targets) out[i] = applyFix(out[i]!, fix);
  }
  if (replaced.size === 0) return { rows: out, failed };
  return { rows: out.flatMap((r, i) => replaced.get(i) ?? [r]), failed };
}

/**
 * One transaction split into parts. `rows` are the transaction's ledger rows (one per member when
 * the account is split). A part with an owner becomes one row for that member; a part without one
 * becomes a row per member with the member's share of the part.
 */
export function splitRows(rows: LedgerRow[], fixId: string, parts: FixPart[]): LedgerRow[] {
  const first = rows[0]!;
  const out: LedgerRow[] = [];
  parts.forEach((part, n) => {
    const tagged = (row: LedgerRow, owner: string, share: number, amount: number): LedgerRow => ({
      ...row,
      rowId: `${row.rowId}#${n + 1}`,
      ruleId: fixId,
      class: part.class,
      category: part.category,
      subCategory: part.subCategory,
      owner,
      share,
      amount,
      split: true,
    });
    if (part.owner) out.push(tagged(first, part.owner, 1, part.amount));
    else for (const r of rows) out.push(tagged(r, r.owner, r.share, part.amount * r.share));
  });
  return out;
}
