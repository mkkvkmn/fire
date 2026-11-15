// Operations on a project that combine storage and engine: importing a file, rebuilding the
// ledger from stored raw rows, profile edits, rules from Review and duplicate decisions. No DOM.
import { categorizeRow, compileRules, type CompiledRule } from "../engine/categorize";
import { decisionKey, findDuplicateGroups, findPossibleDuplicates, type DuplicateCandidate } from "../engine/duplicates";
import { diffLedger, type LedgerDiff } from "../engine/diff";
import { inMonths, isLocked, mergeLocked } from "../engine/lock";
import { processRows, type PipelineConfig, type PipelineResult } from "../engine/pipeline";
import { readSourceRows, readTable, type RowProblem } from "../engine/read";
import type { Fix, LedgerRow, Rule, SourceProfile, SourceRow } from "../engine/types";
import type { Project } from "../storage/project";

export interface ImportSummary {
  fileName: string;
  profileId: string;
  added: number;
  /** Rows recognised as already in the project (an overlapping or repeated export). */
  alreadyImported: number;
  /** Those rows, so the user can add them anyway (forceAdd). */
  alreadyImportedRows: SourceRow[];
  problems: RowProblem[];
  possibleDuplicates: DuplicateCandidate[];
}

/** Adds the profile, or replaces the stored one with the same id. */
export function saveProfile(project: Project, profile: SourceProfile): void {
  const list = project.getProfiles();
  const i = list.findIndex((p) => p.id === profile.id);
  if (i >= 0) list[i] = profile;
  else list.push(profile);
  project.setProfiles(list);
}

/** Reads a file with a profile and stores the file and its new rows. Does not rebuild the ledger. */
export function importFile(
  project: Project,
  fileName: string,
  bytes: Uint8Array,
  profile: SourceProfile,
  opts: { forceAdd?: boolean } = {},
): ImportSummary {
  saveProfile(project, profile);
  const table = readTable(fileName, bytes, profile);
  const result = readSourceRows(fileName, table, profile, project.hashCounts(), opts);
  const existingRows = result.rows.length > 0 ? project.getSourceRows() : [];
  const decided = new Set(project.getDuplicateDecisions().keys());
  project.transaction(() => {
    if (result.rows.length > 0) {
      const file = project.addSourceFile(fileName, bytes, profile.id);
      project.addRawRows(file.id, result.rows);
    }
  });
  return {
    fileName,
    profileId: profile.id,
    added: result.rows.length,
    alreadyImported: result.alreadyImported.length,
    alreadyImportedRows: result.alreadyImported,
    problems: result.problems,
    possibleDuplicates: findPossibleDuplicates(result.rows, existingRows, decided),
  };
}

/** Rows decided to be duplicates of an earlier row; they stay stored but leave the ledger. */
export function droppedTxIds(project: Project): Set<string> {
  const out = new Set<string>();
  for (const d of project.getDuplicateDecisions().values()) {
    if (d.startsWith("drop:")) out.add(d.slice(5));
  }
  return out;
}

/** Late rows the user chose to leave out of their locked month (decision key `late:<txId>`). */
export function ignoredLateTxIds(project: Project): Set<string> {
  const out = new Set<string>();
  for (const key of project.getDuplicateDecisions().keys()) {
    if (key.startsWith(LATE_PREFIX)) out.add(key.slice(LATE_PREFIX.length));
  }
  return out;
}

const LATE_PREFIX = "late:";

/** Settings the pipeline runs with; a draft from a settings editor can replace any of them. */
export type SettingsDraft = Partial<Pick<PipelineConfig, "rules" | "splits" | "fixes" | "targets" | "defaultOwner">> & {
  accountOwners?: Record<string, string>;
};

/** Runs the pipeline over every stored raw row with the project's current settings (or a draft). */
export function processProject(project: Project, rows: SourceRow[] = project.getSourceRows(), draft: SettingsDraft = {}): PipelineResult {
  return processRows(rows, {
    rules: draft.rules ?? project.getRules(),
    splits: draft.splits ?? project.getSplits(),
    fixes: draft.fixes ?? project.getFixes(),
    targets: draft.targets ?? project.getTargets(),
    defaultOwner: (draft.defaultOwner ?? project.getSettings().defaultOwner) || "oma",
    accountOwners: draft.accountOwners ?? project.getSettings().accountOwners,
    excludeTxIds: droppedTxIds(project),
  });
}

