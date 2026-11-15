// Importers for the Python v2 config: source profile .yml files, categories.csv, splits.csv,
// targets.csv and fixes.csv. Fixes are keyed by the old not_unique_id; mapFixesToTxIds finds the
// new tx_id for each by rebuilding the old id (helpers.create_id) for every ledger row.
import { normalizeAmountMatch } from "../categorize";
import { parseConfigDate } from "../dates";
import { parseAmount } from "../amounts";
import { defaultProfile } from "../profiles";
import { parseCsv } from "../tables";
import type { Fix, LedgerRow, Rule, SourceProfile, Split, Target } from "../types";

function records(csvText: string): Record<string, string>[] {
  const t = parseCsv(csvText, { delimiter: "," });
  return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function unquote(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** Parses the flat key/value .yml files of config/source_file_reader into a profile. */
export function profileFromV2Yaml(text: string, fallbackName: string): SourceProfile {
  const top: Record<string, string> = {};
  const columns: Record<string, string> = {};
  let inColumns = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indented = /^\s+/.test(line);
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = unquote(line.slice(0, idx));
    const value = unquote(line.slice(idx + 1));
    if (!indented) {
      inColumns = key === "columns";
      if (!inColumns) top[key] = value;
    } else if (inColumns) {
      columns[key] = value;
    }
  }
  const pattern = top.pattern ?? fallbackName;
  return defaultProfile({
    id: top.id ? `v2-${top.id}` : `v2-${pattern}`,
    name: pattern,
    filePattern: pattern,
    account: top.account ?? pattern,
    // v2 takes the account from the file when the profile maps an account column (s_03_loader)
    ...(columns.account ? { accountColumn: columns.account } : {}),
    delimiter: top.delimiter ? top.delimiter.replace(/^\\\\t$/, "\\t") : ",",
    dateFormats: top.date_format ?? "%d.%m.%Y",
    dayFirst: (top.day_first ?? "").toUpperCase() === "TRUE",
    decimalSeparator: ",",
    columns: {
      date: columns.date ?? "",
      amount: columns.amount ?? "",
      description: columns.description ? [columns.description] : [],
      info: columns.info ? [columns.info] : [],
    },
  });
}

export function rulesFromV2Csv(text: string): Rule[] {
  return records(text)
    .filter((r) => (r.id ?? "") !== "")
    .map((r) => ({
      id: r.id ?? "",
      account: r.account ?? "",
      description: r.description ?? "",
      info: r.info ?? "",
      amount: normalizeAmountMatch(r.amount ?? ""),
      class: r.class ?? "",
      category: r.category ?? "",
      subCategory: r.sub_category ?? "",
    }));
}

export function splitsFromV2Csv(text: string): Split[] {
  return records(text).flatMap((r) => {
    const start = parseConfigDate(r.start ?? "");
    const end = parseConfigDate(r.end ?? "");
    const share = Number(r.share);
    if (!start || !end || !Number.isFinite(share)) return [];
    return [{ start, end, account: r.account ?? "", share, owner: r.owner ?? "" }];
  });
}

export function targetsFromV2Csv(text: string): Target[] {
  return records(text).flatMap((r) => {
    const start = parseConfigDate(r.start ?? "");
    const end = parseConfigDate(r.end ?? "");
    const amount = Number(r.monthly_target_amount);
    if (!start || !end || !Number.isFinite(amount)) return [];
    return [
      {
        name: r.target_name ?? "",
        start,
        end,
        owner: r.owner ?? "",
        monthlyAmount: amount,
        class: r.class ?? "",
        category: r.category ?? "",
        subCategory: r.sub_category ?? "",
      },
    ];
  });
}

/** A v2 fix: the Fix fields plus the old transaction_id prefix. */
export interface V2Fix extends Omit<Fix, "txId"> {
  legacyId: string;
}

export function fixesFromV2Csv(text: string): V2Fix[] {
  return records(text)
    .filter((r) => (r.transaction_id ?? "") !== "")
    .map((r) => {
      const fix: V2Fix = { id: r.id ?? "", legacyId: r.transaction_id ?? "" };
      if (r.date) fix.date = parseConfigDate(r.date) ?? undefined;
      if (r.description) fix.description = r.description;
      if (r.info) fix.info = r.info;
      if (r.amount) fix.amount = parseAmount(r.amount, { decimalSeparator: "." }) ?? undefined;
      if (r.class) fix.class = r.class;
      if (r.category) fix.category = r.category;
      if (r.sub_category) fix.subCategory = r.sub_category;
      return fix;
    });
}

/** helpers.clean_string: drops whitespace, single underscores and common punctuation; keeps "__". */
export function cleanString(value: string): string {
  return value.replace(/(?<!_)_(?!_)|[\s–\-,.+!@#$%^&*()={}[\]|:;"'<>?/\\]/g, "");
}

/** Python's str() of a float: integers keep a ".0". */
export function pyFloat(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e16) return `${n}.0`;
  return String(n);
}

/** The v2 not_unique_id of a ledger row before fixes (s_06_add_id.py). */
export function legacyId(row: LedgerRow): string {
  return legacyParts(row, true);
}

function legacyParts(row: LedgerRow, withFile: boolean): string {
  const parts = [
    row.date.replace(/-/g, ""),
    row.account,
    row.description,
    row.info,
    pyFloat(row.amountOriginal),
    row.rowType,
    ...(withFile ? [row.sourceFile] : []),
    row.owner,
  ];
  return cleanString(parts.join("__").toLowerCase());
}

export interface FixMapping {
  fixes: Fix[];
  unmatched: V2Fix[];
}

/** A v2 row id without its source file part (the 7th of 8 "__" parts); null when it has fewer parts. */
function withoutFile(id: string): string | null {
  const parts = id.split("__");
  if (parts.length < 8) return null;
  parts.splice(6, 1);
  return parts.join("__");
}

/**
 * Finds each v2 fix's row as the Python fixer did (first row whose old id starts with it). A fix
 * whose row is not there is matched without the file name: v3 imports a row in two files once, so
 * a fix made on the copy in the other file still finds the same transaction.
 */
export function mapFixesToTxIds(v2fixes: V2Fix[], unfixedLedger: LedgerRow[]): FixMapping {
  const ids = unfixedLedger.map((r) => ({ row: r, id: legacyId(r), noFile: legacyParts(r, false) }));
  const fixes: Fix[] = [];
  const unmatched: V2Fix[] = [];
  // v2 lets a fix id be empty or repeat; v3 keys fixes by id, so those get a suffix (order stays,
  // so a later fix on the same row still wins, as in v2)
  const used = new Set<string>();
  const uniqueId = (id: string) => {
    const stem = id || "v2fix";
    let out = id || `${stem}-1`;
    for (let n = 2; used.has(out); n++) out = `${stem}-${n}`;
    used.add(out);
    return out;
  };
  for (const f of v2fixes) {
    const loose = withoutFile(f.legacyId);
    const hit =
      ids.find((x) => x.row.txId && x.id.startsWith(f.legacyId)) ?? (loose ? ids.find((x) => x.row.txId && x.noFile === loose) : undefined);
    if (!hit) {
      unmatched.push(f);
      continue;
    }
    const { legacyId: _legacy, ...rest } = f;
    void _legacy;
    fixes.push({ ...rest, id: uniqueId(rest.id), txId: hit.row.txId, ...(hit.row.split ? { owner: hit.row.owner } : {}) });
  }
  return { fixes, unmatched };
}
