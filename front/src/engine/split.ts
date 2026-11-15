// Splitting rows between owners (port of s_05_splitter.py). A row of a split account within a
// split's dates is replaced by one row per matching split, with amount = original x share.
import type { Split } from "./types";

export interface SplitPart {
  owner: string;
  share: number;
  split: boolean;
}

/**
 * Owner parts of one row. A row no split covers stays whole for its account's owner, or for the
 * default owner when the account has none (v2's behaviour, which knows no account owners).
 */
export function splitParts(
  account: string,
  date: string,
  splits: Split[],
  defaultOwner: string,
  accountOwners: Readonly<Record<string, string>> = {},
): SplitPart[] {
  const parts = splits
    .filter((s) => s.account === account && date >= s.start && date <= s.end)
    .map((s) => ({ owner: s.owner, share: s.share, split: true }));
  return parts.length > 0 ? parts : [{ owner: accountOwners[account] || defaultOwner, share: 1, split: false }];
}