export interface LedgerUpdate {
  result: PipelineResult;
  /** The ledger to store: locked months as stored, open months computed. */
  ledger: LedgerRow[];
  /** Computed rows in locked months that are not stored yet. */
  late: LedgerRow[];
}

/** Computes the ledger the project would have now, honouring the lock. Stores nothing. */
export function computeLedger(
  project: Project,
  opts: { draft?: SettingsDraft; lockedThrough?: string; accept?: ReadonlySet<string>; rows?: SourceRow[] } = {},
): LedgerUpdate {
  const result = processProject(project, opts.rows, opts.draft);
  const lockedThrough = opts.lockedThrough ?? project.getSettings().lockedThrough;
  const merged = mergeLocked(project.getLedger(), result.ledger, lockedThrough, {
    accept: opts.accept,
    ignore: ignoredLateTxIds(project),
  });
  return { result, ...merged };
}

/** Updates the open months of the stored ledger. Locked months stay as they are. */
export function rebuildLedger(project: Project): PipelineResult {
  const update = computeLedger(project);
  project.replaceLedger(update.ledger);
  return update.result;
}

/** What saving a settings draft would change in the stored ledger (open months only). */
export function previewDraft(project: Project, draft: SettingsDraft): LedgerDiff {
  return diffLedger(project.getLedger(), computeLedger(project, { draft }).ledger);
}

/** Saves a settings draft and updates the open months. */
export function saveDraft(project: Project, draft: SettingsDraft): void {
  project.transaction(() => {
    if (draft.rules) project.setRules(draft.rules);
    if (draft.splits) project.setSplits(draft.splits);
    if (draft.fixes) project.setFixes(draft.fixes);
    if (draft.targets) project.setTargets(draft.targets);
    if (draft.defaultOwner !== undefined) project.setSettings({ defaultOwner: draft.defaultOwner });
    if (draft.accountOwners !== undefined) project.setSettings({ accountOwners: draft.accountOwners });
    rebuildLedger(project);
  });
}

/** What moving the lock to `month` would change ("" unlocks everything). */
export function previewLock(project: Project, month: string): LedgerDiff {
  return diffLedger(project.getLedger(), computeLedger(project, { lockedThrough: month }).ledger);
}

/** Moves the lock. Months that become open are brought up to date with the current settings. */
export function setLock(project: Project, month: string): void {
  project.transaction(() => {
    project.setSettings({ lockedThrough: month });
    rebuildLedger(project);
  });
}

export interface RefreshPlan {
  from: string;
  to: string;
  /** The ledger after the refresh. */
  ledger: LedgerRow[];
  diff: LedgerDiff;
}

/**
 * Full refresh (from and to "") or a refresh of months `[from, to]`: re-runs the whole pipeline from
 * the stored source rows and replaces those months, locked or not. Late rows in the range are added.
 */
export function planRefresh(project: Project, from = "", to = ""): RefreshPlan {
  const stored = project.getLedger();
  const computed = processProject(project).ledger;
  const ledger =
    from === "" && to === "" ? computed : [...stored.filter((r) => inMonths([r], from, to).length === 0), ...inMonths(computed, from, to)];
  return { from, to, ledger, diff: diffLedger(stored, ledger) };
}

export function applyRefresh(project: Project, plan: RefreshPlan): void {
  project.replaceLedger(plan.ledger);
}

/** Adds late rows of these transactions to their locked months. */
export function acceptLate(project: Project, txIds: ReadonlySet<string>): void {
  project.replaceLedger(computeLedger(project, { accept: txIds }).ledger);
}

/** Leaves late rows out of their locked months; they stay stored and come back if the month is unlocked. */
export function ignoreLate(project: Project, txIds: Iterable<string>): void {
  project.transaction(() => {
    for (const tx of txIds) project.setDuplicateDecision(LATE_PREFIX + tx, "ignore");
  });
}

