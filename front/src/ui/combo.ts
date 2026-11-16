// Searchable dropdown with "add new": an input that lists matching options while typing and offers
// to add the typed value when nothing matches exactly. Works on markup from combo() and is wired
// once per root with bindCombos(); options come from a callback, so they can depend on other fields.
import { html, raw } from "./html";
import { icon } from "./icons";
import { fmt, t } from "./texts";

/** Markup of one combo. `name` identifies it for the options callback. */
export function combo(
  name: string,
  value: string,
  opts: { placeholder?: string; disabled?: boolean; label?: string; attrs?: string } = {},
): string {
  return html`<div class="combo" data-combo="${name}">
    <input
      value="${value}"
      placeholder="${opts.placeholder ?? ""}"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="false"
      aria-label="${opts.label ?? name}"
      ${raw(opts.disabled ? "disabled" : "")}
      ${raw(opts.attrs ?? "")}
    /><span class="combo-caret" aria-hidden="true"></span>
    <div class="combo-list" role="listbox" hidden></div>
  </div>`;
}

export interface ComboSource {
  /** Options for a combo, given the element it sits in (to read neighbouring fields). */
  options(name: string, el: HTMLElement): string[];
  /** Label of what is added: "kategoria", "alakategoria". */
  noun(name: string): string;
  /** Called after a value is picked or typed. */
  picked?(name: string, el: HTMLElement, value: string): void;
}

export function bindCombos(root: HTMLElement, source: ComboSource): void {
  let active = -1;
  const parts = (input: HTMLInputElement) => {
    const box = input.closest<HTMLElement>(".combo")!;
    return { box, list: box.querySelector<HTMLElement>(".combo-list")!, name: box.dataset.combo ?? "" };
  };
  /** `typed`: filter by the text; otherwise (focus, arrow key) list everything, the current value marked. */
  const render = (input: HTMLInputElement, typed = true) => {
    const { box, list, name } = parts(input);
    const q = input.value.trim().toLowerCase();
    const all = source.options(name, box);
    const hits = typed ? all.filter((o) => o.toLowerCase().includes(q)) : all;
    const exact = all.some((o) => o.toLowerCase() === q);
    const items = hits.map(
      (o) => html`<button type="button" role="option" class="${o.toLowerCase() === q ? "current" : ""}" data-pick="${o}">${o}</button>`,
    );
    // adding a new value comes first, with a line under it, as in every list that can add
    if (q && !exact)
      items.unshift(
        html`<button type="button" role="option" class="add" data-pick="${input.value.trim()}">
          ${raw(icon("plus"))}${fmt("comboAdd", { what: source.noun(name), v: input.value.trim() })}
        </button>`,
      );
    if (items.length === 0) items.push(html`<div class="empty">${t("comboEmpty")}</div>`);
    list.innerHTML = items.join("");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    active = -1;
  };
  const close = (input: HTMLInputElement) => {
    const { list } = parts(input);
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };
  const pick = (input: HTMLInputElement, value: string) => {
    input.value = value;
    close(input);
    const { box, name } = parts(input);
    source.picked?.(name, box, value);
  };
  const inCombo = (e: Event) => {
    const el = e.target as HTMLElement;
    return el instanceof HTMLInputElement && el.closest(".combo") ? el : null;
  };
  root.addEventListener("focusin", (e) => {
    const input = inCombo(e);
    if (input) render(input, false);
  });
  root.addEventListener("input", (e) => {
    const input = inCombo(e);
    if (input) render(input);
  });
  root.addEventListener("focusout", (e) => {
    const input = inCombo(e);
    if (!input) return;
    // let a click on an option land first
    setTimeout(() => {
      if (document.activeElement !== input) {
        close(input);
        const { box, name } = parts(input);
        source.picked?.(name, box, input.value.trim());
      }
    }, 120);
  });
  root.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest(".combo-list")) e.preventDefault();
    // a click on the caret or a focused field reopens the list
    const box = (e.target as HTMLElement).closest<HTMLElement>(".combo");
    const input = box?.querySelector<HTMLInputElement>("input");
    if (input && document.activeElement === input && box!.querySelector<HTMLElement>(".combo-list")!.hidden) render(input, false);
  });
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".combo-list [data-pick]");
    if (!b) return;
    const input = b.closest(".combo")!.querySelector<HTMLInputElement>("input")!;
    pick(input, b.dataset.pick ?? "");
  });
  root.addEventListener("keydown", (e) => {
    // Esc on an option (reached with Tab) closes the list too, and puts the focus back in the field
    const onOption = (e.target as HTMLElement).closest?.<HTMLElement>(".combo-list");
    if (e.key === "Escape" && onOption && !onOption.hidden) {
      const field = onOption.closest(".combo")?.querySelector<HTMLInputElement>("input");
      if (field) {
        e.preventDefault();
        // focus first: focusing the field opens its list, which then closes
        field.focus();
        close(field);
        return;
      }
    }
    const input = inCombo(e);
    if (!input) return;
    const { list } = parts(input);
    const opts = [...list.querySelectorAll<HTMLButtonElement>("[data-pick]")];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.hidden) render(input, false);
      active = Math.max(0, Math.min(opts.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      opts.forEach((o, i) => o.classList.toggle("active", i === active));
    } else if (e.key === "Enter" && !list.hidden) {
      e.preventDefault();
      const q = input.value.trim().toLowerCase();
      const o =
        opts[active] ??
        opts.find((x) => (x.dataset.pick ?? "").toLowerCase() === q) ??
        opts.find((x) => x.classList.contains("add")) ??
        opts[0];
      if (o) pick(input, o.dataset.pick ?? "");
    } else if (e.key === "Escape" && !list.hidden) {
      // Esc closes the open list and nothing else: an editor around it (a drawer) sees the event as handled
      e.preventDefault();
      close(input);
    }
  });
}
