// Guesses a profile for an unknown file from its table: date column and format, amount column and
// decimal separator, description and info columns. The wizard starts from the guess.
import { parseAmount } from "./amounts";
import { parseDate } from "./dates";
import type { SourceProfile, Table } from "./types";

export const DATE_FORMATS = [
  "%d.%m.%Y",
  "%Y-%m-%d",
  "%Y/%m/%d",
  "%d/%m/%Y",
  "%m/%d/%Y",
  "%d.%m.%y",
  "%d.%m.%Y %H:%M",
  "%d.%m.%Y %H:%M:%S",
  "%Y-%m-%d %H:%M:%S.%f|%Y-%m-%d %H:%M:%S",
  "%Y-%m-%dT%H:%M:%S",
];

// Header words in order of preference.
const DATE_HEADER = ["kirjauspäivä", "kirjaus", "päivämäärä", "päivä", "paiva", "pvm", "date", "booking"];
const AMOUNT_HEADER = ["summa", "amount", "määrä", "maara", "eur", "sum", "arvo", "value"];
const DESCRIPTION_HEADER = [
  "saajan nimi",
  "saaja",
  "otsikko",
  "description",
  "selite",
  "text",
  "nimi",
  "kuvaus",
  "payee",
  "merchant",
  "arvopaperi",
  "stock",
];
const INFO_HEADER = ["viesti", "info", "tapahtumalaji", "tapahtumatyyppi", "tyyppi", "message", "category", "kategoria"];

function values(table: Table, col: number, limit = 200): string[] {
  return table.rows
    .slice(0, limit)
    .map((r) => r[col] ?? "")
    .filter((v) => v.trim() !== "");
}

function share(vals: string[], ok: (v: string) => boolean): number {
  return vals.length === 0 ? 0 : vals.filter(ok).length / vals.length;
}

/** The first format that parses at least 90 % of the values, or null. */
export function guessDateFormat(vals: string[]): string | null {
  return DATE_FORMATS.find((f) => share(vals, (v) => parseDate(v, f) !== null) >= 0.9) ?? null;
}

export function guessDecimal(vals: string[]): "," | "." {
  const comma = vals.filter((v) => /\d,\d{1,2}$/.test(v.trim())).length;
  const dot = vals.filter((v) => /\d\.\d{1,2}$/.test(v.trim())).length;
  return dot > comma ? "." : ",";
}

function pick(headers: string[], words: string[], usable: (i: number) => boolean, exclude: number[] = []): number {
  const ok = (i: number) => !exclude.includes(i) && usable(i);
  const norm = headers.map((h) => h.trim().toLowerCase());
  // An exact header beats one that only contains the word ("Amount" over "Currency Amount");
  // earlier words beat later ones ("Summa" over "Määrä").
  for (const w of words) {
    const i = norm.findIndex((h, idx) => h === w && ok(idx));
    if (i >= 0) return i;
  }
  for (const w of words) {
    const i = norm.findIndex((h, idx) => h.includes(w) && ok(idx));
    if (i >= 0) return i;
  }
  return headers.findIndex((_, i) => ok(i));
}

export interface ProfileGuess {
  columns: SourceProfile["columns"];
  dateFormats: string;
  dayFirst: boolean;
  decimalSeparator: "," | ".";
}

export function guessProfile(table: Table): ProfileGuess {
  const { headers } = table;
  const dateFmt = headers.map((_, i) => guessDateFormat(values(table, i)));
  const dateCol = pick(headers, DATE_HEADER, (i) => dateFmt[i] !== null);
  const amountUsable = (i: number) => {
    const v = values(table, i);
    return v.length > 0 && share(v, (x) => parseAmount(x, { decimalSeparator: guessDecimal(v) }) !== null) >= 0.9;
  };
  const amountCol = pick(headers, AMOUNT_HEADER, (i) => i !== dateCol && amountUsable(i), [dateCol]);
  const textUsable = (i: number) => values(table, i).length > 0 && !amountUsable(i) && dateFmt[i] === null;
  const descCol = pick(headers, DESCRIPTION_HEADER, textUsable, [dateCol, amountCol]);
  const infoCol = pick(headers, INFO_HEADER, (i) => textUsable(i) && INFO_HEADER.some((w) => headers[i]!.toLowerCase().includes(w)), [
    dateCol,
    amountCol,
    descCol,
  ]);
  const format = dateCol >= 0 ? (dateFmt[dateCol] ?? "%d.%m.%Y") : "%d.%m.%Y";
  return {
    columns: {
      date: headers[dateCol] ?? "",
      amount: headers[amountCol] ?? "",
      description: descCol >= 0 ? [headers[descCol]!] : [],
      info: infoCol >= 0 ? [headers[infoCol]!] : [],
    },
    dateFormats: format,
    dayFirst: !format.startsWith("%Y") && !format.startsWith("%m"),
    decimalSeparator: amountCol >= 0 ? guessDecimal(values(table, amountCol)) : ",",
  };
}

/** A file name pattern from a file name: the part before digits, dates and the extension. */
export function patternFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const head = stem.split(/[_\- ]?\d/)[0] ?? stem;
  const base = head.length >= 3 ? head : stem;
  return base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
