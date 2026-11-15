// Number and date formatting by UI language (fi: 75 180,00 and 16.1.2024).
import { locale } from "./texts";

export function formatAmount(n: number, digits = 2): string {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat(locale()).format(n);
}

/** ISO `YYYY-MM-DD` to a local date without time zone shifts. */
export function formatDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(locale(), { timeZone: "UTC", day: "numeric", month: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}
