// The "Show more" footer of a paged table (Tapahtumat, Tuonti's groups and staged rows), and the
// focus after its click: the redraw replaces the button the focus was on.
import { formatCount } from "./format";
import { html, raw } from "./html";
import { fmt, t, type TextKey } from "./texts";

/**
 * "Showing a of n" and a "Show more" button while rows are left; nothing when no row matches (the
 * table says so itself). `action` is the button's data attribute, e.g. ["imp", "moreRows"].
 */
export function showMoreFoot(shown: number, total: number, text: TextKey, action: [string, string]): string {
  if (total === 0) return "";
  return html`<div class="actions card-foot">
    <span class="small muted">${fmt(text, { a: formatCount(shown), n: formatCount(total) })}</span><span class="grow"></span>
    ${raw(total > shown ? html`<button type="button" class="sm" data-${raw(action[0])}="${action[1]}">${t("showMoreRows")}</button>` : "")}
  </div>`;
}

/**
 * Focuses the "Show more" button again, or, once every row shows and the button is gone, the first
 * control of the first new row. `before` is the number of table rows before the redraw.
 */
export function refocusShowMore(root: ParentNode, button: string, table: string, before: number): void {
  const more = root.querySelector<HTMLElement>(button);
  if (more) {
    more.focus();
    return;
  }
  const row = root.querySelectorAll(`${table} tbody > tr`)[before];
  row?.querySelector<HTMLElement>("button, a[href], input, select, [tabindex]")?.focus();
}
