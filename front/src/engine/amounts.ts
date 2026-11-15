// Amount parsing, a superset of the Python loader's cleaning: non-breaking and ordinary spaces,
// comma decimal, Unicode minus and a leading plus sign.

export function parseAmount(text: string, opts: { decimalSeparator?: "," | "."; thousandsSeparator?: string } = {}): number | null {
  const decimal = opts.decimalSeparator ?? ",";
  const thousands = opts.thousandsSeparator ?? "";
  let s = text.trim();
  if (s === "") return null;
  s = s.replace(/[\s\u00a0\u202f\u2009]/g, "").replace(/[\u2212\u2013]/g, "-");
  if (thousands) s = s.split(thousands).join("");
  if (decimal === ",") s = s.replace(/,/g, ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
