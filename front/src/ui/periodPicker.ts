// Period picker for whole months: a trigger with the period name, arrows that step by the period's
// length, and a popover with quick choices and two year panels. "range" picks from..to, "month"
// picks one month (balances at the end of that month). Keeps its state across re-renders: the
// owning screen calls mount() on a fresh host element after each render.
import { addMonths, latestMonth, monthsBetween } from "../analytics/period";
import { html, raw } from "./html";
import { icon } from "./icons";
import { fmt, getLang, t, type TextKey } from "./texts";

export type Quick = "month" | "prevMonth" | "12" | "ytd" | "prev" | "all";

const MON_FI = ["tammi", "helmi", "maalis", "huhti", "touko", "kesä", "heinä", "elo", "syys", "loka", "marras", "joulu"];
const MON_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QUICK_LABEL: Record<Quick, TextKey> = {
  month: "quickMonth",
  prevMonth: "quickPrevMonth",
  "12": "quick12",
  ytd: "quickYtd",
  prev: "quickPrevYear",
  all: "quickAll",
};

function months(): string[] {
  return getLang() === "fi" ? MON_FI : MON_EN;
}

export function monthName(month: string): string {
  const m = Number(month.slice(5, 7));
  return `${months()[m - 1]} ${month.slice(0, 4)}`;
}

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** "Vuosi 2024", "Tammi–kesä 2024", "Marraskuu 2024" style period names. */
export function periodName(from: string, to: string): string {
  const mm = months();
  const [y1, m1] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [y2, m2] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  if (from === to) return cap(getLang() === "fi" ? `${mm[m1 - 1]}kuu ${y1}` : `${mm[m1 - 1]} ${y1}`);
  if (m1 === 1 && m2 === 12 && y1 === y2) return fmt("periodYear", { y: y1 });
  const short = (m: number) => (getLang() === "fi" ? mm[m - 1]! : mm[m - 1]!.slice(0, 3));
  if (y1 === y2) return cap(`${short(m1)}–${short(m2)} ${y1}`);
  return cap(`${short(m1)} ${y1} – ${short(m2)} ${y2}`);
}

export interface PickerOptions {
  mode: "range" | "month";
  quick: Quick[];
  /** First and last month that have data; months outside are marked. */
  first: () => string;
  last: () => string;
  onChange: (from: string, to: string) => void;
}

export class PeriodPicker {
  from = "";
  to = "";
  private open = false;
  private dFrom = "";
  private dTo = "";
  private anchor: string | null = null;
  private year = 0;
  private host: HTMLElement | null = null;
  /** The quick choice that set the period, so only it shows as chosen when two give the same months. */
  private picked: Quick | null = null;

