// The category list of a project (Asetukset > Luokat): what uses each node, the list an old project
// gets when it is migrated, and create, rename and delete. No DOM. Reserved names stay locked here too.
import {
  inNode,
  removeNode,
  renamedIn,
  renameNode,
  renameProblem,
  withPaths,
  type CategoryEntry,
  type CategoryPath,
} from "../engine/categories";
import { isLocked } from "../engine/lock";
import { targetRowId } from "../engine/targets";
import type { Fix, LedgerRow } from "../engine/types";
import type { Project } from "../storage/project";
import { reservedNode } from "../engine/reserved";
import { saveDraft } from "./service";

/**
 * How many items use a node: actual ledger rows (every month), rules, fixes and targets. The messages
 * show only these. `targetRows` (the rows targets made, kept in locked months) only block a delete.
 */
export interface CategoryUse {
  rows: number;
  targetRows: number;
  rules: number;
  fixes: number;
  targets: number;
}

/** The first ledger row of each transaction: where a fix's row is now. */
function rowsByTx(project: Project): Map<string, LedgerRow> {
  const out = new Map<string, LedgerRow>();
  for (const r of project.getLedger()) if (r.txId && !out.has(r.txId)) out.set(r.txId, r);
  return out;
}

/** A classification a fix writes: the fix or its part, and where it puts its row. */
interface FixPlace {
  id: string;
  fix: Partial<CategoryPath>;
  at: CategoryPath;
}

const lc = (s: string) => s.trim().toLowerCase();

/**
 * Where a fix whose transaction is not in the ledger puts its row. What it leaves to the rules is
 * unknown: it is taken from the one place in `known` that holds the fix's own names, and stays ""
 * (matching no node) when no place or several do, so a rename never guesses between classes.
 */
function orphanPlace(fix: Partial<CategoryPath>, known: readonly CategoryEntry[]): CategoryPath {
  const fits = known.filter(
    (e) =>
      (!fix.class || e.class === lc(fix.class)) &&
      (!fix.category || lc(e.category) === lc(fix.category)) &&
      (!fix.subCategory || e.subCategories.some((s) => lc(s) === lc(fix.subCategory!))),
  );
  const one = fits.length === 1 ? fits[0]! : { class: "", category: "" };
  return { class: fix.class || one.class, category: fix.category || one.category, subCategory: fix.subCategory ?? "" };
}

/**
 * Every classification the fixes write: each part of a split fix, and each fix that sets one, at its
 * own names and the stored row's for what it leaves to the rules (orphanPlace without a row).
 */
function fixPlaces(project: Project): FixPlace[] {
  const byTx = rowsByTx(project);
  const placed: FixPlace[] = [];
  const orphans: { id: string; fix: Fix }[] = [];
  for (const fix of project.getFixes()) {
    if (fix.parts) {
      for (const part of fix.parts) placed.push({ id: fix.id, fix: part, at: part });
      continue;
    }
    if (!fix.class && !fix.category && !fix.subCategory) continue;
    const row = byTx.get(fix.txId);
    if (!row) {
      orphans.push({ id: fix.id, fix });
      continue;
    }
    const at = { class: fix.class || row.class, category: fix.category || row.category, subCategory: fix.subCategory || row.subCategory };
    placed.push({ id: fix.id, fix, at });
  }
  if (orphans.length === 0) return placed;
  const known = withPaths(project.getSettings().categories ?? [], [
    ...project.getRules(),
    ...project.getTargets(),
    ...project.getLedger(),
    ...placed.map((x) => x.at),
  ]);
  return [...placed, ...orphans.map((o) => ({ ...o, at: orphanPlace(o.fix, known) }))];
}

/** An item's classification, its unset fields "" (a fix sets only what it changes). */
export function pathOf(x: Partial<CategoryPath>): CategoryPath {
  return { class: x.class ?? "", category: x.category ?? "", subCategory: x.subCategory ?? "" };
}

