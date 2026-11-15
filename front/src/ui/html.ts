// HTML helpers. Every dynamic value written into markup goes through escapeHtml.

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** Tagged template that escapes every interpolated value. Use raw() to opt out for trusted markup. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    out += v instanceof RawHtml ? v.value : escapeHtml(v);
    out += strings[i + 1] ?? "";
  });
  return out;
}

export class RawHtml {
  constructor(readonly value: string) {}
}

export function raw(value: string): RawHtml {
  return new RawHtml(value);
}
