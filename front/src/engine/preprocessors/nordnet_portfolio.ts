// Nordnet portfolio report preprocessor (port of preprocessors/nordnet_portfolio.py).
// The report is one value per line; this labels the lines and pivots them into one row per
// (date, account, stock) with columns change, market_value, price, purchase_price, qty, share, currency.
import Papa from "papaparse";
import { decodeText } from "../decode";
import type { Table } from "../types";

const ACCOUNT = /aot/i;
const CASH = /likvidit varat/i;
const DATE = /(\d{1,2}\.\d{1,2}\.\d{4})/;
const CURRENCY = /^\d+,\d+\s+[A-Z]{3}$/i;

export const NORDNET_COLUMNS = [
  "date",
  "account",
  "stock",
  "change",
  "market_value",
  "price",
  "purchase_price",
  "qty",
  "share",
  "currency",
];

/** The report's lines, unquoted, blank lines dropped (as pandas read_csv with a "|" delimiter). */
export function reportLines(text: string): string[] {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { delimiter: "|", skipEmptyLines: true });
  return parsed.data.map((r) => r.join("|"));
}

export function nordnetPortfolio(bytes: Uint8Array): Table {
  const lines = reportLines(decodeText(bytes));
  const n = lines.length;
  const account: string[] = new Array<string>(n).fill("");
  const label: string[] = new Array<string>(n).fill("");
  const date: (string | null)[] = new Array<string | null>(n).fill(null);

  lines.forEach((t, i) => {
    if (ACCOUNT.test(t)) account[i] = "account";
    if (CURRENCY.test(t)) label[i] = "price";
    if (CASH.test(t)) label[i] = "cash";
  });

  let lastDate: string | null = null;
  lines.forEach((t, i) => {
    const m = DATE.exec(t);
    if (m) lastDate = m[1] ?? null;
    date[i] = lastDate;
  });

  const accountIdx = account.flatMap((a, i) => (a === "account" ? [i] : []));
  const priceIdx = label.flatMap((l, i) => (l === "price" ? [i] : []));
  const cashIdx = label.flatMap((l, i) => (l === "cash" ? [i] : []));
  const set = (arr: string[], i: number, v: string) => {
    if (i >= 0 && i < n) arr[i] = v;
  };

  for (const i of accountIdx) {
    set(account, i + 1, lines[i + 1] ?? "");
    set(account, i, "");
  }
  for (const i of priceIdx) {
    set(label, i - 1, "stock");
    set(label, i + 1, "purchase_price");
    set(label, i + 2, "qty");
    set(label, i + 3, "market_value");
    set(label, i + 4, "change");
    set(label, i + 5, "share");
  }
  for (const i of cashIdx) {
    set(label, i + 1, "market_value");
    set(label, i + 2, "share");
    set(label, i, "stock");
  }

  // forward fill account and stock
  let acc = "";
  let stock: string | null = null;
  const pivot = new Map<string, Record<string, string>>();
  const order: string[] = [];
  lines.forEach((t, i) => {
    if (account[i]) acc = account[i]!;
    if (label[i] === "stock") stock = t;
    const l = label[i];
    if (!l || l === "stock" || stock === null || date[i] === null) return;
    const key = JSON.stringify([date[i], acc, stock]);
    let row = pivot.get(key);
    if (!row) {
      row = { date: date[i]!, account: acc, stock };
      pivot.set(key, row);
      order.push(key);
    }
    if (l in row && l !== "date" && l !== "account" && l !== "stock") {
      throw new Error(`Nordnet report: duplicate ${l} for ${stock} on ${date[i]}`);
    }
    row[l] = t;
  });

  const rows = order.map((k) => {
    const r = pivot.get(k)!;
    if (r.price !== undefined) {
      const [price, ...rest] = r.price.replace(/\s/g, " ").split(" ");
      r.price = price ?? "";
      r.currency = rest.join(" ");
    }
    return NORDNET_COLUMNS.map((c) => r[c] ?? "");
  });
  return { headers: NORDNET_COLUMNS.slice(), rows };
}
