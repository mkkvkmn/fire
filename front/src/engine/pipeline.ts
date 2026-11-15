// The processing pipeline: source rows -> categorise -> split -> fix -> targets -> ledger rows.
// Rows no rule matches and fixes that match no row are returned for Review instead of blocking.
import { categorizeRow, compileRules } from "./categorize";
import { applyFixes } from "./fix";
import { ledgerRowId } from "./ids";
import { splitParts } from "./split";
import { targetRows } from "./targets";
import type { Fix, LedgerRow, Rule, SourceRow, Split, Target } from "./types";

export interface PipelineConfig {
  rules: Rule[];
  splits: Split[];
  fixes: Fix[];
  targets: Target[];
  defaultOwner: string;
  /** Who owns each account's rows that no split covers; an account not listed falls back to defaultOwner. */
  accountOwners?: Readonly<Record<string, string>>;
  /** Source rows left out of the ledger, such as rows decided to be duplicates. */
  excludeTxIds?: ReadonlySet<string>;
}

export interface PipelineResult {
  ledger: LedgerRow[];
  /** Source rows no rule matched; they are in the ledger with an empty class. */
  uncategorized: SourceRow[];
  /** Source rows left out because their date or amount did not parse. */
  invalid: SourceRow[];
  failedFixes: Fix[];
}

export function processRows(rows: SourceRow[], config: PipelineConfig): PipelineResult {
  const compiled = compileRules(config.rules);
  const ledger: LedgerRow[] = [];
  const uncategorized: SourceRow[] = [];
  const invalid: SourceRow[] = [];

  for (const r of rows) {
    if (config.excludeTxIds?.has(r.txId)) continue;
    const { date, amount, account, description, info } = r.fields;
    if (date === null || amount === null) {
      invalid.push(r);
      continue;
    }
    const cat = categorizeRow(compiled, { account, description, info, amount });
    if (!cat) uncategorized.push(r);
    for (const part of splitParts(account, date, config.splits, config.defaultOwner, config.accountOwners)) {
      ledger.push({
        rowId: ledgerRowId(r.txId, part.owner, part.split),
        txId: r.txId,
        date,
        month: date.slice(0, 7),
        account,
        description,
        info,
        amountOriginal: amount,
        class: cat?.class ?? "",
        category: cat?.category ?? "",
        subCategory: cat?.subCategory ?? "",
        ruleId: cat?.ruleId ?? "",
        sourceFile: r.sourceFile,
        rowType: "Actual",
        share: part.share,
        amount: amount * part.share,
        owner: part.owner,
        split: part.split,
      });
    }
  }

  const fixed = applyFixes(ledger, config.fixes);
  return {
    ledger: [...fixed.rows, ...targetRows(config.targets)],
    uncategorized,
    invalid,
    failedFixes: fixed.failed,
  };
}
