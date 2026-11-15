// Small SVG charts with no dependencies: bars (grouped, stacked, or one slot per category with `overlay`)
// and lines, a grid with y-axis labels, an optional second scale on the right for one line, and a
// vertical marker. Every mark has a hover tooltip and may carry a click-through; every chart has a
// legend (two or more series) and a table view.
import { html, raw } from "./html";
import { locale, t } from "./texts";

export type SeriesRole = "tulot" | "menot" | "net" | "inv" | "sij" | "vrt" | "kassa" | "osingot" | "target" | "forecast";

export interface Series {
  name: string;
  role: SeriesRole;
  kind: "bar" | "line";
  values: (number | null)[];
  /** false: no value labels. By default bars get them when every label fits above its bar. */
  labels?: boolean;
  /** Bars with the same key stack in one slot (positive values up, negative down). */
  stack?: string;
  /** Dashed line. */
  dash?: boolean;
  /** No dots on the line (hover still shows values). */
  dots?: boolean;
  /** Draw this line on its own scale, labelled on the right. */
  axis?: "right";
}

export interface ChartSpec {
  title: string;
  categories: string[];
  /** Shorter axis labels (defaults to the categories). */
  axis?: string[];
  series: Series[];
  format: (v: number) => string;
  /** Format of the right-hand scale. */
  formatRight?: (v: number) => string;
  /** Click-through payload per category index (a data-drill attribute value). */
  drill?: (i: number, s: Series) => string | null;
  /** viewBox width; wider charts keep their text readable at full page width. */
  width?: number;
  height?: number;
  /** Bars share one slot per category (null = no bar), e.g. actual vs forecast. */
  overlay?: boolean;
  /** Vertical marker at a category. */
  marker?: { index: number; label: string };
  /** Show the title above the chart (default true). */
  caption?: boolean;
  /** More tooltip lines for a category, after the series values. */
  tipExtra?: (i: number) => string[];
  /** Tooltip line for a stack's total, by stack key (e.g. "Varat yhteensä"). */
  stackTotals?: Record<string, string>;
  /** Columns can be picked (a click carries data-pick="<index>"); the picked one is highlighted. */
  pick?: { selected: number | null };
}

const PAD = { t: 14, r: 12, b: 30, l: 50 };

/** Smallest of 1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10 x 10^n at or above v (four even ticks). */
export function niceMax(v: number): number {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  const step = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((s) => s * p >= v - 1e-9) ?? 10;
  return step * p;
}

/** Short axis numbers: 7,5k / 1,2M. */
export function compact(v: number): string {
  const a = Math.abs(v);
  const nf = (n: number, d: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: d }).format(n);
  if (a >= 1e6) return `${nf(v / 1e6, 1)}M`;
  if (a >= 1000) return `${nf(v / 1000, 1)}k`;
  return nf(v, a < 10 ? 1 : 0);
}

