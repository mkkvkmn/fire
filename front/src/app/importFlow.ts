// State of the Tuonti flow (Tiedostot > Luokittelu > Korjaukset): the staged import plus the
// project's own open review items, with the counts the sidebar and the steps show. Derived data is
// cached per project revision and staging version.
import { accountsWithoutOwner, type ReviewData, reviewData } from "../project/service";
import { Staging, type StagedPreview } from "../project/staging";
import { compileRules, ruleMatches } from "../engine/categorize";
import type { Rule, SourceRow } from "../engine/types";
import type { Session } from "./session";

export type FlowStep = "files" | "classify" | "fixes";
export const FLOW_STEPS: FlowStep[] = ["files", "classify", "fixes"];

/** Uncategorised rows that share an account and description: one luokittelusääntö covers them. */
export interface RowGroup {
  key: string;
  account: string;
  description: string;
  /** The info (lisätieto) of the first row. */
  info: string;
  /** True when every row of the group has that same info: only then it can go into a rule. */
  infoShared: boolean;
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
      g = {
        key,
        account: f.account,
        description: f.description,
        info: f.info,
        infoShared: true,
        rows: [],
        total: 0,
        first: f.date ?? "",
        staged: true,
      };
      map.set(key, g);
    }
    if (f.info !== g.info) g.infoShared = false;
    g.rows.push(r);
    g.total += f.amount ?? 0;
    if (f.date && (g.first === "" || f.date < g.first)) g.first = f.date;
    if (!stagedIds.has(r.txId)) g.staged = false;
  }
  return [...map.values()].sort((a, b) => b.rows.length - a.rows.length || Math.abs(b.total) - Math.abs(a.total));
}

/** The groups the Luokittelu table shows: the search covers every group, then the first `limit` are drawn.
 * Drawing all groups froze the page for seconds at 100 000 rows (tens of thousands of groups). */
export function visibleGroups(groups: RowGroup[], query: string, limit: number): { shown: RowGroup[]; matching: number } {
  const hits = query.trim() ? groups.filter((g) => matchesSearch(g, query)) : groups;
  return { shown: hits.slice(0, limit), matching: hits.length };
}

/** A group of rows that a saved rule decides, with that rule. */
export interface ClassifiedLine {
  group: RowGroup;
  rule: Rule;
}

export interface ClassifiedInput {
  /** The groups waiting for a rule now: their rows are not classified (a rule changed or went). */
  waiting: RowGroup[];
  /** Every staged row. */
  staged: readonly SourceRow[];
  /** The rule of each staged transaction by id, from the preview ledger (a korjaus row names the korjaus). */
  ruleOfTx: ReadonlyMap<string, string>;
  /** Transactions a korjaus decides: Tarkistukset has them, not Luokittelu. */
  fixed: ReadonlySet<string>;
  rules: readonly Rule[];
  /** Stored rows a rule made here took off the waiting list (few): their rule is the last one that matches. */
  stored: ReadonlyMap<string, SourceRow>;
  /** A group's place in Luokittelu: waiting groups keep it, later ones go last. */
  orderOf: (key: string) => number;
}

/**
 * Every row of this import that a saved rule decides, grouped as the waiting list is, one line per
 * group and rule. Waiting groups keep their order; groups never on the waiting list follow, largest first.
 */
export function classifiedLines(i: ClassifiedInput): ClassifiedLine[] {
  const waitingIds = new Set(i.waiting.flatMap((g) => g.rows.map((r) => r.txId)));
  const byId = new Map(i.rules.map((r) => [r.id, r]));
  const buckets = new Map<string, SourceRow[]>();
  const add = (id: string, row: SourceRow) => {
    const list = buckets.get(id) ?? [];
    list.push(row);
    buckets.set(id, list);
  };
  const stagedIds = new Set<string>();
  for (const row of i.staged) {
    stagedIds.add(row.txId);
    if (waitingIds.has(row.txId) || i.fixed.has(row.txId)) continue;
    const id = i.ruleOfTx.get(row.txId);
    if (id !== undefined && byId.has(id)) add(id, row);
  }
  const others = [...i.stored.values()].filter((r) => !stagedIds.has(r.txId) && !i.fixed.has(r.txId) && !waitingIds.has(r.txId));
  if (others.length > 0) {
    try {
      const compiled = compileRules([...i.rules]);
      for (const row of others) {
        const f = row.fields;
        const input = { account: f.account, description: f.description, info: f.info, amount: f.amount ?? 0 };
        for (let k = compiled.length - 1; k >= 0; k--)
          if (ruleMatches(compiled[k]!, input)) {
            add(i.rules[k]!.id, row);
            break;
          }
      }
    } catch {
      // a rule that does not compile: Asetukset shows the error; these rows are just not listed
    }
  }
  const lines = [...buckets].flatMap(([id, list]) => groupRows(list, new Set()).map((group) => ({ group, rule: byId.get(id)! })));
  return lines.sort(
    (a, b) =>
      i.orderOf(a.group.key) - i.orderOf(b.group.key) ||
      b.group.rows.length - a.group.rows.length ||
      a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true }),
  );
}

