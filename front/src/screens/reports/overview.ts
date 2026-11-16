// Seurantanäkymä: one report page. YHTEENVETO (key figures, income and spending, wealth, and the
// yearly comparison) and TARKEMPI ANALYYSI with three tabs: Tulot & menot, Varallisuus and FiRe.
import { projectFire } from "../../analytics/fire";
import { flowTree, FLOWS, type FlowKind, type FlowNode } from "../../analytics/flows";
import {
  avg12,
  balance,
  hasInvestments,
  INVESTMENT_CATEGORIES,
  kassaVuosina,
  lastInvestmentMonth,
  lastYear,
  menot,
  nettovarallisuus,
  saasto,
  saastoPct,
  sijoitusvarallisuus,
  snapshotMonth,
  targetProgress,
  tulot,
  type Measure,
  type Model,
  type RowFilter,
} from "../../analytics/measures";
import { addMonths, monthsBetween, shiftPeriod, type Period } from "../../analytics/period";
import type { ReportState } from "../../app/reportState";
import type { FireSettings } from "../../storage/project";
import { renderChart, type Series } from "../../ui/charts";
import { html, raw } from "../../ui/html";
import { parseNumber } from "../../ui/numberField";
import { icon, type IconName } from "../../ui/icons";
import { PeriodPicker, periodName } from "../../ui/periodPicker";
import { fmt, locale, t, type TextKey } from "../../ui/texts";
import { bindFilterBar, eur, num, pct, reportBar } from "./common";
import { pickGoal, pickedGoals } from "./goalPick";

type Main = "flows" | "wealth" | "fire";
type FlowTab = "all" | "tulot" | "menot" | "osingot";
type WealthTab = "all" | "varat" | "velat";
type Grain = "month" | "quarter" | "year";

interface Bucket {
  label: string;
  axis: string;
  period: Period;
}

/** Where FiRe assumptions were kept before they moved into the project; read once as a fallback. */
const FIRE_KEY = "fire.fireInputs";

type FireForm = FireSettings;
const FIRE_DEFAULTS: FireForm = { spend: null, invest: 500, ret: 7, tax: 25 };

function legacyFire(): Partial<FireForm> | null {
  try {
    return JSON.parse(localStorage.getItem(FIRE_KEY) ?? "null") as Partial<FireForm> | null;
  } catch {
    return null;
  }
}

/** `2024-12` as `12/2024`. */
const mmyyyy = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

function buckets(p: Period, grain: Grain): Bucket[] {
  const out = new Map<string, Bucket>();
  for (const m of monthsBetween(p.from, p.to)) {
    const q = Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1;
    const key = grain === "year" ? m.slice(0, 4) : grain === "quarter" ? `${m.slice(0, 4)}/Q${q}` : m;
    const b = out.get(key);
    if (b) b.period.to = m;
    else
      out.set(key, {
        label: grain === "month" ? mmyyyy(m) : key,
        axis: grain === "month" ? `${m.slice(5, 7)}/${m.slice(2, 4)}` : key,
        period: { from: m, to: m },
      });
  }
  return [...out.values()];
}