/** Read options decide which columns a file has; changing them needs the stored files re-read. */
export function readOptionsChanged(a: SourceProfile, b: SourceProfile): boolean {
  return (
    a.encoding !== b.encoding ||
    a.delimiter !== b.delimiter ||
    a.skipRows !== b.skipRows ||
    a.sheet !== b.sheet ||
    (a.preprocessor ?? "") !== (b.preprocessor ?? "") ||
    a.account !== b.account ||
    (a.accountColumn ?? "") !== (b.accountColumn ?? "")
  );
}

export interface ProfileUpdate {
  /** Files re-read from their stored bytes because the read options changed. */
  reread: number;
  /** Fixes whose transaction no longer exists after the re-read. */
  orphanedFixes: number;
}

/**
 * Saves an edited profile. Mapping changes only re-derive fields from the stored columns. When read
 * options change, the files of this profile are re-read from their stored bytes (their rows, and
 * so their ids, may change), then the ledger is rebuilt.
 */
export function updateProfile(project: Project, profile: SourceProfile): ProfileUpdate {
  const before = project.getProfiles().find((p) => p.id === profile.id);
  let reread = 0;
  project.transaction(() => {
    saveProfile(project, profile);
    if (before && readOptionsChanged(before, profile)) {
      const files = project.getSourceFiles().filter((f) => f.profileId === profile.id);
      for (const f of files) project.deleteRawRows(f.id);
      for (const f of files) {
        const bytes = project.getSourceFileBytes(f.id);
        if (!bytes) continue;
        const rows = readSourceRows(f.name, readTable(f.name, bytes, profile), profile, project.hashCounts(), {
          forceAdd: true,
        }).rows;
        project.addRawRows(f.id, rows);
        reread++;
      }
    }
  });
  const result = rebuildLedger(project);
  return { reread, orphanedFixes: result.failedFixes.length };
}

export interface ReviewData {
  /** Uncategorised rows in open months (locked months change only by unlocking or refreshing). */
  uncategorized: SourceRow[];
  /** Source rows dated in a locked month that the stored ledger does not have yet. */
  late: SourceRow[];
  invalid: SourceRow[];
  duplicateGroups: SourceRow[][];
  failedFixes: Fix[];
}

export function reviewData(project: Project): ReviewData {
  const rows = project.getSourceRows();
  const { result, late } = computeLedger(project, { rows });
  const lockedThrough = project.getSettings().lockedThrough;
  const decided = new Set(project.getDuplicateDecisions().keys());
  const lateTx = new Set(late.map((r) => r.txId));
  return {
    uncategorized: result.uncategorized.filter((r) => !isLocked((r.fields.date ?? "").slice(0, 7), lockedThrough)),
    late: rows.filter((r) => lateTx.has(r.txId)),
    invalid: result.invalid,
    duplicateGroups: findDuplicateGroups(rows, decided),
    failedFixes: result.failedFixes,
  };
}

export function reviewCount(d: ReviewData): number {
  return d.uncategorized.length + d.late.length + d.invalid.length + d.duplicateGroups.length + d.failedFixes.length;
}

/** Appends a rule (or replaces one with the same id) and rebuilds the ledger. */
export function addRule(project: Project, rule: Rule): void {
  const rules = project.getRules().filter((r) => r.id !== rule.id);
  project.setRules([...rules, rule]);
  rebuildLedger(project);
}

/**
 * Records decisions for a group of possible duplicates: every row in `drop` leaves the ledger,
 * every other pair in the group is marked as distinct rows.
 */
/**
 * Leaves unreadable rows out for good (a broken value in the source file). They stay stored, like
 * dropped duplicates, but no longer show as rows to check.
 */
export function dropInvalid(project: Project, txIds: Iterable<string>): void {
  project.transaction(() => {
    for (const tx of txIds) project.setDuplicateDecision(`invalid:${tx}`, `drop:${tx}`);
  });
  rebuildLedger(project);
}

/**
 * Gives every account an explicit owner: an account not listed yet gets the one chosen for it, or
 * the default owner (who owns its rows today, so nothing changes). After this, changing the default
 * owner moves no rows. Returns the accounts added. Rebuild the ledger when a chosen owner differs.
 */
export function ensureAccountOwners(
  project: Project,
  chosen: Record<string, string> = {},
  rows: SourceRow[] = project.getSourceRows(),
): string[] {
  const s = project.getSettings();
  const owners = { ...s.accountOwners };
  const added: string[] = [];
  for (const account of new Set(rows.map((r) => r.fields.account))) {
    if (!account || owners[account]) continue;
    owners[account] = chosen[account] || s.defaultOwner || "oma";
    added.push(account);
  }
  if (added.length) project.setSettings({ accountOwners: owners });
  return added;
}

