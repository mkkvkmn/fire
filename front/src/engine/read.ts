// Reading a source file into source rows: bytes -> table (preprocessor, CSV or XLSX) -> rows with
// every source column kept, normalised fields and ids.
import { decodeText } from "./decode";
import { assignIds } from "./ids";
import { getPreprocessor } from "./preprocessors";
import { isEmptyRow, missingColumns, normalizeRow } from "./profiles";
import { isXlsxName, parseCsv, parseXlsx } from "./tables";
import type { SourceProfile, SourceRow, Table } from "./types";

export function readTable(fileName: string, bytes: Uint8Array, profile: SourceProfile): Table {
  if (profile.preprocessor) {
    const pre = getPreprocessor(profile.preprocessor);
    if (!pre) throw new Error(`unknown preprocessor: ${profile.preprocessor}`);
    return pre.run(bytes);
  }
  if (isXlsxName(fileName)) return parseXlsx(bytes, { sheet: profile.sheet, skipRows: profile.skipRows });
  return parseCsv(decodeText(bytes, profile.encoding), { delimiter: profile.delimiter, skipRows: profile.skipRows });
}

export function tableRecords(table: Table): Record<string, string>[] {
  return table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r[i] ?? ""])));
}

export interface RowProblem {
  index: number;
  columns: Record<string, string>;
  problem: "date" | "amount";
}

export interface ReadResult {
  rows: SourceRow[];
  /** Rows recognised as already in the project (overlapping export). */
  alreadyImported: SourceRow[];
  /** Rows whose date or amount did not parse. They are kept in rows too, for Review. */
  problems: RowProblem[];
}

export function readSourceRows(
  fileName: string,
  table: Table,
  profile: SourceProfile,
  existing: ReadonlyMap<string, number> = new Map(),
  opts: { forceAdd?: boolean } = {},
): ReadResult {
  const missing = missingColumns(table.headers, profile);
  if (missing.length > 0) {
    throw new Error(`${fileName}: missing columns ${missing.join(", ")} for profile ${profile.name}`);
  }
  const records = tableRecords(table)
    .map((columns) => ({ columns, fields: normalizeRow(columns, profile) }))
    .filter((r) => !isEmptyRow(r.fields));
  const ids = assignIds(
    records.map((r) => ({ account: r.fields.account, columns: r.columns })),
    existing,
    opts,
  );
  const rows: SourceRow[] = [];
  const alreadyImported: SourceRow[] = [];
  const problems: RowProblem[] = [];
  records.forEach((r, i) => {
    const id = ids[i]!;
    const row: SourceRow = {
      txId: id.txId,
      contentHash: id.hash,
      occurrence: id.occurrence,
      sourceFile: fileName,
      columns: r.columns,
      fields: r.fields,
    };
    if (id.alreadyImported) {
      alreadyImported.push(row);
      return;
    }
    if (r.fields.date === null) problems.push({ index: i, columns: r.columns, problem: "date" });
    else if (r.fields.amount === null) problems.push({ index: i, columns: r.columns, problem: "amount" });
    rows.push(row);
  });
  return { rows, alreadyImported, problems };
}

/** Counts of rows per content hash, the `existing` input of readSourceRows. */
export function hashCounts(rows: SourceRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.contentHash, Math.max(m.get(r.contentHash) ?? 0, r.occurrence));
  return m;
}
