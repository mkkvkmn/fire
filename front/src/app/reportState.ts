// Shared state of the report pages: the filter bar (owner, period, comparison, unit), the
// report model cached per project revision, and click-through into Tapahtumat.
import { Model, type RowFilter } from "../analytics/measures";
import { latestMonth, resolvePeriod, type Comparison, type Period, type Preset } from "../analytics/period";
import type { Session } from "./session";

export interface ReportFilters {
  /** "" = every owner. */
  owner: string;
  preset: Preset;
  custom: Period;
  comparison: Comparison;
  /** Show balances in thousands (true) or euros. */
  thousands: boolean;
  /** What the report compares with: the same period a year earlier, the targets, or nothing. */
  vs: "prevYear" | "target" | "none";
}

/** What Tapahtumat shows after a click on a number. */
export interface Drill {
  filter: RowFilter;
  period: Period;
  rowType?: "Actual" | "Target";
}

const KEY = "fire.reportFilters";

function load(): ReportFilters {
  const base: ReportFilters = {
    owner: "",
    preset: "thisYear",
    custom: { from: "", to: "" },
    comparison: "prevMonth",
    thousands: true,
    vs: "prevYear",
  };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<ReportFilters> | null;
    return v ? { ...base, ...v } : base;
  } catch {
    return base;
  }
}

export class ReportState {
  filters: ReportFilters = load();
  drill: Drill | null = null;
  private cache: { revision: number; owner: string; model: Model; targets: Model } | null = null;
  private listeners: (() => void)[] = [];

  constructor(readonly session: Session) {}

  subscribe(fn: () => void): void {
    this.listeners.push(fn);
  }

  set(patch: Partial<ReportFilters>): void {
    this.filters = { ...this.filters, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.filters));
    } catch {
      // per-viewer convenience only
    }
    for (const fn of this.listeners) fn();
  }

  /** The report model for the current project revision and owner, or null with no project. */
  model(): Model | null {
    const s = this.session.state;
    if (!s.project) return null;
    let owner = this.filters.owner;
    if (this.cache?.revision !== s.revision || this.cache.owner !== owner) {
      const ledger = s.project.getLedger();
      const owners = new Set(ledger.map((r) => r.owner));
      if (owner !== "" && !owners.has(owner)) owner = "";
      const targetRows = ledger.filter((r) => r.rowType === "Target").map((r) => ({ ...r, rowType: "Actual" as const }));
      this.cache = { revision: s.revision, owner, model: new Model(ledger, owner), targets: new Model(targetRows, owner) };
    }
    return this.cache.model;
  }

  /** The target rows seen as a model, so any measure can be read for the targets. */
  targetModel(): Model | null {
    return this.model() ? this.cache!.targets : null;
  }

  period(): Period | null {
    const m = this.model();
    if (!m || !m.lastMonth) return null;
    // presets count back from the last complete month; "all" and a custom period reach every row
    const p = this.filters.preset;
    const last = p === "all" || p === "custom" ? m.lastMonth : latestMonth(m.firstMonth, m.lastMonth);
    return resolvePeriod(p, m.firstMonth, last, this.filters.custom);
  }

  /** Opens Tapahtumat with the rows behind a number. */
  openRows(drill: Drill): void {
    this.drill = drill;
    if (location.hash === "#/rows") for (const fn of this.listeners) fn();
    else location.hash = "#/rows";
  }
}
