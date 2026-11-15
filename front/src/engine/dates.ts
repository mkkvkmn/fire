// Date parsing with Python strptime formats ("%d.%m.%Y|%Y-%m-%d"), as helpers.parse_date does.
// The result is floored to the day and returned as ISO `YYYY-MM-DD`.

const TOKEN: Record<string, string> = {
  Y: "(\\d{4})",
  y: "(\\d{2})",
  m: "(\\d{1,2})",
  d: "(\\d{1,2})",
  H: "(\\d{1,2})",
  I: "(\\d{1,2})",
  M: "(\\d{1,2})",
  S: "(\\d{1,2})",
  f: "(\\d{1,6})",
  p: "(AM|PM|am|pm)",
};

interface Compiled {
  re: RegExp;
  fields: string[];
}

const cache = new Map<string, Compiled>();

function compile(format: string): Compiled {
  const hit = cache.get(format);
  if (hit) return hit;
  let src = "";
  const fields: string[] = [];
  for (let i = 0; i < format.length; i++) {
    const ch = format[i] ?? "";
    if (ch === "%" && i + 1 < format.length) {
      const code = format[++i] ?? "";
      if (code === "%") {
        src += "%";
      } else if (TOKEN[code]) {
        src += TOKEN[code];
        fields.push(code);
      } else {
        throw new Error(`unsupported date format code %${code}`);
      }
    } else if (/\s/.test(ch)) {
      src += "\\s+";
    } else {
      src += ch.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
    }
  }
  const compiled = { re: new RegExp(`^${src}$`), fields };
  cache.set(format, compiled);
  return compiled;
}

export function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseOne(text: string, format: string): string | null {
  const { re, fields } = compile(format);
  const match = re.exec(text.trim());
  if (!match) return null;
  let y = 1900;
  let m = 1;
  let d = 1;
  let hour = 0;
  let pm: boolean | null = null;
  fields.forEach((code, i) => {
    const v = match[i + 1] ?? "";
    const n = Number(v);
    if (code === "Y") y = n;
    else if (code === "y") y = n < 69 ? 2000 + n : 1900 + n;
    else if (code === "m") m = n;
    else if (code === "d") d = n;
    else if (code === "H" || code === "I") hour = n;
    else if (code === "p") pm = v.toLowerCase() === "pm";
    else if (code === "M" && n > 59) hour = 99;
    else if (code === "S" && n > 61) hour = 99;
  });
  if (pm !== null && hour > 12) return null;
  if (hour > 23) return null;
  return isoDate(y, m, d);
}

/** Tries each "|"-separated format in order; null when none matches. */
export function parseDate(text: string, formats: string): string | null {
  if (!text || text.trim() === "") return null;
  for (const format of formats.split("|")) {
    const iso = parseOne(text, format);
    if (iso) return iso;
  }
  return null;
}

/** Last day of the month of an ISO date. */
export function monthEnd(year: number, month: number): string {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return isoDate(year, month, days) ?? "";
}

/** Parses the loose date forms found in the v2 config files: ISO `2023-06-01` or US `1/31/2023`. */
export function parseConfigDate(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return isoDate(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}