/** Every classification the project uses: rules, targets, fixes and ledger rows. */
export function usedPaths(project: Project): CategoryPath[] {
  return [...project.getRules(), ...project.getTargets(), ...fixPlaces(project).map((x) => x.at), ...project.getLedger()];
}

/**
 * The list a project without one gets: every classification it uses, plus the reserved names. The
 * same list stands in for the combos until the user saves it.
 */
export function migrationList(project: Project, reserved: readonly CategoryPath[]): CategoryEntry[] {
  return withPaths(withPaths([], usedPaths(project)), reserved);
}

function frozenList(list: CategoryEntry[]): readonly CategoryEntry[] {
  for (const e of list) Object.freeze(e.subCategories);
  list.forEach(Object.freeze);
  return Object.freeze(list);
}

/** The stored list, or for a project not migrated yet the list migration would save. */
export function listOrMigration(project: Project, reserved: readonly CategoryPath[]): readonly CategoryEntry[] {
  const stored = project.getSettings().categories;
  if (stored) return stored;
  // every combo asks: the scan of the ledger and the fixes is kept until the project changes
  // shared by every caller, so frozen like the cached ledger rows (Project.getLedger)
  const kept = project.memo("migrationList", () => ({ reserved, list: frozenList(migrationList(project, reserved)) }));
  return kept.reserved === reserved ? kept.list : migrationList(project, reserved);
}

/**
 * Adds every classification in use to the stored list: a name typed in a combo joins the list when
 * its rule, fix or target is saved, and a project opened (Session.replace) gets back names an older
 * FiRe saved without updating the list. A project without a list keeps none until it is migrated.
 * True when the list changed.
 */
export function syncCategories(project: Project): boolean {
  const list = project.getSettings().categories;
  if (!list) return false;
  const next = withPaths(list, usedPaths(project));
  if (JSON.stringify(next) === JSON.stringify(list)) return false;
  project.setSettings({ categories: next });
  return true;
}

/**
 * How many items use the node, or a class (`category` ""): its subcategories count for a category.
 * `rows` are the actual rows. `targetRows` are the target rows: a locked month keeps the rows of a
 * target since removed, and syncCategories would bring a deleted name back from them.
 */
export function categoryUse(project: Project, node: CategoryPath): CategoryUse {
  const hit = (x: CategoryPath) => (node.category ? inNode(x, node) : x.class.toLowerCase() === node.class);
  const ledger = project.getLedger().filter(hit);
  return {
    rows: ledger.filter((r) => r.rowType === "Actual").length,
    targetRows: ledger.filter((r) => r.rowType !== "Actual").length,
    rules: project.getRules().filter(hit).length,
    fixes: new Set(
      fixPlaces(project)
        .filter((x) => hit(x.at) && stores(x.fix, node))
        .map((x) => x.id),
    ).size,
    targets: project.getTargets().filter(hit).length,
  };
}

/** True when a fix writes a name of the node (one that only sets the class leaves the names to the rules). */
function stores(fix: Partial<CategoryPath>, node: CategoryPath): boolean {
  return node.subCategory ? !!fix.subCategory : !!(fix.category || fix.subCategory);
}

export function inUse(u: CategoryUse): boolean {
  return u.rows + u.targetRows + u.rules + u.fixes + u.targets > 0;
}

/** The actual ledger rows of each node, by nodeKey (class, category and subcategory nodes). */
export function rowCounts(project: Project): Map<string, number> {
  const out = new Map<string, number>();
  const add = (k: string) => out.set(k, (out.get(k) ?? 0) + 1);
  for (const r of project.getLedger()) {
    if (r.rowType !== "Actual") continue;
    add(nodeKey({ class: r.class, category: "", subCategory: "" }));
    if (!r.category) continue;
    add(nodeKey({ class: r.class, category: r.category, subCategory: "" }));
    if (r.subCategory) add(nodeKey(r));
  }
  return out;
}

export function nodeKey(n: CategoryPath): string {
  return JSON.stringify([n.class, n.category, n.subCategory].map((x) => x.trim().toLowerCase()));
}