function signed(v: number, text: string): string {
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${text}`;
}

/** Change as a percentage of |before|: "+6,2 %". */
function pctChange(now: number, before: number): string {
  if (before === 0) return "";
  const v = (now - before) / Math.abs(before);
  return signed(v, pct(Math.abs(v), 1));
}

function nf(v: number, digits = 1): string {
  return new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** The overview's tabs and chart step, remembered in this browser (a view, not project data). */
const VIEW_KEY = "fire.overviewView";

/** Target rows in Tunnusluvut: the card has room for this many beside the four-row Varallisuus card. */
const GOAL_ROWS = 2;

function loadView(): { main?: Main; flowTab?: FlowTab; wealthTab?: WealthTab; grain?: Grain | null; goals?: string[] } {
  try {
    return (JSON.parse(localStorage.getItem(VIEW_KEY) ?? "null") as ReturnType<typeof loadView> | null) ?? {};
  } catch {
    return {};
  }
}

export class OverviewScreen {
  private main: Main = loadView().main ?? "flows";
  private flowTab: FlowTab = loadView().flowTab ?? "all";
  private wealthTab: WealthTab = loadView().wealthTab ?? "all";
  private grain: Grain | null = loadView().grain ?? null;
  /** The targets picked for the Tunnusluvut rows, by name (used when there are more than fit). */
  private goals: string[] = loadView().goals ?? [];
  /** The targets the card shows now, row by row: what a pick swaps against. */
  private shownGoals: string[] = [];
  private open = new Set<string>();
  private yearly = false;
  /** A chart column picked to focus the table below it; cleared when the columns change. */
  private focus: Period | null = null;
  /** What the top-left cell of the Tulot & menot table shows: the focus chip or a hint. */
  private tableLead = "";
  private readonly picker: PeriodPicker;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: ReportState,
  ) {
    this.picker = new PeriodPicker({
      mode: "range",
      quick: ["month", "12", "ytd", "prev", "all"],
      first: () => this.state.model()?.firstMonth ?? "",
      last: () => this.state.model()?.lastMonth ?? "",
      onChange: (from, to) => this.state.set({ preset: "custom", custom: { from, to } }),
    });
    bindFilterBar(root, state);
    root.addEventListener("click", (e) => this.onClick(e));
    root.addEventListener("change", (e) => this.onChange(e));
    root.addEventListener(
      "toggle",
      (e) => {
        if ((e.target as HTMLElement).matches?.("details.yearly")) this.yearly = (e.target as HTMLDetailsElement).open;
      },
      true,
    );
  }

  render(): void {
    const m = this.state.model();
    const p = this.state.period();
    if (!m || !p) {
      this.root.innerHTML = html`<div class="page-head">
          <div>
            <div class="eyebrow">${t("navGroupReports")}</div>
            <h1>${t("navOverview")}</h1>
          </div>
        </div>
        <section class="card empty-state">
          <h3>${t("overviewEmptyTitle")}</h3>
          <p class="muted">${t("overviewEmptyBody")}</p>
          <a class="btn primary" href="#/import/files">${raw(icon("import"))}${t("importFilesLink")}</a>
        </section>`;
      return;
    }
    this.picker.set(p.from, p.to);
    const vsSel = html`<select data-rf="vs" aria-label="${t("comparison")}">
      ${raw((["prevYear", "target", "none"] as const).map((v) => html`<option value="${v}" ${raw(this.state.filters.vs === v ? "selected" : "")}>${t(VS_LABEL[v])}</option>`).join(""))}
    </select>`;
    this.root.innerHTML = html` <div class="page-head">
        <div>
          <div class="eyebrow">${t("navGroupReports")}</div>
          <h1>${t("navOverview")}</h1>
        </div>
        <div class="filters"><button type="button" data-o="pdf" title="${t("pdfHelp")}">${raw(icon("download"))}PDF</button></div>
      </div>
      ${raw(reportBar(this.state, m, vsSel))}
      <h2 class="section-title">${t("summaryTitle")}</h2>
      <div class="group">${raw(this.cards(m, p))}${raw(this.yearTable(m))}</div>
      <h2 class="section-title">${t("analysisTitle")}</h2>
      <section class="card analysis">
        <div class="tabs main-tabs" role="tablist">
          ${raw(this.mainTab("flows", "flows", "tabFlows"))}${raw(this.mainTab("wealth", "wealth", "tabWealth"))}${raw(this.mainTab("fire", "flame", "tabFire"))}
        </div>
        ${raw(this.main === "flows" ? this.flowsPanel(m, p) : this.main === "wealth" ? this.wealthPanel(m, p) : this.firePanel(m, p))}
      </section>`;
    this.picker.mount(this.root.querySelector<HTMLElement>("[data-period]"));
    for (const bar of this.root.querySelectorAll<HTMLElement>("[data-progress]")) bar.style.width = `${bar.dataset.progress}%`;
  }

  private mainTab(id: Main, ic: IconName, label: TextKey): string {
    return html`<button
      type="button"
      role="tab"
      class="${this.main === id ? "on" : ""}"
      aria-selected="${String(this.main === id)}"
      data-main="${id}"
    >
      ${raw(icon(ic))}${t(label)}
    </button>`;
  }

  // ---- comparison

  private vs(): "prevYear" | "target" | "none" {
    const v = this.state.filters.vs;
    return v === "target" && !this.state.targetModel()?.rows.length ? "prevYear" : v;
  }

  /** The comparison value of a flow measure, or null when nothing is compared. */
  private compare(m: Model, p: Period, measure: Measure, f?: RowFilter): number | null {
    const vs = this.vs();
    if (vs === "none") return null;
    if (vs === "target") return measure(this.state.targetModel()!, p, f);
    return lastYear(m, p, measure, f);
  }

  /**
   * The targets of the period in Tunnusluvut: one row each, in the room the card has beside the
   * four-row Varallisuus card (GOAL_ROWS), so it never grows. With more targets than rows, each
   * row's name is a picker and the choice is remembered in this browser.
   */
  private goalRows(m: Model, p: Period): string {
    const tm = this.state.targetModel();
    const all = tm ? targetProgress(m, tm, p) : [];
    const line = (label: string, sub: string, value: string, extra = "") =>
      html`<div class="row goal-row">
        ${raw(icon("target"))}<span class="k">${raw(label)}<small>${raw(sub)}</small></span
        ><span class="v">${raw(value)}${raw(extra)}</span>
      </div>`;
    if (!all.length)
      return line(html`${t("goals")}`, html`${t("noGoal")}`, html`<a href="#/settings/targets" class="small">${t("setGoal")}</a>`);
    const pick = all.length > GOAL_ROWS;
    const shown = pick
      ? pickedGoals(
          this.goals,
          all.map((g) => g.name),
          GOAL_ROWS,
        )
      : all.map((g) => g.name);
    this.shownGoals = shown;
    return shown
      .map((name, i) => {
        const g = all.find((x) => x.name === name)!;
        const label = pick
          ? html`<select data-o="goalPick" data-i="${i}" class="goal-pick" aria-label="${fmt("goalPick", { n: i + 1 })}">
              ${raw(all.map((x) => html`<option value="${x.name}" ${x === g ? "selected" : ""}>${x.name}</option>`).join(""))}
            </select>`
          : html`${g.name}`;
        const ratio = g.goal === 0 ? null : g.actual / g.goal;
        // colour only for a result: green when an income or savings target is reached, red when a
        // budget is exceeded; anything still under way stays grey
        const tone = ratio === null ? "" : g.lowerIsBetter ? (ratio > 1 ? "down" : "") : ratio >= 1 ? "up" : "";
        return line(
          label,
          html`${t(g.lowerIsBetter ? "goalBudget" : "goalTarget")}`,
          num(pct(ratio), { filter: {}, target: g.name }),
          html`<span class="delta ${tone}" title="${t(g.lowerIsBetter ? "goalLowerBetter" : "goalHigherBetter")}"
            >${raw(num(eur(Math.abs(g.actual)), { filter: {}, target: g.name }))} / ${eur(Math.abs(g.goal))} €</span
          >`,
        );
      })
      .join("");
  }

  private delta(now: number, before: number | null, goodUp: boolean, text?: string): string {
    if (before === null) return "";
    const d = text ?? pctChange(now, before);
    if (!d) return "";
    const up = now - before >= 0;
    return html`<span class="delta ${up === goodUp ? "up" : "down"}">${d}</span>`;
  }

  // ---- YHTEENVETO

  private cards(m: Model, p: Period): string {
    const snap = snapshotMonth(m, p) ?? p.to;
    const vs = this.vs();
    const before = vs === "none" ? null : addMonths(snap, -12);
    const row = (ic: IconName, label: string, sub: string, value: string, delta: string, extra = "") =>
      html`<div class="row">
        ${raw(icon(ic))}<span class="k">${label}${raw(sub ? html`<small>${sub}</small>` : "")}</span
        ><span class="v">${raw(value)}${raw(delta)}${raw(extra)}</span>
      </div>`;

    // Tunnusluvut
    const sp = saastoPct(m, p);
    const spBefore = vs === "none" ? null : vs === "target" ? saastoPct(this.state.targetModel()!, p) : saastoPct(m, shiftPeriod(p, -12));
    const spDelta =
      sp !== null && spBefore !== null
        ? this.delta(sp, spBefore, true, signed(sp - spBefore, fmt("ppUnit", { n: nf(Math.abs(sp - spBefore) * 100, 0) })))
        : "";
    const kv = kassaVuosina(m, snap);
    const kvBefore = before ? kassaVuosina(m, before) : null;
    const kvDelta =
      kv !== null && kvBefore !== null
        ? this.delta(kv, kvBefore, true, signed(kv - kvBefore, fmt("yearsUnit", { n: nf(Math.abs(kv - kvBefore)) })))
        : "";
    const key = html`<section class="card kv-card hero">
      <h2>${t("cardKeyFigures")}</h2>
      <div class="kv">
        ${raw(row("piggy", t("saastoPct"), t("saastoPctSub"), pct(sp), spDelta))}
        ${raw(row("hourglass", t("kassaVuosina"), t("kassaSub"), kv === null ? "-" : fmt("yearsUnit", { n: nf(kv) }), kvDelta))}
        ${raw(this.goalRows(m, p))}
      </div>
    </section>`;

    // Tulot & menot
    const ti = tulot(m, p);
    const me = menot(m, p);
    const sa = saasto(m, p);
    const flows = html`<section class="card kv-card">
      <h2>${t("tabFlows")}</h2>
      <div class="kv">
        ${raw(row("income", t("tulot"), "", `${num(eur(ti), { filter: { class: "tulot" }, period: p })} €`, this.delta(ti, this.compare(m, p, tulot), true)))}
        ${raw(row("spend", t("menot"), "", `${num(eur(me), { filter: { class: "menot" }, period: p })} €`, this.delta(me, this.compare(m, p, menot), false)))}
        ${raw(row("coins", t("savedLabel"), t("savedSub"), `${eur(sa)} €`, this.delta(sa, this.compare(m, p, saasto), true)))}
      </div>
    </section>`;

    // Varallisuus
    const bal = (f: RowFilter) => [balance(m, snap, f), before ? balance(m, before, f) : null] as const;
    const [va, vaB] = bal({ class: "varat" });
    const [ve, veB] = bal({ class: "velat" });
    const net = nettovarallisuus(m, snap);
    const netB = before ? nettovarallisuus(m, before) : null;
    const inv = sijoitusvarallisuus(m, snap);
    const invB = before ? sijoitusvarallisuus(m, before) : null;
    const at = (f: RowFilter) => ({ filter: { classes: ["varat", "velat"], ...f }, period: { from: snap, to: snap } });
    const wealth = html`<section class="card kv-card">
      <h2>${t("tabWealth")}</h2>
      <div class="kv">
        ${raw(row("assets", t("varat"), fmt("atMonthEnd", { m: mmyyyy(snap) }), `${num(eur(va), at({ class: "varat" }))} €`, this.delta(va, vaB, true)))}
        ${raw(row("debt", t("velat"), "", `${num(eur(ve), at({ class: "velat" }))} €`, ve === 0 ? "" : this.delta(ve, veB, true)))}
        ${raw(row("scale", t("nettovarallisuus"), t("netSub"), `${eur(net)} €`, this.delta(net, netB, true)))}
        ${raw(row("invest", t("sijoitusvarallisuus"), "", `${num(eur(inv), at({ categories: ["sijoitusvarallisuus", "sijoitusvelat"] }))} €`, this.delta(inv, invB, true)))}
      </div>
    </section>`;
    return html`<div class="grid g-3 sections">${raw(key)}${raw(flows)}${raw(wealth)}</div>`;
  }

  private yearTable(m: Model): string {
    const firstY = Number(m.firstMonth.slice(0, 4));
    const lastY = Number(m.lastMonth.slice(0, 4));
    const rows: string[] = [];
    for (let y = lastY; y >= firstY; y--) {
      const p = { from: `${y}-01`, to: `${y}-12` };
      const n = m.coveredMonths(p);
      const snap = snapshotMonth(m, p);
      const net = snap ? nettovarallisuus(m, snap) : null;
      // change during the year: from the end of last year, or from the first month with data
      const start =
        snapshotMonth(m, { from: `${y - 1}-01`, to: `${y - 1}-12` }) ?? monthsBetween(p.from, p.to).find((mo) => m.hasData(mo)) ?? null;
      const change = net !== null && start && start !== snap ? net - nettovarallisuus(m, start) : null;
      const me = menot(m, p);
      const kv = snap ? kassaVuosina(m, snap) : null;
      const year =
        n < 12
          ? html`${y} <span class="muted small" title="${fmt("partialYear", { n })}">· ${fmt("monthsShort", { n })}</span>`
          : html`${y}`;
      rows.push(
        html`<tr>
          <td>${raw(year)}</td>
          <td class="num">${raw(num(`${eur(tulot(m, p))} €`, { filter: { class: "tulot" }, period: p }))}</td>
          <td class="num">${raw(num(`${eur(me)} €`, { filter: { class: "menot" }, period: p }))}</td>
          <td class="num">${n ? `${eur(me / n)} €` : ""}</td>
          <td class="num">${eur(saasto(m, p))} €</td>
          <td class="num">${pct(saastoPct(m, p))}</td>
          <td class="num">${net === null ? "" : `${eur(net)} €`}</td>
          <td class="num ${change === null ? "" : change >= 0 ? "up" : "down"}">
            ${change === null ? "" : `${signed(change, eur(Math.abs(change)))} €`}
          </td>
          <td class="num">${snap ? `${eur(sijoitusvarallisuus(m, snap))} €` : ""}</td>
          <td class="num">${kv === null ? "" : fmt("yearsUnit", { n: nf(kv) })}</td>
        </tr>`,
      );
    }
    return html`<details class="yearly card" ${raw(this.yearly ? "open" : "")}>
      <summary>
        <span class="title">${t("yearlyTitle")}</span
        ><span class="muted small" title="${t("yearlyHelp")}">${fmt("yearlySub", { a: firstY, b: lastY })}</span>
      </summary>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("year")}</th>
              <th class="num">${t("tulot")}</th>
              <th class="num">${t("menot")}</th>
              <th class="num">${t("spendPerMonth")}</th>
              <th class="num">${t("saasto")}</th>
              <th class="num">${t("saastoPct")}</th>
              <th class="num">${t("nettovarallisuus")}</th>
              <th class="num" title="${t("netChangeHelp")}">${t("netChange")}</th>
              <th class="num">${t("sijoitusvarallisuus")}</th>
              <th class="num">${t("kassaVuosina")}</th>
            </tr>
          </thead>
          <tbody>
            ${raw(rows.join(""))}
          </tbody>
        </table>
      </div>
    </details>`;
  }

  // ---- TARKEMPI ANALYYSI: Tulot & menot

  private flowsPanel(m: Model, p: Period): string {
    const months = monthsBetween(p.from, p.to).length;
    const grain = this.grain ?? (months > 36 ? "year" : months > 18 ? "quarter" : "month");
    const bs = buckets(p, grain);
    const pills = (["all", "tulot", "menot", "osingot"] as FlowTab[])
      .map(
        (x) =>
          html`<button type="button" class="${this.flowTab === x ? "on" : ""}" data-flowtab="${x}">
            ${t(x === "all" ? "summaryTitle" : x)}
          </button>`,
      )
      .join("");
    const seg = (["month", "quarter", "year"] as Grain[])
      .map(
        (g) =>
          html`<button type="button" class="${g === grain ? "on" : ""}" data-grain="${g}" title="${t(GRAIN_HELP[g])}">
            ${t(GRAIN_LABEL[g])}
          </button>`,
      )
      .join("");
    // a picked column focuses the table on its months; the table's numbers open the rows
    if (this.focus && !bs.some((b) => b.period.from === this.focus!.from && b.period.to === this.focus!.to)) this.focus = null;
    const picked = this.focus ? bs.findIndex((b) => b.period.from === this.focus!.from && b.period.to === this.focus!.to) : null;
    const tp = this.focus ?? p;
    // the focus chip (or how to focus) sits in the table's empty top-left cell
    this.tableLead = this.focus
      ? html`<button type="button" class="pill accent chip" data-focusclear title="${t("focusClear")}">
          ${fmt("focusChip", { p: periodName(this.focus.from, this.focus.to) })} ${raw(icon("x"))}
        </button>`
      : html`<span class="muted small focus-hint">${t("focusHint")}</span>`;
    let chart: string;
    let table: string;
    if (this.flowTab === "all") {
      chart = renderChart({
        title: t("chartFlowsAll"),
        categories: bs.map((b) => b.label),
        axis: bs.map((b) => b.axis),
        width: 1000,
        series: [
          { name: t("tulot"), role: "tulot", kind: "bar", values: bs.map((b) => tulot(m, b.period)) },
          { name: t("menot"), role: "menot", kind: "bar", values: bs.map((b) => menot(m, b.period)) },
          { name: t("saasto"), role: "net", kind: "line", values: bs.map((b) => saasto(m, b.period)) },
          ...this.compareSeries(m, bs, t("saasto"), saasto, "line"),
        ],
        format: (v) => `${eur(v)} €`,
        pick: { selected: picked },
      });
      table = this.summaryTable(m, tp);
    } else {
      const kind = this.flowTab as FlowKind;
      const spec = FLOWS[kind];
      chart = renderChart({
        title: fmt("chartFlowOne", { name: t(kind) }),
        categories: bs.map((b) => b.label),
        axis: bs.map((b) => b.axis),
        width: 1000,
        series: [
          { name: t(kind), role: kind === "menot" ? "menot" : "tulot", kind: "bar", values: bs.map((b) => spec.measure(m, b.period)) },
          ...this.compareSeries(m, bs, t(kind), spec.measure, "bar"),
          { name: t("avg12Long"), role: "net", kind: "line", values: bs.map((b) => avg12(m, b.period.to, spec.measure)) },
        ],
        format: (v) => `${eur(v)} €`,
        pick: { selected: picked },
      });
      table = this.flowTable(m, tp, kind);
    }
    return html`<div class="card-bar">
        <div class="tabs pills" role="tablist">${raw(pills)}</div>
        <span class="grow"></span>
        <div class="seg sm">${raw(seg)}</div>
      </div>
      ${raw(chart)}
      <div class="table-wrap analysis-table">${raw(table)}</div>`;
  }

  /** Focuses the table on a chart column; the same column again clears it. */
  private pickColumn(i: number): void {
    const m = this.state.model();
    const p = this.state.period();
    if (!m || !p) return;
    const months = monthsBetween(p.from, p.to).length;
    const b = buckets(p, this.grain ?? (months > 36 ? "year" : months > 18 ? "quarter" : "month"))[i];
    if (!b) return;
    const same = this.focus?.from === b.period.from && this.focus?.to === b.period.to;
    this.focus = same ? null : b.period;
    this.render();
  }

  /** The chosen comparison as a chart series: a grey bar (or dashed line) per bucket. */
  private compareSeries(m: Model, bs: Bucket[], name: string, measure: Measure, kind: "bar" | "line"): Series[] {
    const vs = this.vs();
    if (vs === "none") return [];
    const tm = this.state.targetModel()!;
    const values = bs.map((b) => (vs === "target" ? measure(tm, b.period) : measure(m, shiftPeriod(b.period, -12))));
    return [{ name: fmt(vs === "target" ? "seriesTarget" : "seriesPrevYear", { name }), role: "vrt", kind, dash: kind === "line", values }];
  }

  private flowHead(p: Period, firstCol: string, valueCol: string): string {
    const vs = this.vs();
    const cmp =
      vs === "none"
        ? ""
        : html`<th colspan="2" title="${t("comparison")}">${t(vs === "target" ? "vsTargetGroup" : "vsPrevYearGroup")}</th>`;
    const cmpCols =
      vs === "none"
        ? ""
        : html`<th class="num">${t(vs === "target" ? "targetCol" : "prevYearCol")}</th>
            <th class="num">${t("change")}</th>`;
    return html`<thead>
      <tr class="grp">
        <th class="lead">${raw(this.tableLead)}</th>
        <th colspan="2">${t("selectedPeriod")}</th>
        ${raw(cmp)}
        <th colspan="3" title="${t("avg12Help")}">${t("avg12Long")}</th>
      </tr>
      <tr>
        <th>${firstCol}</th>
        <th class="num sorted">${valueCol}</th>
        <th class="num">%</th>
        ${raw(cmpCols)}
        <th class="num">${mmyyyy(p.to)}</th>
        <th class="num">${mmyyyy(addMonths(p.to, -12))}</th>
        <th class="num">${t("change")}</th>
      </tr>
    </thead>`;
  }

  private flowCells(
    m: Model,
    p: Period,
    measure: Measure,
    f: RowFilter | undefined,
    amount: number,
    share: number | null,
    goodUp: boolean,
    drillF: RowFilter | null,
  ): string {
    const before = this.compare(m, p, measure, f);
    const a12 = avg12(m, p.to, measure, f);
    const a12b = avg12(m, addMonths(p.to, -12), measure, f);
    const cls = (now: number, b: number | null) => (b === null || now === b ? "" : now - b > 0 === goodUp ? "up" : "down");
    const cmp =
      before === null
        ? ""
        : html`<td class="num">${eur(before)}</td>
            <td class="num ${cls(amount, before)}">${pctChange(amount, before)}</td>`;
    return html`<td class="num">${raw(drillF ? num(eur(amount), { filter: drillF, period: p }) : eur(amount))}</td>
      <td class="num">${pct(share)}</td>
      ${raw(cmp)}
      <td class="num">${eur(a12)}</td>
      <td class="num">${eur(a12b)}</td>
      <td class="num ${a12 === null || a12b === null ? "" : cls(a12, a12b)}">
        ${a12 === null || a12b === null ? "" : pctChange(a12, a12b)}
      </td>`;
  }

  private summaryTable(m: Model, p: Period): string {
    const ti = tulot(m, p);
    const line = (label: string, measure: Measure, goodUp: boolean, f: RowFilter | null) => {
      const v = measure(m, p);
      return html`<tr>
        <td><span class="exp-ph"></span>${label}</td>
        ${raw(this.flowCells(m, p, measure, undefined, v, ti === 0 ? null : v / ti, goodUp, f))}
      </tr>`;
    };
    const sp = saastoPct(m, p);
    const vs = this.vs();
    const spB = vs === "none" ? null : vs === "target" ? saastoPct(this.state.targetModel()!, p) : saastoPct(m, shiftPeriod(p, -12));
    const spCells =
      vs === "none"
        ? ""
        : html`<td class="num">${pct(spB)}</td>
            <td class="num ${sp !== null && spB !== null && sp >= spB ? "up" : "down"}">
              ${sp !== null && spB !== null ? signed(sp - spB, fmt("ppUnit", { n: nf(Math.abs(sp - spB) * 100, 1) })) : ""}
            </td>`;
    return html`<table class="detail wide flow">
      ${raw(this.flowHead(p, t("colItem"), t("colSum")))}
      <tbody>
        ${raw(line(t("tulot"), tulot, true, { class: "tulot" }))} ${raw(line(t("menot"), menot, false, { class: "menot" }))}
        ${raw(line(t("saasto"), saasto, true, null))}
        <tr class="total">
          <td>${t("saastoPct")}</td>
          <td class="num"></td>
          <td class="num">${pct(sp)}</td>
          ${raw(spCells)}
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
        </tr>
      </tbody>
    </table>`;
  }

  private flowTable(m: Model, p: Period, kind: FlowKind): string {
    const spec = FLOWS[kind];
    const nodes = flowTree(m, kind, p).filter((n) => !n.inactive);
    const total = spec.measure(m, p);
    const goodUp = kind !== "menot";
    const rows: string[] = [];
    const walk = (list: FlowNode[], depth: number, path: string) => {
      for (const n of list) {
        const key = `${kind}${path}/${n.label}`;
        const kids = n.children.filter((c) => !c.inactive);
        const open = this.open.has(key);
        const exp = kids.length
          ? html`<button
              type="button"
              class="exp"
              data-exp="${key}"
              aria-expanded="${String(open)}"
              title="${open ? t("collapse") : t("expand")}"
              aria-label="${open ? t("collapse") : t("expand")}"
            >
              ${open ? "−" : "+"}
            </button>`
          : html`<span class="exp-ph"></span>`;
        const share = total === 0 ? null : n.amount / total;
        const own = Object.fromEntries(Object.entries(n.filter).filter(([k]) => !(k in spec.base))) as RowFilter;
        rows.push(
          html`<tr class="${depth > 0 ? "sub" : ""} depth-${depth}">
            <td>${raw(exp)}<span>${n.label || t("unnamed")}</span></td>
            ${raw(this.flowCells(m, p, spec.measure, own, n.amount, share, goodUp, n.filter))}
          </tr>`,
        );
        if (open) walk(kids, depth + 1, `${path}/${n.label}`);
      }
    };
    walk(nodes, 0, "");
    const totalRow = html`<tr class="total">
      <td>${fmt("totalOf", { name: t(kind) })}</td>
      ${raw(this.flowCells(m, p, spec.measure, undefined, total, total === 0 ? null : 1, goodUp, spec.base))}
    </tr>`;
    return html`<table class="detail wide flow">
      ${raw(this.flowHead(p, t(kind === "osingot" ? "colSource" : "colCategory"), t(kind)))}
      <tbody>
        ${raw(rows.join(""))}${raw(totalRow)}
      </tbody>
    </table>`;
  }

  // ---- TARKEMPI ANALYYSI: Varallisuus

  private wealthPanel(m: Model, p: Period): string {
    const snap = snapshotMonth(m, p) ?? p.to;
    const before = this.vs() === "none" ? null : addMonths(snap, -12);
    const months = monthsBetween(p.from, p.to);
    const has = months.map((mo) => m.hasData(mo));
    const pills = (["all", "varat", "velat"] as WealthTab[])
      .map(
        (x) =>
          html`<button type="button" class="${this.wealthTab === x ? "on" : ""}" data-wealthtab="${x}">
            ${t(x === "all" ? "summaryTitle" : x)}
          </button>`,
      )
      .join("");
    const at = (mo: string, f: RowFilter) =>
      JSON.stringify({ filter: { classes: ["varat", "velat"], ...f }, period: { from: mo, to: mo } });
    const base = {
      categories: months.map((mo) => mmyyyy(mo)),
      axis: months.map((mo) => `${mo.slice(5, 7)}/${mo.slice(2, 4)}`),
      width: 1000,
      format: (v: number) => `${eur(v)} €`,
    };
    const val = (f: RowFilter) => months.map((mo, i) => (has[i] ? balance(m, mo, f) : null));
    /** The same balance a year earlier, when a comparison is chosen (balances have no targets). */
    const ago = (fn: (mo: string) => number) =>
      months.map((mo) => {
        const b = addMonths(mo, -12);
        return m.hasData(b) ? fn(b) : null;
      });
    // varat split into investments and the rest, stacked
    const inv = val({ class: "varat", categories: INVESTMENT_CATEGORIES });
    const other = val({ class: "varat" }).map((v, i) => (v === null ? null : v - (inv[i] ?? 0)));
    let chart: string;
    if (this.wealthTab === "all") {
      chart = renderChart({
        ...base,
        title: t("chartWealthAll"),
        stackTotals: { varat: t("varatTotal") },
        series: [
          { name: t("sijoitukset"), role: "sij", kind: "bar", stack: "varat", values: inv },
          { name: t("muutVarat"), role: "inv", kind: "bar", stack: "varat", values: other },
          { name: t("velat"), role: "menot", kind: "bar", values: val({ class: "velat" }) },
          {
            name: t("nettovarallisuus"),
            role: "net",
            kind: "line",
            values: months.map((mo, i) => (has[i] ? nettovarallisuus(m, mo) : null)),
          },
          ...(before
            ? [
                {
                  name: fmt("seriesYearAgo", { name: t("nettovarallisuus") }),
                  role: "vrt" as const,
                  kind: "line" as const,
                  dash: true,
                  values: ago((mo) => nettovarallisuus(m, mo)),
                },
              ]
            : []),
        ],
        drill: (i, s) =>
          has[i] && s.kind === "bar"
            ? at(
                months[i]!,
                s.role === "menot"
                  ? { class: "velat" }
                  : s.role === "sij"
                    ? { class: "varat", categories: INVESTMENT_CATEGORIES }
                    : { class: "varat" },
              )
            : null,
      });
    } else {
      const cls = this.wealthTab;
      const series: Series[] =
        cls === "varat"
          ? [
              { name: t("sijoitukset"), role: "sij", kind: "bar", stack: "varat", values: inv },
              { name: t("muutVarat"), role: "inv", kind: "bar", stack: "varat", values: other },
            ]
          : [{ name: t(cls), role: "menot", kind: "bar", values: val({ class: cls }) }];
      if (before)
        series.push({
          name: fmt("seriesYearAgo", { name: t(cls) }),
          role: "vrt",
          kind: "bar",
          values: ago((mo) => balance(m, mo, { class: cls })),
        });
      chart = renderChart({
        ...base,
        title: fmt("chartBalanceOne", { name: t(cls) }),
        stackTotals: { varat: t("varatTotal") },
        series,
        drill: (i, s) => (has[i] && s.role !== "vrt" ? at(months[i]!, { class: cls }) : null),
      });
    }
    return html`<div class="card-bar">
        <div class="tabs pills" role="tablist">${raw(pills)}</div>
        <span class="grow"></span><span class="small muted">${t("balanceAtMonthEnd")}</span>
      </div>
      ${raw(chart)}
      <div class="table-wrap analysis-table">${raw(this.balanceTable(m, snap, before))}</div>`;
  }

  private balanceTable(m: Model, snap: string, before: string | null): string {
    const head = html`<thead>
      <tr class="grp">
        <th></th>
        <th colspan="2">${fmt("atEndOf", { m: mmyyyy(snap) })}</th>
        ${raw(before ? html`<th colspan="3">${t("vsYearEarlier")}</th>` : "")}
      </tr>
      <tr>
        <th>${t("colCategory")}</th>
        <th class="num sorted">${t("colBalance")}</th>
        <th class="num">%</th>
        ${raw(
          before
            ? html`<th class="num">${mmyyyy(before)}</th>
                <th class="num">${t("changeEur")}</th>
                <th class="num">${t("changePct")}</th>`
            : "",
        )}
      </tr>
    </thead>`;
    const drill = (mo: string, f: RowFilter) => ({ filter: { classes: ["varat", "velat"], ...f }, period: { from: mo, to: mo } });
    const line = (label: string, f: RowFilter, share: number | null, cls = "", exp = "", sumFn?: (mo: string) => number) => {
      const now = sumFn ? sumFn(snap) : balance(m, snap, f);
      const b = before === null ? null : sumFn ? sumFn(before) : balance(m, before, f);
      const ch = b === null ? null : now - b;
      const good = ch === null ? "" : ch >= 0 ? "up" : "down";
      return html`<tr class="${cls}">
        <td>${raw(exp || '<span class="exp-ph"></span>')}<span>${label}</span></td>
        <td class="num">${raw(num(eur(now), sumFn ? null : drill(snap, f)))}</td>
        <td class="num">${pct(share)}</td>
        ${raw(
          b === null
            ? ""
            : html`<td class="num">${eur(b)}</td>
                <td class="num ${good}">${signed(ch!, eur(Math.abs(ch!)))}</td>
                <td class="num ${good}">${pctChange(now, b)}</td>`,
        )}
      </tr>`;
    };
    if (this.wealthTab === "all") {
      return html`<table class="detail wide">
        ${raw(head)}
        <tbody>
          ${raw(line(t("varat"), { class: "varat" }, null))}${raw(line(t("velat"), { class: "velat" }, null))}
          ${raw(line(t("sijoitusvarallisuus"), {}, null, "", "", (mo) => sijoitusvarallisuus(m, mo)))}
          ${raw(line(t("nettovarallisuus"), {}, null, "total", "", (mo) => nettovarallisuus(m, mo)))}
        </tbody>
      </table>`;
    }
    const cls = this.wealthTab;
    const total = balance(m, snap, { class: cls });
    const rows = m
      .rowsIn({ from: snap, to: snap }, { class: cls })
      .concat(before ? m.rowsIn({ from: before, to: before }, { class: cls }) : []);
    const cats = new Map<string, Set<string>>();
    for (const r of rows) {
      const c = r.category.toLowerCase();
      if (!cats.has(c)) cats.set(c, new Set());
      if (r.subCategory) cats.get(c)!.add(r.subCategory.toLowerCase());
    }
    const body: string[] = [];
    for (const [c, subs] of [...cats.entries()].sort(
      (a, b) => Math.abs(balance(m, snap, { class: cls, category: b[0] })) - Math.abs(balance(m, snap, { class: cls, category: a[0] })),
    )) {
      const key = `bal/${cls}/${c}`;
      const open = this.open.has(key);
      const exp =
        subs.size > 1
          ? html`<button
              type="button"
              class="exp"
              data-exp="${key}"
              aria-expanded="${String(open)}"
              title="${open ? t("collapse") : t("expand")}"
              aria-label="${open ? t("collapse") : t("expand")}"
            >
              ${open ? "−" : "+"}
            </button>`
          : "";
      const v = balance(m, snap, { class: cls, category: c });
      body.push(line(c || t("unnamed"), { class: cls, category: c }, total === 0 ? null : v / total, "", exp));
      if (open)
        for (const s of [...subs].sort())
          body.push(
            line(
              s,
              { class: cls, category: c, subCategory: s },
              total === 0 ? null : balance(m, snap, { class: cls, category: c, subCategory: s }) / total,
              "sub",
            ),
          );
    }
    body.push(line(fmt("totalOf", { name: t(cls) }), { class: cls }, total === 0 ? null : 1, "total"));
    return html`<table class="detail wide">
      ${raw(head)}
      <tbody>
        ${raw(body.join(""))}
      </tbody>
    </table>`;
  }

  // ---- TARKEMPI ANALYYSI: FiRe

  /** The FiRe assumptions: the project's, else the ones this browser kept before, else defaults. */
  private get fire(): FireForm {
    const own = this.state.session.state.project?.getSettings().fire ?? legacyFire();
    return { ...FIRE_DEFAULTS, ...(own ?? {}) };
  }

  private firePanel(m: Model, p: Period): string {
    // investments from the latest month they are known
    const last = lastInvestmentMonth(m) ?? m.lastMonth;
    // the same 12-month average the Menot table shows for the chosen period
    const spendMonth = p.to;
    const cut = last < spendMonth;
    const spendData = avg12(m, spendMonth, menot) ?? 0;
    const f = this.fire;
    const spend = f.spend ?? Math.round(spendData);
    const start = sijoitusvarallisuus(m, last);
    const r = projectFire({
      spendMonthly: spend,
      investMonthly: f.invest,
      returnRate: f.ret / 100,
      taxRate: f.tax / 100,
      start,
      startMonth: last,
    });
    const kv = kassaVuosina(m, last);
    const targetYears = 25 / (1 - Math.min(f.tax, 95) / 100);
    const input = (key: keyof FireForm, label: string, value: number, unit: string, hint: string, mode = "decimal", extra = "") =>
      html`<label class="field"
        >${label}<span class="pct ${extra ? "has-reset" : ""}"
          ><input
            data-fire="${key}"
            value="${nf(value, key === "spend" || key === "invest" ? 0 : 1).replace(/[.,]0$/, "")}"
            inputmode="${mode}"
          />${raw(extra)}<span>${unit}</span></span
        >${raw(hint)}</label
      >`;
    // only spending has a value from the data to go back to: the eraser sits in its field
    const spendHint =
      f.spend === null
        ? html`<small>${fmt("fireSpendFromMonth", { m: mmyyyy(spendMonth) })}</small>`
        : html`<small>${fmt("fireSpendOwnVs", { v: eur(Math.round(spendData)), m: mmyyyy(spendMonth) })}</small>`;
    const spendReset =
      f.spend === null
        ? ""
        : html`<button
            type="button"
            class="ghost icon-only field-reset"
            data-o="fireReset"
            title="${t("fireReset")}"
            aria-label="${t("fireReset")}"
          >
            ${raw(icon("eraser"))}
          </button>`;
    const date = r.month
      ? html`<b>${mmyyyy(r.month)}</b
          ><span class="small muted"
            >${r.months === 0 ? t("fireReached") : fmt("fireIn", { y: Math.floor(r.months! / 12), m: r.months! % 12 })}</span
          >`
      : html`<b>-</b><span class="small muted">${t("fireNever")}</span>`;

    // chart 1: year-end investments, actual then forecast, with the target line
    const firstY = Number(m.firstMonth.slice(0, 4));
    const lastY = Number(last.slice(0, 4));
    const actualYears: { year: number; value: number; need: number; spend: number }[] = [];
    for (let y = firstY; y <= lastY; y++) {
      const snap = [...monthsBetween(`${y}-01`, `${y}-12`)].reverse().find((mo) => mo <= last && hasInvestments(m, mo));
      if (!snap) continue;
      const sp = avg12(m, snap, menot) ?? 0;
      actualYears.push({ year: y, value: sijoitusvarallisuus(m, snap), need: (sp * 12 * 25) / (1 - Math.min(f.tax, 95) / 100), spend: sp });
    }
    const forecast = r.years.filter((x) => x.year > lastY);
    const labels = [...actualYears.map((x) => String(x.year)), ...forecast.map((x) => String(x.year))];
    const fireIdx = r.month ? labels.indexOf(r.month.slice(0, 4)) : -1;
    const chart1 = renderChart({
      title: t("fireChart1"),
      categories: labels,
      width: 1000,
      height: 280,
      overlay: true,
      series: [
        { name: t("fireActual"), role: "net", kind: "bar", values: [...actualYears.map((x) => x.value), ...forecast.map(() => null)] },
        {
          name: t("fireForecast"),
          role: "forecast",
          kind: "bar",
          values: [...actualYears.map(() => null), ...forecast.map((x) => x.value)],
        },
        {
          name: t("fireNeeded"),
          role: "tulot",
          kind: "line",
          dash: true,
          dots: false,
          values: [...actualYears.map((x) => x.need), ...forecast.map(() => r.target)],
        },
      ],
      format: (v) => `${eur(v)} €`,
      marker: fireIdx >= 0 ? { index: fireIdx, label: `FiRe ${mmyyyy(r.month!)}` } : undefined,
      // the spending the needed amount is based on: the year's 12-month average, then the forecast's
      tipExtra: (i) => [`${t("fireSpendAvg")}: ${eur(actualYears[i]?.spend ?? spend)} €`],
    });
    // chart 2: per year, spending's 12-month average and the years of spending covered, at year end
    const years: { year: number; spend: number | null; kassa: number | null }[] = [];
    for (let y = firstY; y <= Number(spendMonth.slice(0, 4)); y++) {
      const ms = [...monthsBetween(`${y}-01`, `${y}-12`)].reverse();
      const sm = ms.find((mo) => mo <= spendMonth && m.hasData(mo));
      const im = ms.find((mo) => mo <= last && hasInvestments(m, mo));
      if (sm || im) years.push({ year: y, spend: sm ? avg12(m, sm, menot) : null, kassa: im ? kassaVuosina(m, im) : null });
    }
    const chart2 = renderChart({
      title: t("fireChart2"),
      categories: years.map((x) => String(x.year)),
      width: 1000,
      height: 240,
      series: [
        { name: t("fireSpendAvg"), role: "menot", kind: "bar", values: years.map((x) => x.spend) },
        { name: t("kassaVuosina"), role: "net", kind: "line", axis: "right", values: years.map((x) => x.kassa) },
      ],
      format: (v) => `${eur(v)} €`,
      formatRight: (v) => fmt("yearsUnit", { n: nf(v) }),
    });
    return html` <div class="fire-inputs">
        ${raw(input("spend", t("fireSpend"), spend, "€", spendHint, "numeric", spendReset))}
        ${raw(input("invest", t("fireInvest"), f.invest, "€", "", "numeric"))}
        ${raw(input("ret", t("fireReturn"), f.ret, "%", html`<small>${t("fireReturnHint")}</small>`))}
        ${raw(input("tax", t("fireTax"), f.tax, "%", html`<small>${t("fireTaxHint")}</small>`))}
      </div>
      <div class="fire-result">
        <div class="fire-date"><span class="small muted">${t("fireDateLabel")}</span>${raw(date)}</div>
        <div class="fire-kv">
          <span class="small muted">${t("fireTarget")}</span><b>${eur(r.target)} €</b><span class="small muted">${t("fireTargetSub")}</span>
        </div>
        <div class="fire-kv">
          <span class="small muted">${t("fireNow")}</span><b>${eur(start)} €</b
          ><span class="small muted">${fmt("fireShare", { p: pct(r.target === 0 ? null : start / r.target, 1) })}</span>
        </div>
        <div class="fire-kv">
          <span class="small muted">${t("kassaVuosina")}</span><b>${kv === null ? "-" : fmt("yearsUnit", { n: nf(kv) })}</b
          ><span class="small muted">${fmt("fireYearsGoal", { n: nf(targetYears) })}</span>
        </div>
      </div>
      ${raw(
        cut
          ? html`<div class="note small">
              ${raw(icon("info"))}
              <div>${fmt("fireFrom", { m: mmyyyy(last), s: mmyyyy(spendMonth) })}</div>
            </div>`
          : "",
      )}
      ${raw(chart1)}
      <p class="small muted fire-note">${fmt("fireNote", { spend: eur(spend * 12), tax: nf(f.tax, 0), target: eur(r.target) })}</p>
      <div class="fire-chart2">
        ${raw(chart2)}
        <p class="small muted">${t("kassaVuosinaHelp")}</p>
      </div>`;
  }

  // ---- events

  private onClick(e: Event): void {
    const el = e.target as HTMLElement;
    const pick = (el as Element).closest?.("[data-pick]");
    if (pick) {
      this.pickColumn(Number(pick.getAttribute("data-pick")));
      return;
    }
    const b = el.closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.focusclear !== undefined) {
      this.focus = null;
      this.render();
      return;
    }
    if (b.dataset.main) {
      this.main = b.dataset.main as Main;
      this.render();
    } else if (b.dataset.flowtab) {
      this.flowTab = b.dataset.flowtab as FlowTab;
      this.render();
    } else if (b.dataset.wealthtab) {
      this.wealthTab = b.dataset.wealthtab as WealthTab;
      this.render();
    } else if (b.dataset.grain) {
      this.grain = b.dataset.grain as Grain;
      this.render();
    }
    if (b.dataset.main || b.dataset.flowtab || b.dataset.wealthtab || b.dataset.grain) {
      this.saveView();
    } else if (b.dataset.exp) {
      const k = b.dataset.exp;
      if (this.open.has(k)) this.open.delete(k);
      else this.open.add(k);
      this.render();
    } else if (b.dataset.o === "pdf") {
      window.print();
    } else if (b.dataset.o === "fireReset") {
      this.saveFire({ ...this.fire, spend: null });
    }
  }

  private saveView(): void {
    try {
      localStorage.setItem(
        VIEW_KEY,
        JSON.stringify({ main: this.main, flowTab: this.flowTab, wealthTab: this.wealthTab, grain: this.grain, goals: this.goals }),
      );
    } catch {
      // the choices just reset on reload
    }
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.dataset.o === "goalPick") {
      // picking a target shown in the other row swaps the two
      this.goals = pickGoal(this.shownGoals, Number(el.dataset.i), el.value);
      this.saveView();
      this.render();
      return;
    }
    if (el.dataset.rf === "vs") {
      this.state.set({ vs: el.value as "prevYear" | "target" | "none" });
      return;
    }
    const key = el.dataset.fire as keyof FireForm | undefined;
    if (!key) return;
    const v = parseNumber(el.value);
    if (!Number.isFinite(v)) return;
    this.saveFire({ ...this.fire, [key]: v });
  }

  /** Stores the assumptions in the project (null = defaults); the change re-renders the page. */
  private saveFire(f: FireForm | null): void {
    try {
      localStorage.removeItem(FIRE_KEY);
    } catch {
      // nothing kept in this browser
    }
    this.state.session.change((p) => p.setSettings({ fire: f }));
  }
}

const VS_LABEL: Record<"prevYear" | "target" | "none", TextKey> = { prevYear: "vsPrevYear", target: "vsTarget", none: "vsNone" };
const GRAIN_LABEL: Record<Grain, TextKey> = { month: "grainMonth", quarter: "grainQuarter", year: "grainYear" };
const GRAIN_HELP: Record<Grain, TextKey> = { month: "grainMonthHelp", quarter: "grainQuarterHelp", year: "grainYearHelp" };