  constructor(private readonly opts: PickerOptions) {
    document.addEventListener("click", (e) => {
      if (this.open && this.host && !this.host.contains(e.target as Node)) this.setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.open) this.setOpen(false);
    });
  }

  set(from: string, to: string): void {
    this.from = from;
    this.to = to;
  }

  /** Renders the picker into a host element (call after every render of the owning screen). */
  mount(host: HTMLElement | null): void {
    this.host = host;
    if (!host) return;
    host.classList.add("period");
    host.classList.toggle("open", this.open);
    host.innerHTML = this.markup();
    host.onclick = (e) => this.onClick(e);
  }

  /** The month quick choices count back from: the last complete month (see latestMonth). */
  private ref(): string {
    return latestMonth(this.opts.first(), this.opts.last());
  }

  private quickRange(q: Quick): [string, string] {
    const last = this.ref();
    const first = this.opts.first();
    const y = Number(last.slice(0, 4));
    switch (q) {
      case "month":
        return [last, last];
      case "prevMonth":
        return [addMonths(last, -1), addMonths(last, -1)];
      case "12":
        return [addMonths(last, -11), last];
      case "ytd":
        return [`${y}-01`, last];
      case "prev":
        return [`${y - 1}-01`, `${y - 1}-12`];
      case "all":
        return [first, this.opts.last()];
    }
  }

  private sub(): string {
    const last = this.ref();
    if (this.opts.mode === "month") return this.to === last ? t("periodEndLatest") : t("periodEnd");
    const n = monthsBetween(this.from, this.to).length;
    return fmt(this.to === last ? "periodMonthsLatest" : "periodMonths", { n });
  }

  private markup(): string {
    const last = this.opts.last();
    const first = this.opts.first();
    const trigger = html` <button
        type="button"
        class="step"
        data-p="prev"
        title="${t("periodPrev")}"
        aria-label="${t("periodPrev")}"
        ${raw(this.from <= first ? "disabled" : "")}
      >
        ${raw(icon("chevL"))}
      </button>
      <button type="button" class="trigger" data-p="toggle" aria-expanded="${String(this.open)}">
        <b>${periodName(this.from, this.to)}</b><span>${this.sub()}</span>
      </button>
      <button
        type="button"
        class="step"
        data-p="next"
        title="${t("periodNext")}"
        aria-label="${t("periodNext")}"
        ${raw(this.to >= last ? "disabled" : "")}
      >
        ${raw(icon("chevR"))}
      </button>`;
    if (!this.open) return trigger + '<div class="pop" hidden></div>';
    const panel = (y: number, side: "l" | "r") => {
      const cells = months()
        .map((name, i) => {
          const k = `${y}-${String(i + 1).padStart(2, "0")}`;
          const none = k < first || k > last;
          const cls = [
            "m",
            none ? "nodata" : "",
            k >= this.dFrom && k <= this.dTo ? "in" : "",
            k === this.dFrom ? "from" : "",
            k === this.dTo ? "to" : "",
          ].join(" ");
          return html`<button type="button" class="${cls}" data-m="${k}" title="${monthName(k)}${none ? ` · ${t("periodNoData")}` : ""}">
            ${name.slice(0, 3)}
          </button>`;
        })
        .join("");
      const nav =
        side === "l"
          ? html`<button type="button" data-p="yprev" title="${t("periodPrevYear")}" aria-label="${t("periodPrevYear")}">
                ${raw(icon("chevL"))}</button
              ><span>${y}</span><span class="ph"></span>`
          : html`<span class="ph"></span><span>${y}</span
              ><button type="button" data-p="ynext" title="${t("periodNextYear")}" aria-label="${t("periodNextYear")}">
                ${raw(icon("chevR"))}
              </button>`;
      return html`<div>
        <div class="yhead">${raw(nav)}</div>
        <div class="months">${raw(cells)}</div>
      </div>`;
    };
    const sel = this.anchor
      ? html`<b>${monthName(this.dFrom)} – …</b>${t("periodPickLast")}`
      : this.opts.mode === "month"
        ? html`<b>${monthName(this.dFrom)}</b>${t("periodEndOfMonth")}`
        : html`<b>${monthName(this.dFrom)} – ${monthName(this.dTo)}</b
            >${fmt("periodMonthsCount", { n: monthsBetween(this.dFrom, this.dTo).length })}`;
    // one choice shows as chosen: the one picked, else the first that gives the shown months
    const same = (q: Quick) => {
      const [a, z] = this.quickRange(q);
      return a === this.dFrom && z === this.dTo && !this.anchor;
    };
    const on = this.picked && same(this.picked) ? this.picked : (this.opts.quick.find(same) ?? null);
    const quick = this.opts.quick
      .map((q) => html`<button type="button" class="${q === on ? "on" : ""}" data-q="${q}">${t(QUICK_LABEL[q])}</button>`)
      .join("");
    return (
      trigger +
      html`<div class="pop">
        <div class="quick">${raw(quick)}</div>
        <div class="years">${raw(panel(this.year, "l") + panel(this.year + 1, "r"))}</div>
        <div class="foot">
          <div class="sel">${this.opts.mode === "month" ? t("periodChosenMonth") : t("periodChosen")}${raw(sel)}</div>
          <button type="button" class="ghost" data-p="cancel">${t("cancel")}</button>
          <button type="button" class="primary" data-p="apply">${t("periodApply")}</button>
        </div>
      </div>`
    );
  }

  private setOpen(v: boolean): void {
    this.open = v;
    if (v) {
      this.dFrom = this.from;
      this.dTo = this.to;
      this.anchor = null;
      this.year = Number(this.to.slice(0, 4)) - 1;
    }
    this.mount(this.host);
  }

  private commit(from: string, to: string): void {
    this.from = from;
    this.to = to;
    this.open = false;
    this.opts.onChange(from, to);
  }

  private onClick(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
    if (!b || b.disabled) return;
    e.stopPropagation();
    const n = this.opts.mode === "month" ? 1 : monthsBetween(this.from, this.to).length;
    switch (b.dataset.p) {
      case "toggle":
        return this.setOpen(!this.open);
      case "prev":
        this.picked = null;
        return this.commit(addMonths(this.from, -n), addMonths(this.to, -n));
      case "next":
        this.picked = null;
        return this.commit(addMonths(this.from, n), addMonths(this.to, n));
      case "yprev":
        this.year--;
        return this.mount(this.host);
      case "ynext":
        this.year++;
        return this.mount(this.host);
      case "cancel":
        return this.setOpen(false);
      case "apply":
        this.picked = null;
        return this.commit(this.dFrom, this.dTo);
    }
    if (b.dataset.q) {
      // a quick choice applies at once
      const q = b.dataset.q as Quick;
      const [from, to] = this.quickRange(q);
      this.picked = q;
      return this.commit(from, to);
    }
    const k = b.dataset.m;
    if (k) {
      if (this.opts.mode === "month") {
        this.dFrom = this.dTo = k;
      } else if (!this.anchor) {
        this.anchor = k;
        this.dFrom = this.dTo = k;
      } else {
        [this.dFrom, this.dTo] = this.anchor <= k ? [this.anchor, k] : [k, this.anchor];
        this.anchor = null;
      }
      this.mount(this.host);
    }
  }
}
