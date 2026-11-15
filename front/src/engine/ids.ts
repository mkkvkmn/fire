// Transaction ids. content hash = hash of the account plus every source column of the row;
// tx_id = content hash + occurrence number among identical rows. Independent of file name,
// mapping, rules and owner, so ids are reproducible from the source files alone.
import { sha256Hex } from "./sha256";

/** Hex characters of the SHA-256 kept in ids (80 bits). */
const HASH_LENGTH = 20;

export function contentHash(account: string, columns: Record<string, string>): string {
  const entries = Object.keys(columns)
    .sort()
    .map((k) => [k, columns[k] ?? ""]);
  return sha256Hex(JSON.stringify([account, entries])).slice(0, HASH_LENGTH);
}

export function txId(hash: string, occurrence: number): string {
  return `${hash}-${occurrence}`;
}

export interface IdAssignment {
  hash: string;
  occurrence: number;
  txId: string;
  /** True when the project already holds a row with this id (an overlapping export). */
  alreadyImported: boolean;
}

/**
 * Assigns ids to the rows of one import. `existing` holds how many rows per content hash the project
 * already has. Within the import, identical rows get occurrences 1, 2, 3...; the first m of them are
 * the rows the project already has. With `forceAdd`, every row is new and numbering continues after m.
 */
export function assignIds(
  rows: { account: string; columns: Record<string, string> }[],
  existing: ReadonlyMap<string, number>,
  opts: { forceAdd?: boolean } = {},
): IdAssignment[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const hash = contentHash(r.account, r.columns);
    const n = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, n);
    const m = existing.get(hash) ?? 0;
    const occurrence = opts.forceAdd ? m + n : n;
    return { hash, occurrence, txId: txId(hash, occurrence), alreadyImported: !opts.forceAdd && n <= m };
  });
}

/** Ledger row id: the tx id, plus the owner for split rows. */
export function ledgerRowId(tx: string, owner: string, split: boolean): string {
  return split ? `${tx}:${owner}` : tx;
}