/** The rows of the groups that were waiting before a rule was saved and are not waiting now, and how many groups they came from. */
export function takenOffWaiting(before: RowGroup[], left: ReadonlySet<string>): { rows: SourceRow[]; groups: number } {
  const rows: SourceRow[] = [];
  let groups = 0;
  for (const g of before) {
    const gone = g.rows.filter((r) => !left.has(r.txId));
    if (gone.length > 0) groups++;
    rows.push(...gone);
  }
  return { rows, groups };
}

/** The Tuonti searches (groups and staged rows): the query is in the description, details or account, any case. */
export function matchesSearch(x: { description: string; info: string; account: string }, query: string): boolean {
  return [x.description, x.info, x.account].join(" ").toLowerCase().includes(query.trim().toLowerCase());
}

export class ImportFlow {
  readonly staging = new Staging();
  /** True once the user has decided the staged late rows (added or left out). */
  lateDecided = false;
  /** True during the guided import with sample files. */
  guided = false;
  /**
   * Rows a rule made in Luokittelu took off the waiting list, by transaction id: Luokittelu lists them
   * as classified until the import is done or another project opens.
   */
  readonly classified = new Map<string, SourceRow>();
  /** Each Luokittelu group's place, by key, as first shown: a group that loses rows to a rule keeps it. */
  private groupOrder = new Map<string, number>();

  /** The groups in the order they were first shown; groups new since then follow, largest first. */
  ordered(groups: RowGroup[]): RowGroup[] {
    for (const g of groups) if (!this.groupOrder.has(g.key)) this.groupOrder.set(g.key, this.groupOrder.size);
    return [...groups].sort((a, b) => this.orderOf(a.key) - this.orderOf(b.key));
  }

  /** A group's place in Luokittelu (ordered); one never shown goes last. */
  orderOf(key: string): number {
    return this.groupOrder.get(key) ?? Number.MAX_SAFE_INTEGER;
  }

  /** The classified lines, kept per flow data and classified rows: reading the rule of 100 000 staged rows on each draw would be slow. */
  classifiedLines(waiting: RowGroup[]): ClassifiedLine[] {
    const data = this.data();
    if (this.linesCache?.data === data && this.linesCache.stored === this.classified.size) return this.linesCache.lines;
    // a row back on the waiting list (its rule changed or went) is not classified any more
    for (const g of waiting) for (const r of g.rows) this.classified.delete(r.txId);
    const p = this.session.state.project;
    const ruleOfTx = new Map<string, string>();
    for (const r of data.preview.rows) if (r.txId && !ruleOfTx.has(r.txId)) ruleOfTx.set(r.txId, r.ruleId);
    const lines = classifiedLines({
      waiting,
      staged: this.staging.stagedRows(),
      ruleOfTx,
      fixed: new Set([...(p?.getFixes() ?? []), ...this.staging.fixes].map((f) => f.txId)),
      rules: p?.getRules() ?? [],
      stored: this.classified,
      orderOf: (key) => this.orderOf(key),
    });
    this.linesCache = { data, stored: this.classified.size, lines };
    return lines;
  }
  private linesCache: { data: object; stored: number; lines: ClassifiedLine[] } | null = null;

  /** A rule was saved in Luokittelu: the rows it took off the waiting list are classified from now on; returns how many, from how many groups. */
  markClassified(before: RowGroup[]): { rows: number; groups: number } {
    const left = new Set(this.data().groups.flatMap((g) => g.rows.map((r) => r.txId)));
    const taken = takenOffWaiting(before, left);
    for (const r of taken.rows) this.classified.set(r.txId, r);
    return { rows: taken.rows.length, groups: taken.groups };
  }

  /** The import is done (or another project opened): Luokittelu starts afresh. */
  clearClassified(): void {
    this.classified.clear();
    this.groupOrder.clear();
  }
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
    this.clearClassified();
    this.lateDecided = false;
    this.guided = false;
    this.version++;
  }

  /**
   * The project changed: read the staged files again when what reading depends on changed (a file
   * profile, or the project's own rows). A rule or a korjaus does not, and re-reading 100 000 staged
   * rows took 12 s. No notification.
   */
  restage(): void {
    const p = this.session.state.project;
    if (!p || this.staging.empty || this.staging.readFor === p.rowsVersion) return;
    this.staging.read(p);
    this.version++;
  }
}
