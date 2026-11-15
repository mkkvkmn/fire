// Source profiles: matching a file to its profile and mapping a source row to normalised fields
// (successor of s_02_reader.py file matching and s_03_loader.py column mapping and type conversion).
import { parseAmount } from "./amounts";
import { parseDate } from "./dates";
import type { NormalizedFields, SourceProfile } from "./types";

/** Defaults for a new profile; callers override what the wizard sets. */
export function defaultProfile(overrides: Partial<SourceProfile> & Pick<SourceProfile, "id" | "name">): SourceProfile {
  return {
    filePattern: "",
    account: overrides.name,
    encoding: "auto",
    delimiter: "auto",
    skipRows: 0,
    sheet: "",
    dateFormats: "%d.%m.%Y",
    dayFirst: true,
    decimalSeparator: ",",
    thousandsSeparator: "",
    sign: { kind: "asis" },
    columns: { date: "", amount: "", description: [], info: [] },
    concatSeparator: " ",
    ...overrides,
  };
}

/** First profile whose pattern matches the start of the file name, as Python's re.match. Temp files ("~") never match. */
export function matchProfile(fileName: string, profiles: SourceProfile[]): SourceProfile | undefined {
  if (fileName.includes("~")) return undefined;
  return profiles.find((p) => {
    if (!p.filePattern) return false;
    try {
      return new RegExp(`^(?:${p.filePattern})`).test(fileName);
    } catch {
      return false;
    }
  });
}

export function concatColumns(columns: Record<string, string>, names: string[], separator: string): string {
  // Values are kept as exported (Python kept trailing spaces too); empty ones are skipped.
  return names
    .map((n) => columns[n] ?? "")
    .filter((v) => v.trim() !== "")
    .join(separator);
}

/** Columns the profile reads that are missing from the headers. */
export function missingColumns(headers: string[], profile: SourceProfile): string[] {
  const needed = [profile.columns.date, ...profile.columns.description, ...profile.columns.info];
  if (profile.sign.kind === "debitCredit") needed.push(profile.sign.debit, profile.sign.credit);
  else needed.push(profile.columns.amount);
  if (profile.accountColumn) needed.push(profile.accountColumn);
  return needed.filter((c) => c !== "" && !headers.includes(c));
}

export function normalizeRow(columns: Record<string, string>, profile: SourceProfile): NormalizedFields {
  const num = (name: string) =>
    parseAmount(columns[name] ?? "", {
      decimalSeparator: profile.decimalSeparator,
      thousandsSeparator: profile.thousandsSeparator,
    });

  let amount: number | null;
  if (profile.sign.kind === "debitCredit") {
    const debit = num(profile.sign.debit);
    const credit = num(profile.sign.credit);
    amount = debit === null && credit === null ? null : (credit ?? 0) - Math.abs(debit ?? 0);
  } else {
    amount = num(profile.columns.amount);
    if (amount !== null && profile.sign.kind === "flip") amount = -amount;
  }
  if (amount === 0) amount = 0; // no negative zero

  const account = profile.accountColumn ? (columns[profile.accountColumn] ?? "").trim() || profile.account : profile.account;

  return {
    date: parseDate(columns[profile.columns.date] ?? "", profile.dateFormats),
    account,
    description: concatColumns(columns, profile.columns.description, profile.concatSeparator),
    info: concatColumns(columns, profile.columns.info, profile.concatSeparator),
    amount,
  };
}

/** Rows the Python loader dropped: no date and no description. */
export function isEmptyRow(fields: NormalizedFields): boolean {
  return fields.date === null && fields.description === "";
}
