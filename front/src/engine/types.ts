// Shared engine types: tables, source profiles, rules, splits, fixes, targets and ledger rows.

/** A parsed source file: header names and rows of cell text. Every cell is a string ("" when empty). */
export interface Table {
  headers: string[];
  rows: string[][];
  /** Set when the file had more rows than the row limit: rows kept and rows dropped. */
  cut?: { kept: number; dropped: number };
}

/** Fields every source row is normalised into (successor of the Python loader's output). */
export interface NormalizedFields {
  /** ISO date `YYYY-MM-DD`, or null when it did not parse. */
  date: string | null;
  account: string;
  description: string;
  info: string;
  /** Amount in euros, or null when it did not parse. */
  amount: number | null;
}

export type SignHandling =
  | { kind: "asis" }
  | { kind: "flip" }
  /** Separate debit (money out) and credit (money in) columns; amount = credit - debit. */
  | { kind: "debitCredit"; debit: string; credit: string };

/** How one kind of source file is read and mapped (successor of config/source_file_reader/*.yml). */
export interface SourceProfile {
  id: string;
  name: string;
  /** Regex matched against the start of the file name, as Python's re.match. */
  filePattern: string;
  /** Constant account name, used when accountColumn is not set. */
  account: string;
  /** Take the account from this source column instead of the constant. */
  accountColumn?: string;
  /** "auto" detects UTF-8 (with or without BOM), UTF-16 and falls back to windows-1252. */
  encoding: "auto" | "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";
  /** CSV delimiter, or "auto" to sniff it. Ignored for XLSX. */
  delimiter: string;
  /** Rows to skip before the header row. */
  skipRows: number;
  /** XLSX sheet name; empty means the first sheet. */
  sheet: string;
  /** Python strptime formats separated by "|", tried in order. */
  dateFormats: string;
  dayFirst: boolean;
  decimalSeparator: "," | ".";
  /** Thousands separator to strip, besides spaces which are always stripped. Empty for none. */
  thousandsSeparator: string;
  sign: SignHandling;
  columns: {
    date: string;
    /** Amount column; unused when sign is debitCredit. */
    amount: string;
    /** One or more columns, joined with concatSeparator. */
    description: string[];
    info: string[];
  };
  concatSeparator: string;
  /** Built-in preprocessor id that turns file bytes into a table before this profile applies. */
  preprocessor?: string;
}

export type AmountMatch = "pos" | "neg" | "zero" | "any";

/** A categorisation rule (successor of a categories.csv row). Empty patterns match everything. */
export interface Rule {
  id: string;
  account: string;
  description: string;
  info: string;
  amount: AmountMatch;
  class: string;
  category: string;
  subCategory: string;
}

/** Share of an account's rows given to an owner between two dates (successor of splits.csv). */
export interface Split {
  /** ISO date, inclusive. */
  start: string;
  /** ISO date, inclusive. */
  end: string;
  account: string;
  share: number;
  owner: string;
}

/** Override of one transaction's fields (successor of fixes.csv). Unset fields keep their value. */
export interface Fix {
  id: string;
  txId: string;
  /** Only the ledger row of this owner; unset means every owner's row of the transaction. */
  owner?: string;
  date?: string;
  description?: string;
  info?: string;
  amount?: number;
  class?: string;
  category?: string;
  subCategory?: string;
  /**
   * Splits the transaction into parts, each with its own amount and classification. Part amounts
   * are in the transaction's currency and add up to its original amount. A part with an owner goes
   * to that member in full; a part without one follows the account's split between members.
   */
  parts?: FixPart[];
}

export interface FixPart {
  amount: number;
  class: string;
  category: string;
  subCategory: string;
  owner?: string;
}

/** A monthly target (successor of targets.csv). */
export interface Target {
  name: string;
  start: string;
  end: string;
  owner: string;
  monthlyAmount: number;
  class: string;
  category: string;
  subCategory: string;
}

export type RowType = "Actual" | "Target";

/** A source row after import: its id, all its source columns and the derived fields. */
export interface SourceRow {
  txId: string;
  contentHash: string;
  occurrence: number;
  sourceFile: string;
  /** Every source column as exported: header -> text. */
  columns: Record<string, string>;
  fields: NormalizedFields;
}

/** A processed row: the equivalent of one final_data.csv row. */
export interface LedgerRow {
  /** Unique per ledger row: txId, txId + owner for split rows, or a target id. */
  rowId: string;
  /** Source transaction id; empty for target rows. */
  txId: string;
  /** ISO date. */
  date: string;
  /** `YYYY-MM`. */
  month: string;
  account: string;
  description: string;
  info: string;
  amountOriginal: number;
  class: string;
  category: string;
  subCategory: string;
  /** Id of the rule that set the category, the fix id when a fix did, or the target name. */
  ruleId: string;
  sourceFile: string;
  rowType: RowType;
  share: number;
  amount: number;
  owner: string;
  split: boolean;
}
