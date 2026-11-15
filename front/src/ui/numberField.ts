// Numbers as people type them: spaces as thousand separators, a decimal comma or point, and the
// minus sign (−) as well as a hyphen. NaN for an empty or unreadable field.

export function parseNumber(text: string): number {
  const v = Number(text.trim().replace(/\s/g, "").replace(",", ".").replace("−", "-"));
  return text.trim() === "" ? Number.NaN : v;
}
