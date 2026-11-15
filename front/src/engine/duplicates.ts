// Possible duplicates (successor of s_10_validate.py): rows with a different content hash but the
// same account, date, amount and description, as happens when a bank changes its export format.
// Decisions are remembered by the pair of tx ids, so a decided pair is not asked again.
import type { SourceRow } from "./types";

export interface DuplicateCandidate {
  key: string;
  /** The new row and the existing rows it may duplicate. */
  newRow: SourceRow;
  existing: SourceRow[];
}

export function duplicateKey(r: SourceRow): string | null {
  const f = r.fields;
  if (f.date === null || f.amount === null || f.amount === 0) return null;
  return JSON.stringify([f.account, f.date, Math.round(f.amount * 100), f.description.toLowerCase()]);
}

export function decisionKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Possible duplicates across all rows of a project: groups of rows sharing a duplicate key but not
 * a content hash. Pairs already decided are left out; a group with no undecided pair disappears.
 */
export function findDuplicateGroups(rows: SourceRow[], decided: ReadonlySet<string> = new Set()): SourceRow[][] {
  const groups = new Map<string, SourceRow[]>();
  for (const r of rows) {
    const k = duplicateKey(r);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const out: SourceRow[][] = [];
  for (const list of groups.values()) {
    if (new Set(list.map((r) => r.contentHash)).size < 2) continue;
    const open = list.some((a, i) =>
      list.some((b, j) => j > i && a.contentHash !== b.contentHash && !decided.has(decisionKey(a.txId, b.txId))),
    );
    if (open) out.push(list);
  }
  return out;
}

export function findPossibleDuplicates(
  newRows: SourceRow[],
  existingRows: SourceRow[],
  decided: ReadonlySet<string> = new Set(),
): DuplicateCandidate[] {
  const index = new Map<string, SourceRow[]>();
  for (const r of existingRows) {
    const k = duplicateKey(r);
    if (!k) continue;
    const list = index.get(k) ?? [];
    list.push(r);
    index.set(k, list);
  }
  const out: DuplicateCandidate[] = [];
  for (const r of newRows) {
    const k = duplicateKey(r);
    if (!k) continue;
    const matches = (index.get(k) ?? []).filter((e) => e.contentHash !== r.contentHash && !decided.has(decisionKey(e.txId, r.txId)));
    if (matches.length > 0) out.push({ key: k, newRow: r, existing: matches });
  }
  return out;
}