/** Adds a category (`subCategory` "") or a subcategory to the stored list. A reserved name is refused: it would lock itself. */
export function addCategory(project: Project, node: CategoryPath): void {
  const list = project.getSettings().categories;
  if (!list) throw new Error("the project has no category list yet");
  // the list trims names (withPaths), so the check does too
  const name = { ...node, category: node.category.trim(), subCategory: node.subCategory.trim() };
  if (reservedNode(name)) throw new Error(`${name.subCategory || name.category} is a reserved name`);
  project.setSettings({ categories: withPaths(list, [node]) });
}

/**
 * Why `node` cannot be renamed to `to`: "empty"; "exists" when its parent already has that name, in
 * the list or in anything that uses names (a rename would merge them for good); "reserved" when the
 * node or the new name is a reserved name (a reserved name moves rows into the figures the reports
 * build from it). "" when it can.
 */
export function renameRefusal(project: Project, node: CategoryPath, to: string): "" | "empty" | "exists" | "reserved" {
  const name = to.trim();
  const target = node.subCategory ? { ...node, subCategory: name } : { ...node, category: name };
  if (reservedNode(node) || (name && reservedNode(target))) return "reserved";
  return renameProblem(withPaths(project.getSettings().categories ?? [], usedPaths(project)), node, to);
}

/** Removes a node nothing uses from the stored list. A reserved name stays. */
export function deleteCategory(project: Project, node: CategoryPath): void {
  const list = project.getSettings().categories;
  if (!list) throw new Error("the project has no category list yet");
  if (reservedNode(node)) throw new Error(`${node.subCategory || node.category} is a reserved name`);
  if (inUse(categoryUse(project, node))) throw new Error(`${node.subCategory || node.category} is in use`);
  project.setSettings({ categories: removeNode(list, node) });
}

/**
 * Renames a node everywhere it is stored: the list, rules, fixes (and their parts), targets and the
 * ledger rows of every month, locked ones too: a rename changes no amount, and a locked row left
 * with the old name would keep it in the reports and in the list. The locked months that have the
 * name are written here; the rebuild of saveDraft writes the open months.
 */
export function renameCategory(project: Project, node: CategoryPath, to: string): void {
  const list = project.getSettings().categories;
  if (!list) throw new Error("the project has no category list yet");
  const problem = renameRefusal(project, node, to);
  if (problem) throw new Error(`cannot rename ${node.subCategory || node.category} to "${to}": ${problem}`);
  const name = to.trim();
  const places = new Map(fixPlaces(project).map((x) => [x.id, x.at]));
  const lockedThrough = project.getSettings().lockedThrough;
  project.transaction(() => {
    const fixes = project.getFixes().map((f) => {
      if (f.parts) return { ...f, parts: f.parts.map((p) => renamedIn(p, node, name)) };
      return renamedIn(f, node, name, places.get(f.id) ?? pathOf({}));
    });
    // the locked months only: the rebuild below writes the open months from the renamed settings
    const locked = project.getLedger().filter((r) => isLocked(r.month, lockedThrough));
    const next = locked.map((r) => renamedRow(r, node, name));
    const months = new Set(next.filter((r, i) => r !== locked[i]).map((r) => r.month));
    if (months.size > 0) project.replaceLedger(next, months);
    project.setSettings({ categories: renameNode(list, node, name) });
    saveDraft(project, {
      rules: project.getRules().map((r) => renamedIn(r, node, name)),
      targets: project.getTargets().map((x) => renamedIn(x, node, name)),
      fixes,
    });
  });
}

/** A ledger row renamed; a target row also gets the id its renamed target gives it (targetRows). */
function renamedRow(r: LedgerRow, node: CategoryPath, name: string): LedgerRow {
  const out = renamedIn(r, node, name);
  if (out === r || r.rowType !== "Target") return out;
  return {
    ...out,
    rowId: targetRowId(
      { name: r.description, owner: r.owner, class: out.class, category: out.category, subCategory: out.subCategory },
      r.month,
    ),
  };
}
