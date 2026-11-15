// Pieces shared by the report pages: the filter bar, clickable numbers and number formats.
import type { Model } from "../../analytics/measures";
import type { Period, Preset } from "../../analytics/period";
import type { Drill, ReportState } from "../../app/reportState";
import { html, raw } from "../../ui/html";
import { locale, t } from "../../ui/texts";

export function eur(v: number | null): string {
  return v === null ? "" : new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(Math.round(v) || 0);
}

export function thousands(v: number | null): string {
  return v === null ? "" : new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v / 1000);
}

export function pct(v: number | null, digits = 0): string {
  return v === null
    ? ""
    : new Intl.NumberFormat(locale(), { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function years(v: number | null): string {
  return v === null ? "" : new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
}

/** Month label: `2024/KK01` in Finnish, `2024/M01` in English. */
export function monthLabel(month: string): string {
  return `${month.slice(0, 4)}/${t("monthPrefix")}${month.slice(5, 7)}`;
}

/** Period as text, `1.2024 - 12.2024`. */
export function periodLabel(p: Period): string {
  const f = (m: string) => `${Number(m.slice(5, 7))}.${m.slice(0, 4)}`;
  return p.from === p.to ? f(p.from) : `${f(p.from)} - ${f(p.to)}`;
}

export function drillAttr(d: Drill): string {
  return JSON.stringify(d);
}

/** A number that opens Tapahtumat with the rows behind it. */
export function num(text: string, drill: Drill | null): string {
  if (!drill || text === "") return html`${text}`;
  return html`<button type="button" class="num-link" data-drill="${drillAttr(drill)}">${text}</button>`;
}

export function card(label: string, value: string, extra = ""): string {
  return html`<div class="kpi">
    <div class="kpi-value">${raw(value)}</div>
    <div class="kpi-label">${label}</div>
    ${raw(extra)}
  </div>`;
}

/** Wires the filter bar inputs of a screen root to the state. */
export function bindFilterBar(root: HTMLElement, state: ReportState): void {
  root.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const key = el.dataset.rf;
    if (!key) return;
    const month = /^\d{4}-\d{2}$/;
    switch (key) {
      case "owner":
        state.set({ owner: el.value });
        break;
      case "preset": {
        const preset = el.value as Preset;
        const p = state.period();
        state.set({ preset, custom: preset === "custom" && p ? p : state.filters.custom });
        break;
      }
      case "from":
      case "to":
        if (month.test(el.value)) state.set({ custom: { ...state.filters.custom, [key]: el.value } });
        break;
      case "comparison":
        state.set({ comparison: el.value === "prevYear" ? "prevYear" : "prevMonth" });
        break;
      case "thousands":
        state.set({ thousands: el.value === "1" });
        break;
    }
  });
}

/**
 * The report bar shared by Seurantanäkymä and Tapahtumat: the period picker first (mounted by the
 * screen into [data-period]), the page's own controls, and the member filter last. `second` is an
 * optional second row for the page's own filters (Tapahtumat: search and categories).
 */
export function reportBar(state: ReportState, model: Model, middle: string, second = ""): string {
  const f = state.filters;
  const opt = (v: string, label: string, sel: boolean) => html`<option value="${v}" ${raw(sel ? "selected" : "")}>${label}</option>`;
  return html`<section class="card report-bar" aria-label="${t("filters")}">
    <div class="filters">
      <div data-period></div>
      ${raw(middle)}
      <span class="grow"></span>
      <select class="owner" data-rf="owner" aria-label="${t("colOwner")}">
        ${raw(opt("", t("allOwners"), f.owner === "") + model.owners.map((o) => opt(o, o, o === f.owner)).join(""))}
      </select>
    </div>
    ${raw(second ? html`<div class="filters second">${raw(second)}</div>` : "")}
  </section>`;
}
