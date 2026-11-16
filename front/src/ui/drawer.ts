// The one editor drawer of the app: from the right on a wide screen, a sheet from the bottom on a
// phone (styles: .drawer in style.css). Only its body changes per use. Tallenna saves and closes;
// Peruuta (also the X and a click outside) puts things back and closes. The caller handles the
// buttons through the attribute it gives for each (`data-act="drawerSave"`, `data-imp="..."`).
import { html, raw } from "./html";
import { icon } from "./icons";
import { t } from "./texts";

export interface DrawerOptions {
  title: string;
  /** The editor's fields, as markup. */
  body: string;
  /** Attributes of the Tallenna button, and of Peruuta, the X and the backdrop. */
  save: string;
  cancel: string;
  /** Attributes of a Poista button; none without. */
  del?: string;
  /** A check that failed on Tallenna, shown above the buttons. */
  error?: string;
  /** The confirm button's text when it does not save yet ("Käytä": the page saves later). */
  saveLabel?: string;
}

/** The drawer open on the page shown now (a hidden screen keeps its drawer for when it shows again). */
export function openDrawer(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>(".drawer")].find((d) => !d.closest("[hidden]")) ?? null;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';

/**
 * Keeps Tab and Shift+Tab inside an open drawer: it is a modal dialog, so the page behind it is
 * out of reach until it closes. Installed once for the whole app (main.ts).
 */
export function trapDrawerFocus(): void {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const d = openDrawer();
    if (!d) return;
    const items = [...d.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getClientRects().length > 0);
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    const at = document.activeElement;
    if (!d.contains(at)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && (at === first || at === d)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

export function drawer(o: DrawerOptions): string {
  return html`<button type="button" class="drawer-backdrop" ${raw(o.cancel)} aria-label="${t("cancel")}" tabindex="-1"></button>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${o.title}" tabindex="-1">
      <header class="drawer-head">
        <h3>${o.title}</h3>
        <button type="button" class="sm ghost icon-only" ${raw(o.cancel)} title="${t("cancel")}" aria-label="${t("cancel")}">
          ${raw(icon("x"))}
        </button>
      </header>
      <div class="drawer-body">${raw(o.body)}</div>
      <footer class="drawer-foot">
        ${raw(o.error ? html`<p class="bad-text small drawer-error">${o.error}</p>` : "")}
        <div class="actions">
          <button type="button" class="primary" ${raw(o.save)}>${o.saveLabel ?? t("save")}</button>
          <button type="button" ${raw(o.cancel)}>${t("cancel")}</button>
          <span class="grow"></span>
          ${raw(
            o.del === undefined
              ? ""
              : html`<button type="button" class="ghost danger-text" ${raw(o.del)}>${raw(icon("trash"))}${t("remove")}</button>`,
          )}
        </div>
      </footer>
    </aside>`;
}
