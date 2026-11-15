// Ledger as CSV in the schema of v2's final_data.csv, for spreadsheets and the v2 Power BI report.
// Numbers and booleans are written as pandas wrote them; text cells never start like a formula.
import type { LedgerRow } from "./types";

export const FINAL_DATA_HEADER = [
  "date",
  "account",
  "description",
  "info",
  "amount_original",
  "class",
  "category",
  "sub_category",
  "rule_id",
  "source_file",
  "row_type",
  "share",
  "amount",
  "owner",
  "split",
  "not_unique_id",
] as const;

/** Python's repr of a float: `500.0`, `-22.04`, `0.5`. */
export function pyNumber(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "inf" : n < 0 ? "-inf" : "nan";
  const s = String(n);
  if (/e/.test(s)) {
    // Python writes 1e-05 and 1e+16 with a two-digit exponent.
    return s.replace(/e([+-])(\d)$/, "e$10$2");
  }
  return Number.isInteger(n) ? `${s}.0` : s;
}

/** A CSV field quoted as pandas (csv.QUOTE_MINIMAL) quotes it. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * A text cell made safe for spreadsheets: one that starts like a formula (=, +, -, @, tab or CR) gets
 * a leading ', so Excel and the like show it as text and never run it. Numbers are not passed here.
 */
export function textCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** The ledger as final_data.csv text. The id column carries the v3 row id. */
export function ledgerToCsv(rows: LedgerRow[]): string {
  const lines = [FINAL_DATA_HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        textCell(r.account),
        textCell(r.description),
        textCell(r.info),
        pyNumber(r.amountOriginal),
        textCell(r.class),
        textCell(r.category),
        textCell(r.subCategory),
        textCell(r.ruleId),
        textCell(r.sourceFile),
        textCell(r.rowType),
        pyNumber(r.share),
        pyNumber(r.amount),
        textCell(r.owner),
        r.split ? "True" : "False",
        r.rowId,
      ]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
