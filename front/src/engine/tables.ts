// Reads CSV text and XLSX bytes into Tables. Header names follow pandas: duplicates get ".1", ".2",
// empty headers become "Unnamed: <index>", so names stay compatible with the Python profiles.
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { checkFileSize, MAX_SHEET_COLUMNS, MAX_SHEET_ROWS } from "./limits";
import type { Table } from "./types";

export function dedupeHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    const base = h.trim() === "" ? `Unnamed: ${i}` : h;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}.${count}`;
  });
}

const DELIMITERS = [";", ",", "\t", "|"];

export interface Layout {
  delimiter: string;
  /** Lines before the header row (title lines some exports start with). */
  skipRows: number;
}

/**
 * Guesses the delimiter and the header row: the delimiter whose most common column count (above
 * one) covers the most of the first lines, and the first line with that count as the header.
 */
export function guessLayout(text: string): Layout {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .slice(0, 30);
  let best: Layout = { delimiter: ",", skipRows: 0 };
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => (l.trim() === "" ? 0 : (Papa.parse<string[]>(l, { delimiter: d }).data[0]?.length ?? 0)));
    const freq = new Map<number, number>();
    for (const c of counts) if (c >= 2) freq.set(c, (freq.get(c) ?? 0) + 1);
    let mode = 0;
    let modeFreq = 0;
    for (const [c, f] of freq) {
      if (f > modeFreq || (f === modeFreq && c > mode)) {
        mode = c;
        modeFreq = f;
      }
    }
    if (mode < 2) continue;
    const score = modeFreq * 100 + mode;
    if (score > bestScore) {
      bestScore = score;
      // blank lines are dropped before skipping, so count only non-blank lines before the header
      const headerLine = counts.findIndex((c) => c === mode);
      const skipRows = lines.slice(0, headerLine).filter((l) => l.trim() !== "").length;
      best = { delimiter: d, skipRows };
    }
  }
  return best;
}

export function sniffDelimiter(text: string): string {
  return guessLayout(text).delimiter;
}

function normaliseDelimiter(delimiter: string): string {
  // Python profiles store a tab as the two characters "\t".
  return delimiter === "\\t" ? "\t" : delimiter;
}

function toTable(matrix: string[][], skipRows: number): Table {
  const nonEmpty = matrix.slice(skipRows).filter((r) => r.some((c) => c.trim() !== ""));
  const [header, ...rest] = nonEmpty;
  if (!header) return { headers: [], rows: [] };
  const headers = dedupeHeaders(header);
  const rows = rest.map((r) => headers.map((_, i) => r[i] ?? ""));
  return { headers, rows };
}

export function parseCsv(text: string, opts: { delimiter?: string; skipRows?: number } = {}): Table {
  const delimiter = !opts.delimiter || opts.delimiter === "auto" ? sniffDelimiter(text) : normaliseDelimiter(opts.delimiter);
  // one line ending throughout: Papa takes it from the first line, so a file edited with mixed
  // endings would join rows; pandas reads such files row by row
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const result = Papa.parse<string[]>(lines, { delimiter, newline: "\n", skipEmptyLines: false });
  return toTable(result.data, opts.skipRows ?? 0);
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Excel serial date to text in the form pandas gives a timestamp read as str. */
export function excelSerialToText(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = days from 1899-12-30 to 1970-01-01
  const d = new Date(ms);
  const base =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const millis = d.getUTCMilliseconds();
  return millis === 0 ? base : `${base}.${pad(millis, 3)}000`;
}

export function sheetNames(bytes: Uint8Array): string[] {
  checkFileSize(bytes);
  return XLSX.read(bytes, { type: "array", bookSheets: true }).SheetNames;
}

/** maxRows is the row limit; only a test passes it, to avoid a 200 000 row fixture. */
export function parseXlsx(bytes: Uint8Array, opts: { sheet?: string; skipRows?: number; maxRows?: number } = {}): Table {
  checkFileSize(bytes);
  const sheetRows = (opts.maxRows ?? MAX_SHEET_ROWS) + (opts.skipRows ?? 0) + 1;
  const wb = XLSX.read(bytes, { type: "array", cellDates: false, cellNF: true, sheetRows });
  const name = opts.sheet && wb.SheetNames.includes(opts.sheet) ? opts.sheet : wb.SheetNames[0];
  const ws = name ? wb.Sheets[name] : undefined;
  if (!ws || !ws["!ref"]) return { headers: [], rows: [] };
  // a sheet may claim a far larger range than it has cells: read only up to the last real cell
  const range = XLSX.utils.decode_range(ws["!ref"]);
  let lastRow = range.s.r;
  let lastCol = range.s.c;
  for (const key of Object.keys(ws)) {
    if (key.startsWith("!")) continue;
    const at = XLSX.utils.decode_cell(key);
    if (at.r > lastRow) lastRow = at.r;
    if (at.c > lastCol) lastCol = at.c;
  }
  // sheetRows keeps the sheet rows 1..sheetRows (absolute) and leaves the full range in !fullref.
  // dropped counts sheet rows past the limit, blank rows included. A crafted range with no cells
  // behind it also warns: a false warning is better than silent loss.
  const full = ws["!fullref"] ? XLSX.utils.decode_range(ws["!fullref"]) : range;
  const cut = Math.max(0, full.e.r + 1 - sheetRows);
  range.e.r = Math.min(range.e.r, lastRow);
  range.e.c = Math.min(range.e.c, lastCol, range.s.c + MAX_SHEET_COLUMNS - 1);
  const matrix: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      row.push(cellText(cell));
    }
    matrix.push(row);
  }
  const table = toTable(matrix, opts.skipRows ?? 0);
  return cut > 0 ? { ...table, cut: { kept: table.rows.length, dropped: cut } } : table;
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.z && XLSX.SSF.is_date(cell.z as string)) return excelSerialToText(cell.v);
    return String(cell.v);
  }
  if (cell.t === "d" && cell.v instanceof Date) {
    return excelSerialToText(cell.v.getTime() / 86400000 + 25569);
  }
  if (cell.t === "b") return cell.v ? "True" : "False";
  return String(cell.v);
}

export function isXlsxName(fileName: string): boolean {
  return /\.(xlsx|xlsm|xls)$/i.test(fileName);
}