/** Accounts in the rows that have no owner yet (new accounts in a file being imported). */
export function accountsWithoutOwner(project: Project, rows: SourceRow[]): string[] {
  const owners = project.getSettings().accountOwners;
  return [...new Set(rows.map((r) => r.fields.account))].filter((a) => a && !owners[a]).sort();
}

const DELETED_PREFIX = "deleted:";

/**
 * Deletes a transaction from the reports: it stays stored (so a re-import does not bring it back,
 * and it can be restored) but leaves the ledger, like a dropped duplicate. Not in a locked month:
 * returns false and changes nothing.
 */
export function deleteTransaction(project: Project, txId: string): boolean {
  const month = (project.getSourceRows().find((r) => r.txId === txId)?.fields.date ?? "").slice(0, 7);
  if (isLocked(month, project.getSettings().lockedThrough)) return false;
  project.setDuplicateDecision(DELETED_PREFIX + txId, `drop:${txId}`);
  rebuildLedger(project);
  return true;
}

/** Brings a deleted transaction back. */
export function restoreTransaction(project: Project, txId: string): void {
  project.removeDuplicateDecision(DELETED_PREFIX + txId);
  rebuildLedger(project);
}

/** The transactions deleted by hand, newest date first. */
export function deletedTransactions(project: Project): SourceRow[] {
  const ids = new Set(
    [...project.getDuplicateDecisions().keys()].filter((k) => k.startsWith(DELETED_PREFIX)).map((k) => k.slice(DELETED_PREFIX.length)),
  );
  return project
    .getSourceRows()
    .filter((r) => ids.has(r.txId))
    .sort((a, b) => (b.fields.date ?? "").localeCompare(a.fields.date ?? ""));
}

export function decideDuplicates(project: Project, group: SourceRow[], drop: ReadonlySet<string>): void {
  project.transaction(() => {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.contentHash === b.contentHash) continue;
        const dropped = drop.has(b.txId) ? b.txId : drop.has(a.txId) ? a.txId : null;
        project.setDuplicateDecision(decisionKey(a.txId, b.txId), dropped ? `drop:${dropped}` : "keep");
      }
    }
  });
  rebuildLedger(project);
}

export function deleteFix(project: Project, fixId: string): void {
  project.setFixes(project.getFixes().filter((f) => f.id !== fixId));
  rebuildLedger(project);
}

/** The values a fix can change on one transaction. */
export interface FixValues {
  date: string;
  description: string;
  info: string;
  /** Only for a transaction that is not shared between members (a fix sets every row's amount). */
  amount?: number;
  class: string;
  category: string;
  subCategory: string;
}

/** A transaction's values before any fix: the source fields and the class its rules give. */
export function originalValues(row: SourceRow, rules: CompiledRule[]): FixValues {
  const f = row.fields;
  const amount = f.amount ?? 0;
  const cat = categorizeRow(rules, { account: f.account, description: f.description, info: f.info, amount });
  return {
    date: f.date ?? "",
    description: f.description,
    info: f.info,
    amount,
    class: cat?.class ?? "",
    category: cat?.category ?? "",
    subCategory: cat?.subCategory ?? "",
  };
}

/** Compiled rules for `originalValues`. */
export function compiledRules(project: Project): CompiledRule[] {
  return compileRules(project.getRules());
}

/**
 * The fix that turns `original` into `wanted`: only the fields that differ. Null when nothing
 * differs. An empty value keeps the original (a fix cannot blank a field). Class and categories
 * compare without case; description and info as written.
 */
export function fixFromValues(id: string, txId: string, original: FixValues, wanted: FixValues, owner?: string): Fix | null {
  const fix: Fix = { id, txId, ...(owner ? { owner } : {}) };
  for (const k of ["date", "description", "info", "class", "category", "subCategory"] as const) {
    const v = wanted[k].trim();
    const o = original[k].trim();
    const same = k === "description" || k === "info" ? v === o : v.toLowerCase() === o.toLowerCase();
    if (v !== "" && !same) fix[k] = v;
  }
  if (
    wanted.amount !== undefined &&
    Number.isFinite(wanted.amount) &&
    Math.round(wanted.amount * 100) !== Math.round((original.amount ?? 0) * 100)
  ) {
    fix.amount = wanted.amount;
  }
  return Object.keys(fix).length > (owner ? 3 : 2) ? fix : null;
}

