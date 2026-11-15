// The "flow page" data shared by Tulot, Menot and Osingot: a hierarchy of rows with amount,
// share, 12kk ka and its change, plus the monthly series for the charts.
import type { LedgerRow } from "../engine/types";
import { avg12, change12, lastYear, matches, menot, osinkotulot, tulot, type Measure, type Model, type RowFilter } from "./measures";
import { monthsBetween, type Period } from "./period";

export type FlowKind = "tulot" | "menot" | "osingot";

type Level = "category" | "subCategory" | "description";

interface FlowSpec {
  measure: Measure;
  base: RowFilter;
  levels: Level[];
}

export const FLOWS: Record<FlowKind, FlowSpec> = {
  tulot: { measure: tulot, base: { class: "tulot" }, levels: ["category", "subCategory", "description"] },
  menot: { measure: menot, base: { class: "menot" }, levels: ["category", "subCategory", "description"] },
  osingot: { measure: osinkotulot, base: { subCategory: "osinkotulot" }, levels: ["description"] },
};

export interface FlowNode {
  label: string;
  /** Filter for the rows behind this node (for click-through). */
  filter: RowFilter;
  amount: number;
  /** Share of the parent's amount (`Menot %` is the share of the total). */
  share: number | null;
  avg12: number | null;
  /** 12kk ka a year earlier. */
  avg12LastYear: number | null;
  change12: number | null;
  /** True when the node has no rows in the period. */
  inactive: boolean;
  children: FlowNode[];
}

export interface FlowTotals {
  amount: number;
  lastYear: number;
  avg12: number | null;
  avg12LastYear: number | null;
  change12: number | null;
}

function groupKey(r: LedgerRow, level: Level): string {
  return level === "description" ? r.description : r[level].toLowerCase();
}

/** Rows ever seen for the flow, so a node can show its change even with nothing in the period. */
function tree(m: Model, kind: FlowKind, p: Period, rows: LedgerRow[], depth: number, filter: RowFilter, total: number): FlowNode[] {
  const spec = FLOWS[kind];
  const level = spec.levels[depth];
  if (!level) return [];
  const groups = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    const k = groupKey(r, level);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(r);
  }
  const nodes: FlowNode[] = [];
  for (const [key, list] of groups) {
    const f: RowFilter = { ...filter, [level]: key };
    const amount = spec.measure(m, p, f);
    // children are computed when first read: most nodes stay closed, and each level scans the rows
    let kids: FlowNode[] | undefined;
    const children = (): FlowNode[] => {
      if (!kids) {
        const c = tree(m, kind, p, list, depth + 1, f, amount);
        // A single unnamed child repeats its parent; leave it out.
        kids = c.length === 1 && c[0]!.label === "" ? c[0]!.children : c;
      }
      return kids;
    };
    const a12 = avg12(m, p.to, spec.measure, f);
    const ch = change12(m, p.to, spec.measure, f);
    const inactive = m.rowsIn(p, { ...spec.base, ...f }).length === 0;
    nodes.push({
      label: key,
      filter: { ...spec.base, ...f },
      amount,
      share: total === 0 ? null : amount / total,
      avg12: a12,
      avg12LastYear: a12 === null || ch === null ? null : a12 - ch,
      change12: ch,
      inactive,
      get children() {
        return children();
      },
    });
  }
  return nodes.sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

export function flowTree(m: Model, kind: FlowKind, p: Period): FlowNode[] {
  const spec = FLOWS[kind];
  const all = m.rows.filter((r) => matches(r, spec.base));
  return tree(m, kind, p, all, 0, {}, spec.measure(m, p));
}

export function flowTotals(m: Model, kind: FlowKind, p: Period): FlowTotals {
  const spec = FLOWS[kind];
  const a12 = avg12(m, p.to, spec.measure);
  const ch = change12(m, p.to, spec.measure);
  return {
    amount: spec.measure(m, p),
    lastYear: lastYear(m, p, spec.measure),
    avg12: a12,
    avg12LastYear: a12 === null || ch === null ? null : a12 - ch,
    change12: ch,
  };
}

export interface MonthPoint {
  month: string;
  value: number;
  lastYear: number;
  avg12: number | null;
  avg12LastYear: number | null;
}

/** Per month of the period: the measure, a year earlier, and both 12kk ka. */
export function monthlySeries(m: Model, measure: Measure, p: Period, f?: RowFilter): MonthPoint[] {
  return monthsBetween(p.from, p.to).map((month) => {
    const one = { from: month, to: month };
    const a12 = avg12(m, month, measure, f);
    const ch = change12(m, month, measure, f);
    return {
      month,
      value: measure(m, one, f),
      lastYear: lastYear(m, one, measure, f),
      avg12: a12,
      avg12LastYear: a12 === null || ch === null ? null : a12 - ch,
    };
  });
}