/** Value labels: like the axis, but whole thousands from 10k up, so they fit above a bar. */
function labelText(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e4 && a < 1e6) return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(v / 1000)}k`;
  return compact(v);
}

/** A bar with 4px rounded corners at the data end, the other end on the baseline. */
function barPath(x: number, y0: number, w: number, y1: number): string {
  const up = y1 < y0;
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return "";
  const r = Math.min(4, w / 2, h);
  const top = up ? y1 : y0;
  const bottom = up ? y0 : y1;
  return up
    ? `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`
    : `M${x},${top}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${top}Z`;
}

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export function renderChart(spec: ChartSpec): string {
  const n = spec.categories.length;
  if (n === 0) return html`<p class="muted">${t("noData")}</p>`;
  const W = spec.width ?? 720;
  const H = spec.height ?? 260;
  const right = spec.series.find((s) => s.axis === "right");
  const pad = { ...PAD, r: right ? 50 : PAD.r };
  const left = spec.series.filter((s) => s.axis !== "right");
  const bars = left.filter((s) => s.kind === "bar");
  // one slot per stack key (a bar without one is a stack of its own)
  const slotKeys = [...new Set(bars.map((s, i) => s.stack ?? `#${i}`))];
  const slotOf = (s: Series) => slotKeys.indexOf(s.stack ?? `#${bars.indexOf(s)}`);
  /** Stacked totals per slot and category: [sum of positives, sum of negatives]. */
  const totals = slotKeys.map((_, k) =>
    Array.from({ length: n }, (_, i) => {
      const vs = bars
        .filter((s) => slotOf(s) === k)
        .map((s) => s.values[i])
        .filter(finite);
      return [vs.filter((v) => v > 0).reduce((a, b) => a + b, 0), vs.filter((v) => v < 0).reduce((a, b) => a + b, 0), vs.length] as const;
    }),
  );
  const all = [
    ...left.filter((s) => s.kind === "line").flatMap((s) => s.values),
    ...totals.flatMap((t) => t.flatMap(([p, q]) => [p, q])),
  ].filter(finite);
  const hi = niceMax(Math.max(0, ...all));
  const lo = -niceMax(-Math.min(0, ...all));
  const span = hi - lo || 1;
  const plotH = H - pad.t - pad.b;
  const y = (v: number) => pad.t + ((hi - v) / span) * plotH;
  const band = (W - pad.l - pad.r) / n;
  const cx = (i: number) => pad.l + i * band + band / 2;
  const fmtRight = spec.formatRight ?? spec.format;

  // grid and y labels
  const grid: string[] = [];
  for (let k = 0; k <= 4; k++) {
    const v = lo + (span * k) / 4;
    grid.push(html`<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"></line>`);
    grid.push(html`<text class="ylab" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${compact(v)}</text>`);
  }
  let yr: ((v: number) => number) | null = null;
  if (right) {
    // a scale of 0 to 0 would stack every label at the bottom
    const rmax = niceMax(Math.max(0, ...right.values.filter(finite))) || 1;
    yr = (v: number) => pad.t + (1 - v / (rmax || 1)) * plotH;
    for (let k = 0; k <= 4; k++) {
      const v = (rmax * k) / 4;
      grid.push(html`<text class="ylab" x="${W - pad.r + 8}" y="${yr(v) + 4}" text-anchor="start">${fmtRight(v)}</text>`);
    }
  }

  const slots = spec.overlay ? 1 : Math.max(1, slotKeys.length);
  const gap = 2;
  const groupW = Math.min(band * 0.7, slots * 26);
  const barW = Math.max(2, (groupW - gap * (slots - 1)) / slots);
  const x0 = (i: number) => pad.l + i * band + (band - groupW) / 2;
  const marks: string[] = [];
  const labels: string[] = [];
  /** Every series' value at a category, one per line: what the tooltip shows. */
  const colTip = (i: number) => {
    const lines = [spec.categories[i]!];
    const shown = spec.series.filter((s) => finite(s.values[i]));
    shown.forEach((s, j) => {
      lines.push(`${s.name}: ${s.axis === "right" ? fmtRight(s.values[i] as number) : spec.format(s.values[i] as number)}`);
      // after a stack's last part, its total
      const name = s.stack ? spec.stackTotals?.[s.stack] : undefined;
      if (name && shown[j + 1]?.stack !== s.stack) {
        const parts = shown.filter((x) => x.stack === s.stack);
        if (parts.length > 1) lines.push(`${name}: ${spec.format(parts.reduce((a, x) => a + (x.values[i] as number), 0))}`);
      }
    });
    lines.push(...(spec.tipExtra?.(i) ?? []));
    return lines.join("\n");
  };
  // hover areas over whole columns, behind the marks
  for (let i = 0; i < n; i++) {
    if (spec.series.some((s) => finite(s.values[i]))) {
      const picked = spec.pick?.selected === i;
      marks.push(
        html`<rect
          class="col-hit${picked ? " col-on" : ""}"
          x="${pad.l + i * band}"
          y="${pad.t}"
          width="${band}"
          height="${plotH}"
          data-tip="${colTip(i)}"
          ${raw(spec.pick ? html`data-pick="${i}"` : "")}
        ></rect>`,
      );
    }
  }

  const slotX = (s: Series, i: number) => x0(i) + (spec.overlay ? 0 : slotOf(s) * (barW + gap));
  /** Where the next stacked bar starts, per slot, category and sign. */
  const base = new Map<string, number>();
  bars.forEach((s) => {
    s.values.forEach((v, i) => {
      if (!finite(v)) return;
      const x = slotX(s, i);
      const key = `${slotOf(s)}|${i}|${v >= 0 ? "+" : "-"}`;
      const from = s.stack ? (base.get(key) ?? 0) : 0;
      if (s.stack) base.set(key, from + v);
      const d = barPath(x, y(from), barW, y(from + v));
      if (!d) return;
      const tip = colTip(i);
      const drill = spec.drill?.(i, s) ?? null;
      const pick = spec.pick ? html`data-pick="${i}"` : "";
      marks.push(
        html`<path
          class="mark s-${s.role}${drill ? " drill" : ""}"
          d="${d}"
          data-tip="${tip}"
          ${raw(drill ? html`data-drill="${drill}"` : pick)}
        ></path>`,
      );
    });
  });
  // value labels: one per slot and category (a stack shows its total), only when every one fits
  const wanted = bars.filter((s) => s.labels !== false);
  if (wanted.length) {
    const items: { x: number; v: number }[] = [];
    slotKeys.forEach((_, k) => {
      const members = wanted.filter((s) => slotOf(s) === k);
      if (!members.length) return;
      for (let i = 0; i < n; i++) {
        const [pos, neg, count] = totals[k]![i]!;
        if (!count || pos + neg === 0 || !members.some((s) => finite(s.values[i]))) continue;
        items.push({ x: slotX(members[0]!, i) + barW / 2, v: pos + neg });
      }
    });
    const charW = 6.6; // at 11.5px Work Sans in viewBox units
    // a label may reach a little past its bar into the gap to the next one
    const room = spec.overlay ? band - 4 : barW + gap + 8;
    if (items.length && Math.max(...items.map((it) => labelText(it.v).length)) * charW <= room) {
      for (const it of items) {
        const ly = it.v >= 0 ? y(Math.max(it.v, 0)) - 6 : y(it.v) + 14;
        labels.push(html`<text class="lbl" x="${it.x}" y="${ly}" text-anchor="middle">${labelText(it.v)}</text>`);
      }
    }
  }

  if (spec.marker) {
    const mx = cx(spec.marker.index);
    marks.push(html`<line class="marker" x1="${mx}" x2="${mx}" y1="${pad.t}" y2="${H - pad.b}"></line>`);
    marks.push(html`<text class="lbl" x="${mx + 6}" y="${pad.t + 12}">${spec.marker.label}</text>`);
  }

  for (const s of spec.series.filter((x) => x.kind === "line")) {
    const yy = s.axis === "right" && yr ? yr : y;
    const pts = s.values.map((v, i) => (finite(v) ? ([cx(i), yy(v), v, i] as const) : null));
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (!p) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      pen = true;
    }
    marks.push(html`<path class="line s-${s.role}${s.dash ? " dash" : ""}" d="${d}"></path>`);
    for (const p of pts) {
      if (!p) continue;
      const tip = colTip(p[3]);
      marks.push(
        s.dots === false
          ? html`<circle class="hit" cx="${p[0]}" cy="${p[1]}" r="7" data-tip="${tip}"></circle>`
          : html`<circle class="dot s-${s.role}" cx="${p[0]}" cy="${p[1]}" r="4" data-tip="${tip}"></circle>`,
      );
    }
  }

  const axisText = spec.axis ?? spec.categories;
  const longest = Math.max(...axisText.map((c) => c.length));
  const step = Math.max(1, Math.ceil((longest * 7 + 8) / band));
  const axis = axisText
    .map((c, i) => (i % step === 0 ? html`<text class="xlab" x="${cx(i)}" y="${H - 9}" text-anchor="middle">${c}</text>` : ""))
    .join("");
  const baseline = html`<line class="baseline" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"></line>`;
  const legend =
    spec.series.length > 1
      ? html`<div class="legend">
          ${raw(
            spec.series
              .map(
                (s) => html`<span><i class="${s.kind === "line" ? "line" : ""} ${s.dash ? "dash" : ""} s-${s.role}"></i>${s.name}</span>`,
              )
              .join(""),
          )}
        </div>`
      : "";
  const table = html`<details class="chart-table">
    <summary>${t("showAsTable")}</summary>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th></th>
            ${raw(spec.series.map((s) => html`<th class="num">${s.name}</th>`).join(""))}
          </tr>
        </thead>
        <tbody>
          ${raw(
            spec.categories
              .map(
                (c, i) =>
                  html`<tr>
                    <td>${c}</td>
                    ${raw(
                      spec.series
                        .map((s) => {
                          const v = s.values[i];
                          return html`<td class="num">${finite(v) ? (s.axis === "right" ? fmtRight(v) : spec.format(v)) : ""}</td>`;
                        })
                        .join(""),
                    )}
                  </tr>`,
              )
              .join(""),
          )}
        </tbody>
      </table>
    </div>
  </details>`;
  return html`<figure class="chart">
    ${raw(spec.caption === false ? "" : html`<figcaption>${spec.title}</figcaption>`)}
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.title}">
      ${raw(grid.join(""))}${raw(marks.join(""))}${raw(baseline)}${raw(labels.join(""))}${raw(axis)}
    </svg>
    ${raw(legend)}${raw(table)}
  </figure>`;
}

/** One shared tooltip for every chart mark with data-tip. Call once. */
export function installChartTooltips(root: HTMLElement): void {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  document.body.append(tip);
  const show = (e: PointerEvent) => {
    const el = (e.target as Element).closest?.("[data-tip]");
    if (!el) return;
    tip.textContent = el.getAttribute("data-tip");
    tip.hidden = false;
    tip.style.left = `${Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, e.clientX + 12))}px`;
    tip.style.top = `${Math.max(8, e.clientY - tip.offsetHeight - 10)}px`;
  };
  root.addEventListener("pointermove", (e) => {
    if ((e.target as Element).closest?.("[data-tip]")) show(e);
    else tip.hidden = true;
  });
  root.addEventListener("pointerleave", () => (tip.hidden = true));
}
