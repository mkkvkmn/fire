// State of the Tuonti flow (Tiedostot > Luokittelu > Korjaukset): the staged import plus the
// project's own open review items, with the counts the sidebar and the steps show. Derived data is
// cached per project revision and staging version.
import { accountsWithoutOwner, type ReviewData, reviewData } from "../project/service";
import { Staging, type StagedPreview } from "../project/staging";
import type { SourceRow } from "../engine/types";
import type { Session } from "./session";

export type FlowStep = "files" | "classify" | "fixes";
export const FLOW_STEPS: FlowStep[] = ["files", "classify", "fixes"];

/** Uncategorised rows that share an account and description: one luokittelusääntö covers them. */
export interface RowGroup {
  key: string;
  account: string;
  description: string;
  info: string;
  rows: SourceRow[];
  total: number;
  first: string;
  /** True when every row is staged (not yet in the project). */
  staged: boolean;
}

export interface FlowData {
  preview: StagedPreview;
  review: ReviewData | null;
  groups: RowGroup[];
  counts: Record<FlowStep, number>;
}

export function groupRows(rows: SourceRow[], stagedIds: ReadonlySet<string>): RowGroup[] {
  const map = new Map<string, RowGroup>();
  for (const r of rows) {
    const f = r.fields;
    const key = `${f.account.toLowerCase()}|${f.description.toLowerCase()}`;
    let g = map.get(key);
    if (!g) {
      g = { key, account: f.account, description: f.description, info: f.info, rows: [], total: 0, first: f.date ?? "", staged: true };
      map.set(key, g);
    }
    g.rows.push(r);
    g.total += f.amount ?? 0;
    if (f.date && (g.first === "" || f.date < g.first)) g.first = f.date;
    if (!stagedIds.has(r.txId)) g.staged = false;
  }
  return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || Math.abs(b.total) - Math.abs(a.total));
}

export class ImportFlow {
  readonly staging = new Staging();
  /** True once the user has decided the staged late rows (added or left out). */
  lateDecided = false;
  /** True during the guided import with sample files. */
  guided = false;
  private version = 0;
  private cache: { revision: number; version: number; data: FlowData } | null = null;
  private listeners: (() => void)[] = [];

  constructor(private readonly session: Session) {}

  subscribe(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** Call after changing the staging, so derived data is recomputed and views update. */
  touch(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /** Redraws the views without recomputing the data (for changes that touch no staged file). */
  redraw(): void {
    for (const fn of this.listeners) fn();
  }

  data(): FlowData {
    const s = this.session.state;
    const p = s.project;
    if (this.cache && this.cache.revision === s.revision && this.cache.version === this.version) return this.cache.data;
    const empty: FlowData = {
      preview: { rows: [], uncategorized: [], late: [], duplicates: [] },
      review: null,
      groups: [],
      counts: { files: 0, classify: 0, fixes: 0 },
    };
    if (!p) return empty;
    const preview = this.staging.preview(p);
    const review = reviewData(p);
    const stagedIds = new Set(this.staging.stagedRows().map((r) => r.txId));
    const groups = groupRows([...review.uncategorized, ...preview.uncategorized], stagedIds);
    const stagedLate = this.lateDecided ? 0 : preview.late.length;
    const data: FlowData = {
      preview,
      review,
      groups,
      counts: {
        files: this.staging.openFiles().length,
        classify: groups.length,
        fixes:
          stagedLate +
          review.late.length +
          review.failedFixes.length +
          review.duplicateGroups.length +
          review.invalid.length +
          accountsWithoutOwner(p, this.staging.stagedRows()).length,
      },
    };
    this.cache = { revision: s.revision, version: this.version, data };
    return data;
  }

  /** Another project was opened (or none): the staged files belonged to the old one. */
  reset(): void {
    this.staging.clear();
    this.lateDecided = false;
    this.guided = false;
    this.version++;
  }

  /** The project changed (a file profile, say): read the staged files again. No notification. */
  restage(): void {
    const p = this.session.state.project;
    if (p && !this.staging.empty) this.staging.read(p);
    this.version++;
  }
}