/** The next free numeric fix id. */
export function nextFixId(fixes: Fix[]): string {
  return String(fixes.reduce((m, f) => (/^\d+$/.test(f.id) ? Math.max(m, Number(f.id)) : m), 0) + 1);
}

/**
 * Sets the field fix of one transaction (replacing its old one in place), or removes it when
 * `fix` is null; then updates the open months. A split fix of the transaction stays. Returns the
 * ids that touch a locked month; then nothing is saved.
 */
export function setTransactionFix(project: Project, txId: string, fix: Fix | null): string[] {
  const list = project.getFixes();
  const i = list.findIndex((f) => f.txId === txId && !f.parts);
  const next = list.filter((_, j) => j !== i);
  if (fix) next.splice(i >= 0 ? i : next.length, 0, fix);
  const locked = lockedFixChanges(project, next);
  if (locked.length) return locked;
  saveDraft(project, { fixes: next });
  return [];
}

/**
 * Ids of fixes in the draft that are new, changed or removed and touch a locked month (through
 * their transaction's date or the date they set). Those need the month unlocked first.
 */
export function lockedFixChanges(project: Project, draft: Fix[]): string[] {
  const lockedThrough = project.getSettings().lockedThrough;
  if (lockedThrough === "") return [];
  const txMonth = new Map(project.getSourceRows().map((r) => [r.txId, (r.fields.date ?? "").slice(0, 7)]));
  const touchesLock = (f: Fix) =>
    isLocked(txMonth.get(f.txId) ?? "", lockedThrough) || (f.date !== undefined && isLocked(f.date.slice(0, 7), lockedThrough));
  const before = new Map(project.getFixes().map((f) => [f.id, JSON.stringify(f)]));
  const after = new Map(draft.map((f) => [f.id, JSON.stringify(f)]));
  const out: string[] = [];
  for (const f of draft) if (before.get(f.id) !== after.get(f.id) && touchesLock(f)) out.push(f.id);
  for (const f of project.getFixes()) if (!after.has(f.id) && touchesLock(f)) out.push(f.id);
  return out;
}

/** Every member name the project uses: the default member and the members of splits, targets, fixes and rows. */
export function members(project: Project): string[] {
  const s = project.getSettings();
  const names = [
    s.defaultOwner,
    ...s.members,
    ...Object.values(s.accountOwners),
    ...project.getSplits().map((x) => x.owner),
    ...project.getTargets().map((x) => x.owner),
    ...project.getFixes().flatMap((f) => [f.owner ?? "", ...(f.parts ?? []).map((p) => p.owner ?? "")]),
    ...project.getLedgerOwners(),
  ];
  return [...new Set(names.filter(Boolean))].sort((a, b) => (a === s.defaultOwner ? -1 : b === s.defaultOwner ? 1 : a.localeCompare(b)));
}

/** Renames a member in splits, targets, fixes and the default member, then updates the open months. */
export function renameMember(project: Project, from: string, to: string): void {
  const name = to.trim();
  if (!name || name === from) return;
  const rn = (o: string) => (o === from ? name : o);
  project.setSettings({ members: project.getSettings().members.map(rn) });
  saveDraft(project, {
    splits: project.getSplits().map((x) => ({ ...x, owner: rn(x.owner) })),
    targets: project.getTargets().map((x) => ({ ...x, owner: rn(x.owner) })),
    fixes: project.getFixes().map((f) => ({
      ...f,
      ...(f.owner === undefined ? {} : { owner: rn(f.owner) }),
      ...(f.parts ? { parts: f.parts.map((p) => (p.owner === undefined ? p : { ...p, owner: rn(p.owner) })) } : {}),
    })),
    defaultOwner: rn(project.getSettings().defaultOwner),
    accountOwners: Object.fromEntries(Object.entries(project.getSettings().accountOwners).map(([a, o]) => [a, rn(o)])),
  });
}
