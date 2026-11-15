// Date fields in the user's language. The browser's own date input shows its own locale's format
// (12/31/2026 in an English browser), so in Finnish the field is text in the Finnish form 31.12.2026.
// Values in and out are ISO dates (YYYY-MM-DD).
import { html, raw } from "./html";
import { getLang } from "./texts";

/** ISO date as typed in a Finnish field: 31.12.2026. */
function finnish(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** A date input holding `iso`; `attrs` are the input's own attributes (data-*, aria-label). */
export function dateField(iso: string, attrs: string): string {
  if (getLang() !== "fi") return html`<input type="date" value="${iso}" ${raw(attrs)} />`;
  return html`<input type="text" class="date-text" inputmode="numeric" placeholder="pp.kk.vvvv" value="${finnish(iso)}" ${raw(attrs)} />`;
}

/** The ISO date a field holds (31.12.2026, 31.12.26 is not accepted, 2026-12-31), or null. */
export function parseDateField(text: string): string | null {
  const s = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
