// Asetukset > Luokat: the class > category > subcategory tree with each node's row count, and the
// migration step of a project without a category list. Markup only; the screen handles the buttons.
import type { CategoryEntry, CategoryPath } from "../../engine/categories";
import { nodeKey, type CategoryUse } from "../../project/categories";
import { CLASSES } from "../../ui/classification";
import { formatCount } from "../../ui/format";
import { html, raw } from "../../ui/html";
import { icon } from "../../ui/icons";
import { reservedNode } from "../../engine/reserved";
import { reservedLabel, reservedWhat } from "../../ui/reserved";
import { fmt, plural, t } from "../../ui/texts";

/** "12 riviä, 2 sääntöä": what uses a node, the parts that are not zero. */
export function useText(u: CategoryUse): string {
  return [
    u.rows ? plural(u.rows, "catRowsOne", "catRows", { n: formatCount(u.rows) }) : "",
    u.rules ? plural(u.rules, "catRulesOne", "catRules") : "",
    u.fixes ? plural(u.fixes, "catFixesOne", "catFixes") : "",
    u.targets ? plural(u.targets, "catTargetsOne", "catTargets") : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/** useText for the messages: a node only the target rows of a locked month use has no other use to name. */
export function useMessage(u: CategoryUse): string {
  return useText(u) || (u.targetRows ? t("catTargetRowsOnly") : "");
}

/** Why a node in use cannot be deleted. Only target rows of locked months: moving does not help, unlocking or a rename does. */
export function inUseBody(u: CategoryUse): string {
  const use = useText(u);
  return use ? fmt("catInUseBody", { use }) : t("catInUseTargetRowsBody");
}

const byName = (a: string, b: string) => a.localeCompare(b, "fi");

/** Name, its meaning when reserved, row count, and the buttons: the lock for a reserved name. */
function line(node: CategoryPath, counts: Map<string, number>, edit: boolean): string {
  const r = reservedNode(node);
  const name = node.subCategory || node.category;
  const n = counts.get(nodeKey(node)) ?? 0;
  const meaning = r ? [reservedLabel(r), reservedWhat(r)].filter(Boolean).join(": ") : "";
  const data = JSON.stringify(node);
  const actions = r
    ? html`<span class="cat-lock" title="${t("catLocked")}" aria-label="${t("catLocked")}" role="img">${raw(icon("lock"))}</span>`
    : edit
      ? html`<button
            type="button"
            class="sm ghost icon-only"
            data-act="catRename"
            data-node="${data}"
            title="${t("catRename")}"
            aria-label="${t("catRename")}: ${name}"
          >
            ${raw(icon("pencil"))}</button
          ><button
            type="button"
            class="sm ghost icon-only"
            data-act="catDelete"
            data-node="${data}"
            title="${t("remove")}"
            aria-label="${t("remove")}: ${name}"
          >
            ${raw(icon("trash"))}
          </button>`
      : "";
  return html`<span class="cat-name"
      ><span class="${r ? "mono" : ""}">${name}</span>${raw(meaning ? html`<small class="muted">${meaning}</small>` : "")}</span
    ><span class="cat-count small muted num">${plural(n, "catRowsOne", "catRows", { n: formatCount(n) })}</span
    ><span class="row-actions">${raw(actions)}</span>`;
}

function addButton(parent: CategoryPath, label: string): string {
  return html`<button type="button" class="sm ghost cat-add" data-act="catAdd" data-node="${JSON.stringify(parent)}">
    ${raw(icon("plus"))}${label}
  </button>`;
}

/**
 * The tree. `edit` adds the buttons (not in the migration preview). A class starts open and a
 * category closed; `toggled` holds the nodes (nodeKey) the user opened or closed since.
 */
export function categoryTree(
  list: readonly CategoryEntry[],
  counts: Map<string, number>,
  toggled: ReadonlySet<string>,
  edit: boolean,
): string {
  const classes = [...CLASSES, ...new Set(list.map((e) => e.class).filter((c) => !(CLASSES as readonly string[]).includes(c)))];
  return classes
    .map((cls) => {
      const classNode = { class: cls, category: "", subCategory: "" };
      const key = nodeKey(classNode);
      const r = reservedNode(classNode);
      const n = counts.get(key) ?? 0;
      // the class tag shows the name; its meaning only where the UI language words it differently ("spending")
      const label = r ? reservedLabel(r) : "";
      const cats = list
        .filter((e) => e.class === cls)
        .sort((a, b) => byName(a.category, b.category))
        .map((e) => {
          const node = { class: cls, category: e.category, subCategory: "" };
          const subs = [...e.subCategories]
            .sort(byName)
            .map((s) => html`<li class="cat-line">${raw(line({ ...node, subCategory: s }, counts, edit))}</li>`)
            .join("");
          return html`<li>
            <details class="cat-node" data-cat-key="${nodeKey(node)}" ${raw(toggled.has(nodeKey(node)) ? "open" : "")}>
              <summary class="cat-line">${raw(line(node, counts, edit))}</summary>
              <ul class="cat-subs">
                ${raw(subs)}
              </ul>
              ${raw(edit ? addButton(node, t("catAddSub")) : "")}
            </details>
          </li>`;
        })
        .join("");
      return html`<details class="cat-class" data-cat-key="${key}" ${raw(toggled.has(key) ? "" : "open")}>
        <summary>
          <span class="cls cls-${cls}">${cls}</span
          ><span class="cat-name">${label}${raw(r ? html`<small class="muted">${reservedWhat(r)}</small>` : "")}</span
          ><span class="cat-count small muted num">${plural(n, "catRowsOne", "catRows", { n: formatCount(n) })}</span>
        </summary>
        <ul class="cat-cats">
          ${raw(cats)}
        </ul>
        ${raw(edit ? addButton(classNode, t("catAddCategory")) : "")}
      </details>`;
    })
    .join("");
}

/** The migration step: what the list will hold, and the button that saves it. */
export function migrationStep(
  list: readonly CategoryEntry[],
  added: number,
  counts: Map<string, number>,
  toggled: ReadonlySet<string>,
): string {
  const subs = list.reduce((n, e) => n + e.subCategories.length, 0);
  return html`<div class="note warn">
      ${raw(icon("alert"))}
      <div>
        <b>${t("catMigrateTitle")}</b>
        <div>${t("catMigrateBody")}</div>
        <div>${fmt("catMigrateCounts", { cats: list.length, subs })}${added ? ` ${fmt("catMigrateAdded", { n: added })}` : ""}</div>
      </div>
    </div>
    <div class="actions cat-migrate"><button type="button" class="primary" data-act="catMigrate">${t("catMigrateSave")}</button></div>
    <div class="cat-tree">${raw(categoryTree(list, counts, toggled, false))}</div>`;
}
