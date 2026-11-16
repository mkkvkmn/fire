// Settings screen: editors for rules, splits, fixes, targets, owners, profiles and user scripts.
// Edits are a draft; "Preview changes" shows what the open months would get, then "Save" applies.
// Locked months never change here.
import { ask } from "../ui/dialog";
import {
  AMOUNT_MATCH,
  CLASSES,
  COLS,
  HIT_MORE,
  HIT_ROWS,
  MAX_SEARCH,
  NOUN,
  moveRule,
  nextNumericId,
  parseNumber,
  TABS,
  validate,
  withRenames,
  type Col,
  type Draft,
  type Item,
  type ListTab,
  type Tab,
} from "./settings/model";
import { fixChanges, infoPop, reservedNames } from "./settings/parts";
import type { ReportState } from "../app/reportState";
import type { Session } from "../app/session";
import { compileRules, ruleFromRow, ruleMatches } from "../engine/categorize";
import { isEmptyDiff, type LedgerDiff } from "../engine/diff";
import { PREPROCESSORS } from "../engine/preprocessors";
import type { Rule, SourceRow } from "../engine/types";
import {
  compiledRules,
  deletedTransactions,
  members,
  originalValues,
  previewDraft,
  restoreTransaction,
  saveDraft,
} from "../project/service";
import type { Project } from "../storage/project";
import { renderDiff } from "../ui/diffView";
import { formatAmount, formatCount, formatDate } from "../ui/format";
import { bindCombos, combo } from "../ui/combo";
import { dateField, parseDateField } from "../ui/dateField";
import { drawer } from "../ui/drawer";
import { html, raw } from "../ui/html";
import { icon } from "../ui/icons";
import { periodName } from "../ui/periodPicker";
import { PRE_WHAT } from "../ui/preprocessors";
import { fmt, plural, t, type TextKey } from "../ui/texts";

/**
 * A group of fields in an item's editor: an optional title, then the fields side by side, or one
 * per line (`stack`) for values too long to share a line (patterns, descriptions, categories).
 */
interface Group {
  label?: TextKey;
  keys: string[];
  stack?: boolean;
}

export class SettingsScreen {
  private tab: Tab = "rules";
  private draft: Draft | null = null;
  private preview: LedgerDiff | null = null;
  private ruleFilter = "";
  private fixSearch = "";
  /** Filter text per settings tab (Luokittelusäännöt has its own, it also finds rule ids). */
  private tabFilter: Partial<Record<Tab, string>> = {};
  /** Per list tab, the item (index in the draft) whose editor is open. */
  private openEdit: Partial<Record<ListTab, number>> = {};
  /** Each rule's last counted "voimassa / osumat", so a redrawn line keeps it until the next count. */
  private ruleCountText = new Map<string, { text: string; title: string; cls: string }>();
  /** The account open in the editor on Tilit. */
  private openAcct: string | null = null;
  /** "Uusi korjaus" is open (collapsed by default; stays as the user left it). */
  private newFixOpen = false;
  private countTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: Session,
    private readonly reports: ReportState,
  ) {
    root.addEventListener("click", (e) => this.onClick(e));
    root.addEventListener("input", (e) => this.onEdit(e));
    // details do not bubble their toggle: listen while capturing
    root.addEventListener(
      "toggle",
      (e) => {
        const el = e.target as HTMLDetailsElement;
        if (el.matches?.("[data-newfix]")) this.newFixOpen = el.open;
      },
      true,
    );
    root.addEventListener("change", (e) => this.onEdit(e));
    // Esc is Peruuta in the editor. On the document: after a click on a line nothing inside the
    // screen may have the focus. Not when a combo's open list took it (it marks the event handled),
    // a dialog is open, or this screen is hidden (another page is shown, the drawer kept for later).
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || root.hidden || !root.querySelector(".drawer")) return;
      if (document.querySelector("dialog[open]")) return;
      this.cancelEditor();
    });
    bindCombos(root, {
      options: (name, el) => this.choices(name, el.querySelector<HTMLInputElement>("input")!),
      noun: (name) => t(NOUN[name] ?? "nounMain"),
      // a pick sets the value without an input event: store it like a typed one
      picked: (_name, el) => this.onEdit({ type: "change", target: el.querySelector("input") } as unknown as Event),
    });
  }

  private rowsCache: { revision: number; rows: SourceRow[] } | null = null;

  /** The project's source rows, read once per project revision (reading them all is slow). */
  private sourceRows(p: Project): SourceRow[] {
    const rev = this.session.state.revision;
    if (this.rowsCache?.revision !== rev) this.rowsCache = { revision: rev, rows: p.getSourceRows() };
    return this.rowsCache.rows;
  }

  /** The tab shown now (the sidebar marks it). */
  get currentTab(): string {
    return this.tab;
  }

  private get project(): Project | null {
    return this.session.state.project;
  }

  private load(p: Project): Draft {
    return {
      revision: this.session.state.revision,
      rules: p.getRules(),
      splits: p.getSplits(),
      fixes: p.getFixes(),
      targets: p.getTargets(),
      defaultOwner: p.getSettings().defaultOwner,
      accountOwners: { ...p.getSettings().accountOwners },
      renames: {},
    };
  }

  /** True when the draft differs from the stored settings. */
  private dirty(): boolean {
    const p = this.project;
    if (!p || !this.draft) return false;
    const stored = this.load(p);
    const a = withRenames(this.draft);
    const b = withRenames(stored);
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  /** The draft, reloaded from the project when it has no unsaved edits and the project changed. */
  private current(p: Project): Draft {
    if (!this.draft || (this.draft.revision !== this.session.state.revision && !this.dirty())) {
      this.draft = this.load(p);
      this.preview = null;
    }
    return this.draft;
  }

  /** Renders the screen: `tab` from the address (#/settings/<tab>), `focus` a rule id to show (#/settings/rules/<id>). */
  render(tab = "", focus = ""): void {
    const p = this.project;
    if (!p) {
      this.draft = null;
      this.root.innerHTML = "";
      return;
    }
    if (TABS.some(([id]) => id === tab) && tab !== this.tab) {
      this.tab = tab as Tab;
      this.preview = null;
      // leaving the tab closes its editor; what was typed stays in the draft (the save bar shows it)
      this.closeEditor();
    }
    const d = this.current(p);
    this.drawerHtml = "";
    const count: Partial<Record<Tab, number>> = {
      rules: d.rules.length,
      splits: new Set([...Object.keys(d.accountOwners), ...d.splits.map((x) => x.account)]).size,
      fixes: d.fixes.length,
      targets: d.targets.length,
      profiles: p.getProfiles().length,
    };
    const tabs = TABS.map(
      ([id, label]) =>
        html`<button
          type="button"
          role="tab"
          class="${id === this.tab ? "on" : ""}"
          aria-selected="${String(id === this.tab)}"
          data-tab="${id}"
        >
          ${t(label)}${raw(count[id] ? html` <span class="count">${count[id]}</span>` : "")}
        </button>`,
    ).join("");
    let body: string;
    switch (this.tab) {
      case "rules":
        body = this.rulesTab(p, d);
        break;
      case "fixes":
        body = this.fixesTab(p, d);
        break;
      case "splits":
        body = this.accountsView(p, d);
        break;
      case "targets":
        body = this.targetsTab(p, d);
        break;
      case "profiles":
        body = this.profilesTab(p);
        break;
      case "scripts":
        body = this.scriptsTab(p);
        break;
    }
    this.root.innerHTML = html`
      <div class="page-head">
        <div>
          <div class="eyebrow">${t("settingsEyebrow")}</div>
          <h1>${t("navSettings")}</h1>
        </div>
      </div>
      <div class="tabs" role="tablist">${raw(tabs)}</div>
      <section class="card settings-card"><div class="tab-body">${raw(body)}</div></section>
      ${raw(this.footer())} ${raw(this.drawerHtml)}
    `;
    // Through the CSSOM: the content security policy blocks style attributes in markup.
    for (const line of this.root.querySelectorAll<HTMLElement>("[data-members]"))
      line.style.setProperty("--members", line.dataset.members ?? "1");
    if (this.tab === "rules") {
      this.updateRuleCounts();
      if (focus && focus !== this.focused) this.showRule(focus);
    }
    this.focused = focus;
    this.restoreFocus();
  }

  /** Opens the Rules tab with a new rule drafted from a row (from Tapahtumat). */
  startRule(input: { account: string; description: string; info: string; amount: number }): void {
    const p = this.project;
    if (!p) return;
    this.current(p);
    const d = this.draft!;
    const rule = ruleFromRow(input, nextNumericId(d.rules.map((r) => r.id)));
    // the new rule opens in the editor; Peruuta takes it away again
    const restore = JSON.stringify(d);
    d.rules.push(rule);
    this.tab = "rules";
    this.ruleFilter = "";
    this.closeEditor();
    this.openEdit.rules = d.rules.length - 1;
    this.editSnap = { restore, start: JSON.stringify(d) };
    this.preview = null;
  }

  private footer(): string {
    const dirty = this.dirty();
    const locked = this.project!.getSettings().lockedThrough;
    return html`
      <div class="settings-footer ${dirty ? "dirty" : ""}" data-footer>
        <div class="actions">
          <button type="button" class="primary" data-act="preview" ${raw(dirty ? "" : "disabled")}>${t("previewChanges")}</button>
          <button type="button" data-act="discard" ${raw(dirty ? "" : "disabled")}>${t("discardEdits")}</button>
          <span class="muted small" data-dirty>${dirty ? t("unsavedEdits") : ""}</span>
        </div>
      </div>
      <div data-preview>${raw(this.previewBox())}</div>
      <p class="muted small settings-note">
        ${locked ? fmt("settingsLockNote", { m: locked }) : t("settingsOpenNote")} ${t("settingsSaveNote")}
      </p>
    `;
  }

  private previewBox(): string {
    if (!this.preview) return "";
    return html`<div class="confirm-box">
      <h3>${t("previewTitleSettings")}</h3>
      ${raw(renderDiff(this.preview))}
      <div class="actions">
        <button type="button" class="primary" data-act="save">${isEmptyDiff(this.preview) ? t("saveSettings") : t("saveAndApply")}</button>
        <button type="button" data-act="closePreview">${t("cancel")}</button>
      </div>
    </div>`;
  }

  /**
   * The category and sub-category choices for the row being edited: categories seen with the row's
   * class, sub-categories seen with the row's category.
   */
  private choices(key: string, el: HTMLInputElement): string[] {
    const p = this.project;
    if (!p || el.dataset.i === undefined || !(this.tab in COLS)) return [];
    if (key === "account")
      return [
        ...new Set(
          this.sourceRows(p)
            .map((r) => r.fields.account)
            .filter(Boolean),
        ),
      ].sort();
    const item = this.listOf(this.tab as ListTab)[Number(el.dataset.i)];
    // the item being edited holds what is typed right now: leave it out, or a new value would look
    // like an existing one and "+ Lisää uusi" would never show
    if (key === "owner") return this.owners(p, this.draft!, item);
    if (!item) return [];
    const d = this.draft!;
    const known = [...d.rules, ...d.targets, ...p.getLedger()].filter((r) => r !== (item as unknown));
    const same = (a: unknown, b: string) => String(a ?? "").toLowerCase() === b.toLowerCase();
    const values =
      key === "category"
        ? known.filter((r) => !item.class || same(item.class, r.class)).map((r) => r.category)
        : known.filter((r) => !item.category || same(item.category, r.category)).map((r) => r.subCategory);
    return [...new Set(values.filter(Boolean).map((x) => x.toLowerCase()))].sort();
  }

  /**
   * The project's members (also those added by hand on Projekti), plus names only this draft uses;
   * without `except`, the item being edited (its owner is what is typed right now).
   */
  private owners(p: Project, d: Draft, except?: unknown): string[] {
    const draftNames = [
      d.defaultOwner,
      ...Object.values(d.accountOwners),
      ...d.splits.map((s) => s.owner),
      ...d.targets.filter((x) => x !== except).map((x) => x.owner),
      ...d.fixes.filter((f) => f !== except).map((f) => f.owner ?? ""),
    ];
    return [...new Set([...members(p), ...draftNames.filter(Boolean)])];
  }

  // ---- generic list table

  /** The input for one field of a list item: a select, a combo, a date or a text field. */
  private control(i: number, c: Col, item: Item, placeholder = ""): string {
    const v = item[c.key];
    const text = v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)) ? "" : String(v);
    const attrs = html`data-i="${i}" data-k="${c.key}" aria-label="${t(c.label)}"`;
    if (c.kind === "class" || c.kind === "amountMatch") {
      const choices = c.kind === "class" ? CLASSES : AMOUNT_MATCH;
      const empty = c.kind === "class" ? html`<option value="" ${raw(text === "" ? "selected" : "")}>-</option>` : "";
      const required = c.kind === "class" && !c.optional ? "required" : "";
      return html`<select ${raw(attrs)} ${raw(required)}>
        ${raw(empty)}${raw(
          choices.map(([val, label]) => html`<option value="${val}" ${raw(val === text ? "selected" : "")}>${t(label)}</option>`).join(""),
        )}
      </select>`;
    }
    if (c.list) return combo(c.key, text, { label: t(c.label), placeholder, attrs: html`data-i="${i}" data-k="${c.key}"` });
    if (c.kind === "date") return dateField(text, attrs);
    const cls = c.kind === "number" ? "num-input" : "";
    const mode = c.kind === "number" ? 'inputmode="decimal"' : "";
    return html`<input type="text" class="${cls}" value="${text}" placeholder="${placeholder}" ${raw(attrs)} ${raw(mode)} />`;
  }

  /**
   * The one editor every Asetukset tab uses: a drawer from the right on a wide screen, a sheet from
   * the bottom on a narrow one. Only its body changes per tab. Tallenna saves and closes, Peruuta
   * (also Esc, the X and a click outside) puts the item back as it was and closes.
   */
  private drawer(o: { title: string; body: string; del?: string }): string {
    return drawer({
      title: o.title,
      body: o.body,
      save: 'data-act="drawerSave"',
      cancel: 'data-act="drawerCancel"',
      ...(o.del === undefined ? {} : { del: `data-act="drawerDelete" ${o.del}` }),
      error: this.drawerError,
    });
  }

  /** The fields of one list item in groups, each with its label above it (the drawer's body). */
  private fieldGroups(tab: ListTab, i: number, item: Item, groups: Group[], placeholders: Record<string, string> = {}): string {
    const cols = COLS[tab];
    const field = (key: string) => {
      const c = cols.find((x) => x.key === key)!;
      const label = html`<span>${t(c.label)}</span>`;
      const control = this.control(i, c, item, placeholders[key] ?? "");
      // a combo carries its own list and buttons, which a label must not wrap
      return c.list
        ? html`<div class="field">${raw(label)}${raw(control)}</div>`
        : html`<label class="field">${raw(label)}${raw(control)}</label>`;
    };
    return groups
      .map(
        (g) =>
          html`<div class="field-group">
            ${raw(g.label ? html`<div class="group-label">${t(g.label)}</div>` : "")}
            <div class="field-grid ${g.stack ? "stack" : `n${g.keys.length}`}">${raw(g.keys.map(field).join(""))}</div>
          </div>`,
      )
      .join("");
  }

  /** The draft as it was before the editor opened (restored on Peruuta) and right after (to tell if anything changed). */
  private editSnap: { restore: string; start: string } | null = null;
  /** A check that failed on Tallenna, shown in the editor. */
  private drawerError = "";
  /** The editor's markup for this render, put after the page so nothing clips it. */
  private drawerHtml = "";

  /**
   * Opens the editor: `open` sets what it shows (and may add the item); the draft before it is kept
   * for Peruuta. `back` finds the button that opened it, which gets the focus back when it closes.
   */
  private openEditor(open: () => void, back = '[data-act="add"]'): void {
    const d = this.draft;
    if (!d) return;
    const restore = JSON.stringify(d);
    open();
    this.editSnap = { restore, start: JSON.stringify(d) };
    this.drawerError = "";
    this.hitLimit = { wins: HIT_ROWS, lost: HIT_ROWS };
    this.focusBack = back;
    this.render();
    this.root.querySelector<HTMLElement>(".drawer")?.focus();
  }

  /** The opener of the editor open now, and the one to focus on the next render (the editor just closed). */
  private focusBack = "";
  private focusPending = "";

  private closeEditor(): void {
    this.openEdit = {};
    this.openAcct = null;
    this.editSnap = null;
    this.drawerError = "";
    // a second close (nothing open any more) keeps the opener found by the first
    if (this.focusBack) this.focusPending = this.focusBack;
    this.focusBack = "";
  }

  /** After a render: the closed editor's opener gets the focus (the add button when it is gone, say after Poista). */
  private restoreFocus(): void {
    const sel = this.focusPending;
    if (!sel || this.root.hidden || this.root.querySelector(".drawer")) return;
    this.focusPending = "";
    (this.root.querySelector<HTMLElement>(sel) ?? this.root.querySelector<HTMLElement>('[data-act="add"]'))?.focus();
  }

  /** Peruuta: puts the draft back as it was before the editor opened; asks first if something was typed. */
  private cancelEditor(): void {
    const snap = this.editSnap;
    if (!snap || !this.draft) {
      this.closeEditor();
      this.render();
      return;
    }
    const undo = () => {
      this.draft = JSON.parse(snap.restore) as Draft;
      this.closeEditor();
      this.render();
    };
    if (JSON.stringify(this.draft) === snap.start) return undo();
    void ask(t("confirmDiscardItem"), { danger: true, ok: t("discardShort") }).then((yes) => {
      if (yes) undo();
    });
  }

  /**
   * Tallenna: checks and saves the draft to the project, then closes. With nothing changed since
   * the editor opened it just closes (a new item counts as a change: it is checked like any other).
   */
  private saveEditor(): void {
    const p = this.project;
    const d = this.draft;
    if (!p || !d) return;
    if (this.editSnap && JSON.stringify(d) === this.editSnap.restore) {
      this.closeEditor();
      this.render();
      return;
    }
    const err = validate(p, d);
    if (err) {
      this.drawerError = err;
      this.render();
      return;
    }
    const draft = withRenames(d);
    this.closeEditor();
    this.draft = null;
    this.preview = null;
    this.session.change((proj) => saveDraft(proj, draft));
  }

  /** The line cells of the list shown now, by item: to redraw a line while its item is edited. */
  private lineHtml: ((i: number) => string) | null = null;

  /** Redraws one line of the list after an edit in the editor, so the line always shows the item. */
  private refreshLine(i: number): void {
    const tr = this.root.querySelector<HTMLElement>(`tr[data-line="${i}"]`);
    if (tr && this.lineHtml) tr.innerHTML = this.lineHtml(i);
  }

  /** The order arrows of a line, for a list whose order matters (rules: the last match wins). */
  private moveButtons(i: number, last: number): string {
    return html`<button
        type="button"
        class="sm ghost icon-only"
        data-act="up"
        data-i="${i}"
        title="${t("moveUp")}"
        aria-label="${t("moveUp")}"
        ${raw(i === 0 ? "disabled" : "")}
      >
        ${raw(icon("arrowUp"))}
      </button>
      <button
        type="button"
        class="sm ghost icon-only"
        data-act="down"
        data-i="${i}"
        title="${t("moveDown")}"
        aria-label="${t("moveDown")}"
        ${raw(i === last ? "disabled" : "")}
      >
        ${raw(icon("arrowDown"))}
      </button>`;
  }

  /**
   * The list every Asetukset tab shares: one readable line per item, then its order arrows (when
   * the order matters), a pen and a trash. A click on a line opens the item in the editor.
   */
  private rowList(
    tab: ListTab,
    items: Item[],
    o: {
      /** Header cells as markup. */
      head: string[];
      /** The line's cells as markup, one td each. */
      cells: (i: number) => string;
      cls: string;
      /** The editor's title and body for item i. */
      edit: (i: number) => { title: string; body: string };
      order?: boolean;
      filter?: (i: number) => boolean;
      find?: (i: number) => string;
      sort?: (a: number, b: number) => number;
    },
  ): string {
    this.lineHtml = null;
    if (items.length === 0) return html`<p class="muted">${t("noRows")}</p>`;
    const at = this.openEdit[tab];
    const acts = (i: number) =>
      html`<td class="row-actions">
        ${raw(o.order ? this.moveButtons(i, items.length - 1) : "")}<button
          type="button"
          class="sm ghost icon-only"
          data-act="edit"
          data-i="${i}"
          title="${t("edit")}"
          aria-label="${t("edit")}"
        >
          ${raw(icon("pencil"))}
        </button>
        <button type="button" class="sm ghost icon-only" data-act="del" data-i="${i}" title="${t("remove")}" aria-label="${t("remove")}">
          ${raw(icon("trash"))}
        </button>
      </td>`;
    this.lineHtml = (i) => o.cells(i) + acts(i);
    const rows = items.map((_, i) => {
      const find = o.find?.(i);
      // a line the filter leaves out stays in the table, hidden, so the filter can bring it back
      const hide = (o.filter && !o.filter(i)) || (find !== undefined && this.hiddenUnless(find) !== "");
      return html`<tr
        class="line ${at === i ? "open" : ""}"
        data-line="${i}"
        ${raw(find === undefined ? "" : html`data-find="${find}"`)}
        ${raw(hide ? "hidden" : "")}
      >
        ${raw(this.lineHtml!(i))}
      </tr>`;
    });
    // a display order; each row keeps its place in the list (data-i), so edits land on the right item
    const order = items.map((_, i) => i);
    if (o.sort) order.sort(o.sort);
    if (at !== undefined && items[at]) this.drawerHtml = this.drawer({ ...o.edit(at), del: html`data-i="${at}"` });
    return this.listTable(
      html`<table class="row-list ${o.cls}">
        <thead>
          <tr>
            ${raw(o.head.join(""))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${raw(order.map((i) => rows[i]).join(""))}
        </tbody>
      </table>`,
    );
  }

  /** A list table in the wrapper every Asetukset list shares (it stacks the lines on a phone). */
  private listTable(table: string): string {
    return html`<div class="list-wrap table-wrap">${raw(table)}</div>`;
  }

  // ---- rules

  /** The rule id last opened from the address, so a re-render does not scroll again. */
  private focused = "";

  /** The Suodata box every list tab shows above its list. */
  private filterBox(hint: TextKey): string {
    return html`<label class="field inline-filter"
      ><span>${t("filter")}</span><input type="search" data-tab-filter value="${this.tabFilter[this.tab] ?? ""}" placeholder="${t(hint)}"
    /></label>`;
  }

  /** `hidden` when a row's text does not match this tab's filter. */
  private hiddenUnless(find: string): string {
    const q = (this.tabFilter[this.tab] ?? "").trim().toLowerCase();
    return q && !find.includes(q) ? "hidden" : "";
  }

  /**
   * True when a rule matches the filter: its id ("12" finds rule 12 too, "#12" only rule 12) or
   * text in any of its fields.
   */
  private ruleShown(r: Rule): boolean {
    const f = this.ruleFilter.trim().toLowerCase();
    if (!f) return true;
    if (f.startsWith("#")) return r.id.toLowerCase() === f.slice(1);
    return (
      r.id.toLowerCase() === f ||
      [r.account, r.description, r.info, r.class, r.category, r.subCategory].some((x) => x.toLowerCase().includes(f))
    );
  }

  /** Filters the rules to one id, scrolls to it and marks it. */
  private showRule(id: string): void {
    this.ruleFilter = `#${id}`;
    const box = this.root.querySelector<HTMLInputElement>("[data-rule-filter]");
    if (box) box.value = this.ruleFilter;
    this.applyRuleFilter();
    const i = this.draft?.rules.findIndex((r) => r.id === id) ?? -1;
    const tr = this.root.querySelector<HTMLElement>(`.rule-list tr[data-line="${i}"]`);
    tr?.classList.add("found");
    tr?.scrollIntoView({ block: "center" });
  }

  /** Shows only the rules that match the filter, without rebuilding the table (it can be long). */
  private applyRuleFilter(): void {
    const d = this.draft;
    if (!d) return;
    for (const tr of this.root.querySelectorAll<HTMLTableRowElement>(".rule-list tr[data-line]")) {
      const r = d.rules[Number(tr.dataset.line)];
      tr.hidden = !r || !this.ruleShown(r);
    }
  }

  /** A rule's conditions as one line: each set field with its pattern, or "every row". */
  private ruleWhen(r: Rule): string {
    const amount = r.amount && r.amount !== "any" ? AMOUNT_MATCH.find(([v]) => v === r.amount)?.[1] : undefined;
    const parts = [
      ...(
        [
          ["colAccount", r.account],
          ["colDescription", r.description],
          ["colInfo", r.info],
        ] as [TextKey, string][]
      )
        .filter(([, v]) => v)
        .map(([k, v]) => html`<span class="cond"><span class="k">${t(k)}</span> <code>${v}</code></span>`),
      ...(amount ? [html`<span class="cond"><span class="k">${t("fieldAmountMatch")}</span> <code>${t(amount)}</code></span>`] : []),
    ];
    return parts.length ? parts.join("") : html`<span class="muted">${t("ruleAll")}</span>`;
  }

  /** A rule's "voimassa / osumat" link: the last count until the next one is done. */
  private ruleCount(i: number): string {
    const c = this.ruleCountText.get(this.draft?.rules[i]?.id ?? "");
    return html`<button
      type="button"
      class="link ${c?.cls ?? ""}"
      data-act="ruleRows"
      data-i="${i}"
      data-count="${i}"
      title="${c?.title ?? ""}"
    >
      ${c?.text ?? "…"}
    </button>`;
  }

  private rulesTab(p: Project, d: Draft): string {
    const filter = (i: number) => this.ruleShown(d.rules[i]!);
    const rows = this.sourceRows(p);
    return html`
      <p class="muted">${t("rulesBody")}</p>
      ${raw(reservedNames(p))}
      <div class="list-tools">
        <label class="field inline-filter"
          ><span>${t("filter")}</span><input type="search" data-rule-filter value="${this.ruleFilter}" placeholder="${t("ruleFilterHint")}"
        /></label>
        <span class="grow"></span>
        <button type="button" class="primary" data-act="add">${raw(icon("plus"))}${t("addRule")}</button>
      </div>
      ${raw(
        this.rowList("rules", d.rules as unknown as Item[], {
          cls: "rule-list",
          head: [
            html`<th>#</th>`,
            html`<th>${t("ruleWhen")}</th>`,
            html`<th>${t("colClassification")}</th>`,
            html`<th class="num">
              ${t("colMatches")} ${raw(infoPop(t("matchesInfoTitle"), [t("matchesInfoHits"), t("matchesInfoValid")]))}
            </th>`,
          ],
          cells: (i) => {
            const r = d.rules[i]!;
            const cls = [r.class, r.category, r.subCategory].filter(Boolean).join(" › ");
            return html`<td class="muted small">${r.id}</td>
              <td class="rule-when">${raw(this.ruleWhen(r))}</td>
              <td class="rule-then">${raw(cls ? html`${cls}` : html`<span class="bad-text">${t("ruleNoClass")}</span>`)}</td>
              <td class="num">${raw(this.ruleCount(i))}</td>`;
          },
          edit: (i) => {
            const r = d.rules[i]!;
            const fields = this.fieldGroups("rules", i, r as unknown as Item, [
              { label: "ruleWhen", keys: ["account", "description", "info", "amount"], stack: true },
              { label: "ruleThen", keys: ["class", "category", "subCategory"], stack: true },
            ]);
            // where the rule is in the list: the last rule that matches a row decides it
            const order = html`<div class="field-group">
              <div class="group-label">${t("ruleOrder")}</div>
              <p class="small muted">${fmt("rulePlace", { n: i + 1, total: d.rules.length })}</p>
              <div class="move-row">
                <button type="button" class="sm" data-act="moveRule" data-to="start" data-i="${i}" ${raw(i === 0 ? "disabled" : "")}>
                  ${t("moveStart")}
                </button>
                <button
                  type="button"
                  class="sm"
                  data-act="moveRule"
                  data-to="end"
                  data-i="${i}"
                  ${raw(i === d.rules.length - 1 ? "disabled" : "")}
                >
                  ${t("moveEnd")}
                </button>
                <span class="move-after">
                  <input
                    type="text"
                    inputmode="numeric"
                    data-move-after
                    placeholder="${t("moveAfterHint")}"
                    aria-label="${t("moveAfterHint")}"
                  />
                  <button type="button" class="sm" data-act="moveRule" data-to="after" data-i="${i}">${t("moveAfter")}</button>
                </span>
              </div>
            </div>`;
            const hits = html`<div class="rule-hits" data-rule-hits>${raw(this.ruleRows(r, d.rules, rows))}</div>`;
            return { title: fmt("ruleTitle", { id: r.id }), body: fields + order + hits };
          },
          order: true,
          filter,
        }),
      )}
    `;
  }

  /**
   * Rows a rule matches, in two sections: the rows it decides, then the rows a later rule decides
   * instead (last match wins), each with the number of the rule that does.
   */
  private ruleRows(rule: Rule, rules: Rule[], rows: SourceRow[]): string {
    let compiled;
    try {
      compiled = compileRules(rules);
    } catch (e) {
      return html`<p class="bad-text">${e instanceof Error ? e.message : String(e)}</p>`;
    }
    const idx = rules.findIndex((r) => r.id === rule.id);
    const own = compiled[idx]!;
    const wins: SourceRow[] = [];
    const lost: { row: SourceRow; by: string }[] = [];
    for (const row of rows) {
      if (row.fields.amount === null) continue;
      const input = { account: row.fields.account, description: row.fields.description, info: row.fields.info, amount: row.fields.amount };
      if (!ruleMatches(own, input)) continue;
      let by = -1;
      for (let j = compiled.length - 1; j > idx; j--)
        if (ruleMatches(compiled[j]!, input)) {
          by = j;
          break;
        }
      if (by < 0) wins.push(row);
      else lost.push({ row, by: rules[by]!.id });
    }
    if (wins.length + lost.length === 0) return html`<p class="muted">${t("ruleNoRows")}</p>`;
    // newest first: the rows to check after an edit are the recent ones
    const newest = (a: SourceRow, b: SourceRow) => (b.fields.date ?? "").localeCompare(a.fields.date ?? "");
    wins.sort(newest);
    lost.sort((a, b) => newest(a.row, b.row));
    // two lines per row, so the list fits the editor's width: what and how much, then when and where
    const item = (row: SourceRow, note: string) =>
      html`<li>
        <span class="what">${row.fields.description || row.fields.info}</span>
        <span class="num">${formatAmount(row.fields.amount ?? 0)}</span>
        <span class="small muted">${formatDate(row.fields.date)} · ${row.fields.account}</span>
        <span class="small muted">${note}</span>
      </li>`;
    const section = (key: "wins" | "lost", title: string, items: string[], link = "", cls = "") => {
      const n = items.length;
      if (n === 0) return "";
      const shown = this.hitLimit[key];
      const more =
        n > shown
          ? html`<button type="button" class="sm" data-act="moreHits" data-sec="${key}">
              ${fmt("showMoreLeft", { n: formatCount(n - shown) })}
            </button>`
          : "";
      return html`<div class="field-group ${cls}">
        <div class="group-label">${title} (${formatCount(n)})</div>
        <ul class="hit-list">
          ${raw(items.slice(0, shown).join(""))}
        </ul>
        ${raw(more || link ? html`<div class="hit-more">${raw(more)}<span class="grow"></span>${raw(link)}</div>` : "")}
      </div>`;
    };
    // the rows a saved rule decides can open in Tapahtumat (the ledger has the saved rules)
    const saved = this.project?.getRules().some((r) => r.id === rule.id && JSON.stringify(r) === JSON.stringify(rule));
    const m = this.reports.model();
    const link =
      saved && m?.firstMonth
        ? html`<button
            type="button"
            class="link small"
            data-drill="${JSON.stringify({ filter: {}, rule: rule.id, period: { from: m.firstMonth, to: m.lastMonth } })}"
          >
            ${t("showInRows")}
          </button>`
        : "";
    return (
      section(
        "wins",
        t("ruleHitsWins"),
        wins.map((row) => item(row, "")),
        link,
      ) +
      section(
        "lost",
        t("ruleHitsLost"),
        lost.map(({ row, by }) => item(row, fmt("ruleOverriddenBy", { id: by }))),
        "",
        "overridden",
      )
    );
  }

  /** How many rows each section of the open rule's matches shows ("Näytä lisää" adds more). */
  private hitLimit = { wins: HIT_ROWS, lost: HIT_ROWS };

  /** Fills the match column: rows the rule decides / rows it matches, or the regex error. */
  private countRun = 0;

  /**
   * Counts how many rows each rule matches and wins. Runs in slices of rows with a pause between,
   * so typing stays responsive with many rules; a newer count cancels an older one.
   */
  private updateRuleCounts(): void {
    const p = this.project;
    const d = this.draft;
    if (!p || !d) return;
    const run = ++this.countRun;
    const rows = this.sourceRows(p).filter((r) => r.fields.amount !== null);
    const ids = d.rules.map((r) => r.id);
    const compiled = d.rules.map((r) => {
      try {
        return compileRules([r])[0]!;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    });
    const matches = new Array<number>(d.rules.length).fill(0);
    const wins = new Array<number>(d.rules.length).fill(0);
    let at = 0;
    const slice = () => {
      if (run !== this.countRun) return;
      const end = Math.min(rows.length, at + 400);
      for (; at < end; at++) {
        const row = rows[at]!;
        const input = {
          account: row.fields.account,
          description: row.fields.description,
          info: row.fields.info,
          amount: row.fields.amount ?? 0,
        };
        let last = -1;
        compiled.forEach((c, i) => {
          if (typeof c !== "string" && ruleMatches(c, input)) {
            matches[i]!++;
            last = i;
          }
        });
        if (last >= 0) wins[last]!++;
      }
      if (at < rows.length) setTimeout(slice, 0);
      else this.showRuleCounts(ids, compiled, matches, wins);
    };
    slice();
  }

  /** Fills the counts, by rule id: a rule moved or deleted meanwhile keeps its own count, not its old place's. */
  private showRuleCounts(
    ids: string[],
    compiled: (ReturnType<typeof compileRules>[number] | string)[],
    matches: number[],
    wins: number[],
  ): void {
    this.ruleCountText = new Map(
      compiled.map((c, i) => {
        if (typeof c === "string") return [ids[i]!, { text: t("invalidRegex"), title: c, cls: "bad-text" }];
        // voimassa / osumat: the rows where this rule stays in force, then every row it hits
        const w = wins[i] ?? 0;
        const n = matches[i] ?? 0;
        return [
          ids[i]!,
          {
            text: `${formatCount(w)} / ${formatCount(n)}`,
            title: n === 0 ? t("matchesNoneTitle") : fmt("matchesTitle", { w: formatCount(w), n: formatCount(n) }),
            cls: n === 0 ? "bad-text" : w === 0 ? "warn-text" : "",
          },
        ];
      }),
    );
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>("button[data-act=ruleRows]")) {
      const c = this.ruleCountText.get(this.draft?.rules[Number(btn.dataset.count)]?.id ?? "");
      if (!c) continue;
      btn.textContent = c.text;
      btn.title = c.title;
      btn.classList.toggle("bad-text", c.cls === "bad-text");
      btn.classList.toggle("warn-text", c.cls === "warn-text");
    }
    // the open rule's matches follow its edits
    const box = this.root.querySelector("[data-rule-hits]");
    const at = this.openEdit.rules;
    const p = this.project;
    if (box && at !== undefined && this.draft?.rules[at] && p)
      box.innerHTML = this.ruleRows(this.draft.rules[at], this.draft.rules, this.sourceRows(p));
  }

  // ---- targets

  /**
   * Tavoitteet: one compact line per target row (name, time, member, a month's amount and the
   * classification), with the transactions it covers; the pen opens the row's inputs under it.
   */
  private targetsTab(p: Project, d: Draft): string {
    const rows = this.targetRowCounts(p);
    const period = this.reports.period();
    const list = this.rowList("targets", d.targets as unknown as Item[], {
      cls: "target-list",
      head: [
        html`<th>${t("colName")}</th>`,
        html`<th>${t("colPeriod")}</th>`,
        html`<th>${t("colOwner")}</th>`,
        html`<th class="num">${t("colMonthly")}</th>`,
        html`<th>${t("colClassification")}</th>`,
        html`<th
          class="num"
          title="${
            period ? fmt("goalRowsPeriod", { p: periodName(period.from, period.to), m: this.reports.shownOwner() || t("allOwners") }) : ""
          }"
        >
          ${t("navRows")}
        </th>`,
      ],
      cells: (i) => {
        const x = d.targets[i]!;
        const when = x.start || x.end ? `${formatDate(x.start)} – ${formatDate(x.end)}` : "";
        const c = rows.get(x.name);
        const count = c
          ? c.n
            ? html`<button
                type="button"
                class="link"
                data-drill="${JSON.stringify({ filter: {}, target: x.name })}"
                title="${t("goalRowsTitle")}"
              >
                ${formatCount(c.n)}
              </button>`
            : "0"
          : html`<span class="muted" title="${t("goalRowsUnsaved")}">-</span>`;
        return html`<td>${raw(x.name ? html`${x.name}` : html`<span class="muted">${t("unnamed")}</span>`)}</td>
          <td class="small">${when}</td>
          <td>${x.owner}</td>
          <td class="num">${Number.isFinite(x.monthlyAmount) ? `${formatAmount(x.monthlyAmount)} €` : ""}</td>
          <td class="small">${[x.class, x.category, x.subCategory].filter(Boolean).join(" › ")}</td>
          <td class="num">${raw(count)}</td>`;
      },
      edit: (i) => ({
        title: d.targets[i]!.name || t("newTarget"),
        body:
          this.fieldGroups("targets", i, d.targets[i] as unknown as Item, [
            { keys: ["name"] },
            { keys: ["start", "end"] },
            { keys: ["owner", "monthlyAmount"] },
            { label: "colClassification", keys: ["class", "category", "subCategory"], stack: true },
          ]) + html`<p class="small muted">${t("targetLineHint")}</p>`,
      }),
      sort: (a, b) => (d.targets[b]!.end || "9999").localeCompare(d.targets[a]!.end || "9999") || b - a,
      find: (i) => {
        const x = d.targets[i]!;
        return [x.name, x.owner, x.class, x.category, x.subCategory].join(" ").toLowerCase();
      },
    });
    return html`<p class="muted">${t("targetsBody")}</p>
      <div class="list-tools">
        ${raw(this.filterBox("targetFilterHint"))}
        <span class="grow"></span>
        <button type="button" class="primary" data-act="add">${raw(icon("plus"))}${t("addTarget")}</button>
      </div>
      ${raw(list)}`;
  }

  /**
   * Per saved target name: how many transactions it covers in the period and for the member chosen
   * in the reports, which is what its Tapahtumat link lists. A target not saved yet has no entry.
   */
  private targetRowCounts(p: Project): Map<string, { n: number }> {
    const period = this.reports.period();
    const names = new Set(p.getTargets().map((x) => x.name));
    return new Map([...names].map((name) => [name, { n: period ? this.reports.targetRows(name, period).length : 0 }]));
  }

  private fixesTab(p: Project, d: Draft): string {
    const rows = this.sourceRows(p);
    const byTx = new Map(rows.map((r) => [r.txId, r]));
    const rules = compiledRules(p);
    const changes = (i: number) => {
      const f = d.fixes[i]!;
      const r = byTx.get(f.txId);
      return fixChanges(f, r ? originalValues(r, rules) : null);
    };
    const list = this.rowList("fixes", d.fixes as unknown as Item[], {
      cls: "fix-list",
      head: [html`<th>${t("colTx")}</th>`, html`<th>${t("colChanges")}</th>`],
      cells: (i) => {
        const f = d.fixes[i]!;
        const r = byTx.get(f.txId);
        const tx = r
          ? html`<td class="small">
              <div>${formatDate(r.fields.date)} · <span class="num">${formatAmount(r.fields.amount ?? 0)} €</span></div>
              <div class="muted">${r.fields.description}</div>
            </td>`
          : html`<td class="small bad-text" title="${f.txId}">${t("fixNoRow")}</td>`;
        return html`${raw(tx)}
          <td>${raw(changes(i))}</td>`;
      },
      edit: (i) => {
        const r = byTx.get(d.fixes[i]!.txId);
        // an empty field keeps the original value: show it in the field
        const was = r ? originalValues(r, rules) : null;
        const placeholders: Record<string, string> = was
          ? {
              description: was.description ?? "",
              info: was.info ?? "",
              amount: was.amount === undefined ? "" : formatAmount(was.amount),
              category: was.category ?? "",
              subCategory: was.subCategory ?? "",
            }
          : {};
        return {
          title: r ? `${formatDate(r.fields.date)} · ${r.fields.description}` : t("fixNoRow"),
          body:
            html`<p class="small muted">${t("fixesBody")}</p>` +
            this.fieldGroups(
              "fixes",
              i,
              d.fixes[i] as unknown as Item,
              [
                { keys: ["date", "owner"] },
                { keys: ["description", "info", "amount"], stack: true },
                { label: "colClassification", keys: ["class", "category", "subCategory"], stack: true },
              ],
              placeholders,
            ),
        };
      },
      // newest first: a fix just added shows right under the search
      sort: (a, b) => b - a,
      find: (i) => {
        const r = byTx.get(d.fixes[i]!.txId);
        return [
          r ? formatDate(r.fields.date) : "",
          r?.fields.description ?? "",
          r?.fields.account ?? "",
          changes(i).replace(/<[^>]+>/g, " "),
        ]
          .join(" ")
          .toLowerCase();
      },
    });
    return html`
      <p class="muted">${t("fixesListBody")}</p>
      <details class="new-fix" data-newfix ${raw(this.newFixOpen ? "open" : "")}>
        <summary>${raw(icon("plus"))}${t("fixAddTitle")}</summary>
        <label class="field inline-filter"
          ><span>${t("fixSearch")}</span><input type="search" data-fix-search value="${this.fixSearch}"
        /></label>
        <div data-fix-results>${raw(this.fixResults(rows))}</div>
      </details>
      <h3>${t("tabFixes")} (${d.fixes.length})</h3>
      ${raw(this.filterBox("fixFilterHint"))} ${raw(list)} ${raw(this.deletedList(p))}
    `;
  }

  /** Transactions matching the search, each with a button to add a fix. */
  private fixResults(rows: SourceRow[]): string {
    const q = this.fixSearch.trim().toLowerCase();
    const results = q
      ? rows
          .filter((r) =>
            [r.fields.account, r.fields.description, r.fields.info, r.fields.date ?? "", String(r.fields.amount ?? "")].some((x) =>
              x.toLowerCase().includes(q),
            ),
          )
          .slice(0, MAX_SEARCH)
      : [];
    const found = results
      .map(
        (r) =>
          html`<tr>
            <td>${formatDate(r.fields.date)}</td>
            <td>${r.fields.account}</td>
            <td>${r.fields.description}</td>
            <td class="num">${formatAmount(r.fields.amount ?? 0)}</td>
            <td class="row-actions">
              <button
                type="button"
                class="sm ghost icon-only"
                data-act="addFix"
                data-tx="${r.txId}"
                title="${t("addFix")}"
                aria-label="${t("addFix")}"
              >
                ${raw(icon("pencil"))}
              </button>
            </td>
          </tr>`,
      )
      .join("");
    return found
      ? html`<div class="table-wrap">
          <table>
            <tbody>
              ${raw(found)}
            </tbody>
          </table>
        </div>`
      : q
        ? html`<p class="muted">${t("noMatches")}</p>`
        : "";
  }

  /**
   * Tilit: one line per account (owner, what its splits give today), and a section that opens under
   * the line with the account's splits as compact rows. Saved with the other settings.
   */
  private accountsView(p: Project, d: Draft): string {
    const accounts = [...new Set([...Object.keys(d.accountOwners), ...d.splits.map((x) => x.account)])].sort((a, b) =>
      a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
    );
    if (accounts.length === 0) return html`<p class="muted">${t("acctOwnersNone")}</p>`;
    const ms = this.owners(p, d);
    const inData = new Set(this.sourceRows(p).map((r) => r.fields.account));
    const today = new Date().toISOString().slice(0, 10);
    const pct = (share: number) => `${Math.round(share * 1000) / 10} %`.replace(".", ",");
    /** The account's splits, newest period first. */
    const splitsOf = (a: string) =>
      d.splits
        .map((x, i) => [x, i] as const)
        .filter(([x]) => x.account === a)
        .sort(([x, i], [y, j]) => (y.end || "9999").localeCompare(x.end || "9999") || j - i)
        .map(([, i]) => i);
    const lines = accounts
      .map((a) => {
        const idx = splitsOf(a);
        const cur = d.accountOwners[a] ?? "";
        const find = [a, cur, ...idx.map((i) => d.splits[i]!.owner)].join(" ").toLowerCase();
        // what the splits give today, else how many there are
        const now = idx.map((i) => d.splits[i]!).filter((x) => x.start <= today && today <= x.end);
        const summary = now.length
          ? fmt("acctSplitNow", { parts: now.map((x) => `${x.owner} ${pct(x.share)}`).join(", ") })
          : idx.length
            ? plural(new Set(idx.map((i) => `${d.splits[i]!.start}|${d.splits[i]!.end}`)).size, "acctPeriodsOne", "acctPeriods")
            : "";
        const used = inData.has(a);
        return html`<tr
          class="line ${this.openAcct === a ? "open" : ""}"
          data-acct-line="${a}"
          data-find="${find}"
          ${raw(this.hiddenUnless(find))}
        >
          <td>${raw(a ? html`${a}` : html`<span class="bad-text">${t("splitNoAccount")}</span>`)}</td>
          <td>${cur}</td>
          <td class="small muted">${summary}</td>
          <td class="row-actions">
            <button
              type="button"
              class="sm ghost icon-only"
              data-act="openAcct"
              data-acc="${a}"
              title="${t("edit")}"
              aria-label="${t("edit")}"
            >
              ${raw(icon("pencil"))}
            </button>
            <button
              type="button"
              class="sm ghost icon-only"
              data-act="delAcct"
              data-acc="${a}"
              aria-label="${t("remove")}"
              ${raw(used ? html`disabled title="${t("acctInUse")}"` : html`title="${t("remove")}"`)}
            >
              ${raw(icon("trash"))}
            </button>
          </td>
        </tr>`;
      })
      .join("");
    const a = this.openAcct;
    if (a !== null && accounts.includes(a)) {
      this.drawerHtml = this.drawer({
        title: a || t("splitNoAccount"),
        body: this.accountEditor(a, splitsOf(a), d, ms),
        ...(inData.has(a) ? {} : { del: html`data-acc="${a}"` }),
      });
    }
    return html`<p class="muted">${t("acctOwnersBody")} ${t("splitsBody")}</p>
      ${raw(this.filterBox("acctFilterHint"))}
      ${raw(
        this.listTable(
          html`<table class="row-list acct-list">
            <thead>
              <tr>
                <th>${t("colAccount")}</th>
                <th>${t("acctOwner")}</th>
                <th>${t("splitsTitle")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${raw(lines)}
            </tbody>
          </table>`,
        ),
      )}`;
  }

  /**
   * The editor's body for one account: its owner, then each split period as a block of its dates
   * and every member's share (the shares of a period add up to 100 %).
   */
  private accountEditor(a: string, idx: number[], d: Draft, ms: string[]): string {
    const cur = d.accountOwners[a] ?? "";
    const owner = a
      ? html`<div class="field-group">
          <div class="field-grid n1">
            <label class="field"
              ><span>${t("acctOwner")}</span>
              <select data-owner-acc="${a}">
                ${raw(
                  [...new Set([cur, ...ms].filter(Boolean))]
                    .map((m) => html`<option value="${m}" ${raw(m === cur ? "selected" : "")}>${m}</option>`)
                    .join(""),
                )}
              </select>
            </label>
          </div>
        </div>`
      : html`<p class="small bad-text">${t("splitNoAccount")}</p>`;
    // one block per period (same start and end): the dates once, then each member's share
    const periods = new Map<string, number[]>();
    for (const i of idx) {
      const x = d.splits[i]!;
      const key = `${x.start}|${x.end}`;
      periods.set(key, [...(periods.get(key) ?? []), i]);
    }
    const cols = [...new Set([...ms, ...idx.map((i) => d.splits[i]!.owner)].filter(Boolean))];
    const shareText = (v: number) => String(Math.round(v * 1000) / 10).replace(".", ",");
    const blocks = [...periods.values()]
      .map((group) => {
        const first = d.splits[group[0]!]!;
        const g = group.join(",");
        const shares = cols
          .map((m) => {
            const i = group.find((j) => d.splits[j]!.owner === m);
            const v = i === undefined ? "" : shareText(d.splits[i]!.share);
            return html`<label class="share-row"
              ><span class="who">${m}</span
              ><span class="pct"
                ><input
                  class="num-input"
                  data-gshare="${m}"
                  data-group="${g}"
                  data-acc="${a}"
                  value="${v}"
                  inputmode="decimal"
                  placeholder="0"
                  aria-label="${fmt("shareOf", { m })}"
                /><span>%</span></span
              ></label
            >`;
          })
          .join("");
        const sum = Math.round(group.reduce((n, j) => n + d.splits[j]!.share, 0) * 1000) / 10;
        const ok = Math.abs(sum - 100) < 0.05;
        return html`<div class="period-block">
          <div class="field-grid n2">
            <label class="field"
              ><span>${t("colStart")}</span
              >${raw(dateField(first.start, html`data-gdate="start" data-group="${g}" aria-label="${t("colStart")}"`))}</label
            >
            <label class="field"
              ><span>${t("colEnd")}</span
              >${raw(dateField(first.end, html`data-gdate="end" data-group="${g}" aria-label="${t("colEnd")}"`))}</label
            >
          </div>
          <!-- one line per member, then a rule and the total, like a sum on paper -->
          <div class="share-list">
            ${raw(shares)}
            <div class="share-row share-total ${ok ? "" : "warn-text"}" title="${ok ? "" : t("sharesNot100")}">
              <span class="who">${t("sharesTotal")}</span><span class="sum">${ok ? "100" : String(sum).replace(".", ",")} %</span>
            </div>
          </div>
          <div class="period-foot">
            <button type="button" class="sm ghost" data-act="delPeriod" data-group="${g}">${raw(icon("trash"))}${t("removePeriod")}</button>
          </div>
        </div>`;
      })
      .join("");
    const splits = html`<div class="field-group">
      <div class="group-label">${t("splitsTitle")}</div>
      ${raw(idx.length ? blocks : html`<p class="small muted">${fmt("acctNoSplitsYet", { o: cur || "?" })}</p>`)}
      ${raw(a ? html`<div><button type="button" class="sm" data-act="addSplit" data-acc="${a}">${raw(icon("plus"))}${t("addSplit")}</button></div>` : "")}
    </div>`;
    return owner + splits;
  }

  /** Transactions deleted on Tapahtumat, each with a restore button (applies at once). */
  private deletedList(p: Project): string {
    const rows = deletedTransactions(p);
    if (rows.length === 0) return "";
    const list = rows
      .map(
        (r) =>
          html`<tr>
            <td>
              <div class="small">
                ${formatDate(r.fields.date)} · ${r.fields.description} · ${formatAmount(r.fields.amount ?? 0)} €
                <span class="muted mono">${r.sourceFile}</span>
              </div>
            </td>
            <td class="row-actions">
              <button type="button" class="sm" data-act="restoreTx" data-tx="${r.txId}">${t("restoreTx")}</button>
            </td>
          </tr>`,
      )
      .join("");
    return html`<h3>${t("deletedTitle")} (${rows.length})</h3>
      <p class="muted small">${t("deletedBody")}</p>
      <div class="table-wrap">
        <table class="fix-list">
          <tbody>
            ${raw(list)}
          </tbody>
        </table>
      </div>`;
  }

  // ---- profiles and scripts

  private profilesTab(p: Project): string {
    const files = p.getSourceFiles();
    const list = p.getProfiles();
    const how = html`<div class="note small">
        ${raw(icon("info"))}
        <div>${t("profilesNew")}</div>
      </div>
      <div class="actions profiles-how"><a class="btn primary" href="#/import/files">${raw(icon("plus"))}${t("importFilesLink")}</a></div>`;
    if (list.length === 0)
      return html`<p class="muted">${t("noProfiles")}</p>
        ${raw(how)}`;
    const rows = list
      .map((x) => {
        const n = files.filter((f) => f.profileId === x.id).length;
        const find = [x.name, x.filePattern, x.accountColumn || x.account].join(" ").toLowerCase();
        return html`<tr data-find="${find}" ${raw(this.hiddenUnless(find))}>
          <td>${x.name}</td>
          <td><code>${x.filePattern}</code></td>
          <td>${x.accountColumn ? `[${x.accountColumn}]` : x.account}</td>
          <td class="num">${formatCount(n)}</td>
          <td class="row-actions">
            <a
              class="btn sm ghost icon-only"
              href="#/import/files/profile/${encodeURIComponent(x.id)}/settings"
              title="${t("edit")}"
              aria-label="${t("edit")}"
              ${raw(n === 0 ? 'aria-disabled="true" tabindex="-1"' : "")}
              >${raw(icon("pencil"))}</a
            >
            <button
              type="button"
              class="sm ghost icon-only"
              data-act="delProfile"
              data-id="${x.id}"
              aria-label="${t("remove")}"
              ${raw(n > 0 ? html`disabled title="${t("profileInUse")}"` : html`title="${t("remove")}"`)}
            >
              ${raw(icon("trash"))}
            </button>
          </td>
        </tr>`;
      })
      .join("");
    return html`
      <p class="muted">${t("profilesBody")}</p>
      ${raw(how)} ${raw(this.filterBox("profileFilterHint"))}
      <div class="table-wrap">
        <table class="row-list profile-list">
          <thead>
            <tr>
              <th>${t("fieldName")}</th>
              <th>${t("fieldPattern")}</th>
              <th>${t("colAccount")}</th>
              <th class="num">${t("countFiles")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${raw(rows)}
          </tbody>
        </table>
      </div>
    `;
  }

  /** The built-in preprocessors: what each does and which file profiles use it. */
  private scriptsTab(p: Project): string {
    const profiles = p.getProfiles();
    const pre = PREPROCESSORS.map((x) => {
      const users = profiles.filter((pr) => pr.preprocessor === x.id).map((pr) => pr.name);
      return html`<tr>
        <td>
          <b>${x.name}</b>
          <div class="mono small muted">${x.id}</div>
        </td>
        <td class="small">${t(PRE_WHAT[x.id] ?? "preUnknown")}</td>
        <td class="small">${users.length ? users.join(", ") : raw(html`<span class="muted">${t("preUnused")}</span>`)}</td>
      </tr>`;
    }).join("");
    const code = `https://github.com/mkkvkmn/fire/tree/${__BUILD_COMMIT__ === "local" ? "main" : __BUILD_COMMIT__}/front/src/engine/preprocessors`;
    return html`<p class="muted">${t("scriptsBody")}</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("preColName")}</th>
              <th>${t("preColWhat")}</th>
              <th>${t("preColUsedBy")}</th>
            </tr>
          </thead>
          <tbody>
            ${raw(pre)}
          </tbody>
        </table>
      </div>
      <p class="small muted">
        ${raw(fmt("scriptsMore", { link: html`<a href="${code}" target="_blank" rel="noopener noreferrer"><span class="mono">front/src/engine/preprocessors</span></a>` }))}
      </p>`;
  }

  // ---- events

  private listOf(tab: ListTab): Item[] {
    return this.listIn(this.draft!, tab);
  }

  private listIn(d: Draft, tab: ListTab): Item[] {
    return d[tab] as unknown as Item[];
  }

  /**
   * Poista: asks, then removes the item and saves (with whatever else the draft holds, as Tallenna
   * does). The draft is checked with the item gone before anything changes, so a failed check
   * leaves the item where it was, with the reason shown.
   */
  private deleteItem(remove: (d: Draft) => void): void {
    // other unsaved edits go with the deletion: say so. Told by taking the item out of the draft
    // and of the stored settings alike: what still differs is something else than this deletion.
    const without = (d: Draft) => {
      const x = JSON.parse(JSON.stringify(d)) as Draft;
      remove(x);
      return JSON.stringify(withRenames(x));
    };
    const others = !!this.project && !!this.draft && without(this.draft) !== without(this.load(this.project));
    void ask(t("confirmDeleteItem"), { danger: true, ok: t("remove"), ...(others ? { note: t("confirmDeleteOthers") } : {}) }).then(
      (yes) => {
        const p = this.project;
        if (!yes || !p || !this.draft) return;
        const next = JSON.parse(JSON.stringify(this.draft)) as Draft;
        remove(next);
        const err = validate(p, next);
        if (err) {
          if (this.root.querySelector(".drawer")) {
            this.drawerError = err;
            this.render();
          } else this.session.showError(err);
          return;
        }
        const draft = withRenames(next);
        this.closeEditor();
        this.draft = null;
        this.preview = null;
        this.session.change((proj) => saveDraft(proj, draft));
      },
    );
  }

  /** Marks the draft as edited without re-rendering (keeps focus in the field being typed in). */
  private edited(): void {
    this.preview = null;
    const box = this.root.querySelector("[data-preview]");
    if (box) box.innerHTML = "";
    const dirty = this.dirty();
    for (const b of this.root.querySelectorAll<HTMLButtonElement>("button[data-act=preview], button[data-act=discard]"))
      b.disabled = !dirty;
    const label = this.root.querySelector("[data-dirty]");
    if (label) label.textContent = dirty ? t("unsavedEdits") : "";
    // the bar stays in view only while there is something to save
    this.root.querySelector("[data-footer]")?.classList.toggle("dirty", dirty);
  }

  private onEdit(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const d = this.draft;
    if (!d) return;
    if (el.dataset.tabFilter !== undefined) {
      if (e.type !== "input") return;
      // hide rows in place: no rebuild while typing
      this.tabFilter[this.tab] = el.value;
      const q = el.value.trim().toLowerCase();
      for (const row of this.root.querySelectorAll<HTMLElement>("[data-find]")) row.hidden = !!q && !(row.dataset.find ?? "").includes(q);
      return;
    }
    if (el.dataset.gdate !== undefined) {
      const key = el.dataset.gdate as "start" | "end";
      const iso = parseDateField(el.value) ?? el.value.trim();
      for (const i of (el.dataset.group ?? "").split(",").map(Number)) if (d.splits[i]) d.splits[i]![key] = iso;
      this.edited();
      return;
    }
    if (el.dataset.gshare !== undefined) {
      const group = (el.dataset.group ?? "").split(",").map(Number);
      const m = el.dataset.gshare;
      const i = group.find((j) => d.splits[j]?.owner === m);
      const v = el.value.trim() === "" ? 0 : parseNumber(el.value) / 100;
      if (i !== undefined) {
        d.splits[i]!.share = v;
        // a share emptied or set to 0 removes the member from the period (on leaving the field)
        if (e.type === "change" && !v) {
          d.splits.splice(i, 1);
          this.preview = null;
          this.render();
          return;
        }
      } else if (e.type === "change" && v) {
        const first = d.splits[group[0]!]!;
        d.splits.push({ start: first.start, end: first.end, account: first.account, share: v, owner: m });
        this.preview = null;
        this.render();
        return;
      }
      this.edited();
      if (e.type === "change") this.render();
      return;
    }
    if (el.dataset.ownerAcc !== undefined) {
      d.accountOwners[el.dataset.ownerAcc] = el.value;
      this.edited();
      // the account's line shows its owner
      if (e.type === "change") this.render();
      return;
    }
    if (el.dataset.ruleFilter !== undefined) {
      if (e.type !== "input") return;
      this.ruleFilter = el.value;
      this.applyRuleFilter();
      return;
    }
    if (el.dataset.fixSearch !== undefined) {
      if (e.type !== "input") return;
      this.fixSearch = el.value;
      const box = this.root.querySelector("[data-fix-results]");
      if (box && this.project) box.innerHTML = this.fixResults(this.sourceRows(this.project));
      return;
    }
    if (el.dataset.defaultOwner !== undefined) {
      d.defaultOwner = el.value;
      this.edited();
      return;
    }
    if (el.dataset.rename !== undefined) {
      d.renames[el.dataset.rename] = el.value;
      this.edited();
      return;
    }
    const tab = this.tab;
    if (el.dataset.i === undefined || el.dataset.k === undefined || !(tab in COLS)) return;
    const col = COLS[tab as ListTab].find((c) => c.key === el.dataset.k);
    const item = this.listOf(tab as ListTab)[Number(el.dataset.i)];
    if (!col || !item) return;
    const value = col.kind === "text" ? el.value : col.kind === "date" ? (parseDateField(el.value) ?? el.value.trim()) : el.value.trim();
    if (col.optional && value.trim() === "") delete item[col.key];
    else if (el.dataset.pct !== undefined) item[col.key] = parseNumber(value) / 100;
    else item[col.key] = col.kind === "number" ? parseNumber(value) : value;
    this.edited();
    this.refreshLine(Number(el.dataset.i));
    if (tab === "rules") {
      if (this.countTimer) clearTimeout(this.countTimer);
      this.countTimer = setTimeout(() => this.updateRuleCounts(), 600);
    }
  }

  private onClick(e: Event): void {
    const target = e.target as HTMLElement;
    const tabBtn = target.closest<HTMLButtonElement>("button[data-tab]");
    const p = this.project;
    const d = this.draft;
    if (!p || !d) return;
    if (tabBtn) {
      const next = tabBtn.dataset.tab as Tab;
      if (next === this.tab) return;
      // The draft covers every tab, so edits stay while switching.
      location.hash = `#/settings/${next}`;
      return;
    }
    const btn = target.closest<HTMLButtonElement>("button[data-act]");
    // a click anywhere on a list line (not on its buttons or links) opens the item in the editor
    if (!btn && !target.closest("a, button, input, select, [data-drill]")) {
      const line = target.closest<HTMLElement>("tr[data-line]");
      if (line && this.tab in COLS) {
        const tab = this.tab as ListTab;
        const at = Number(line.dataset.line);
        this.openEditor(() => (this.openEdit[tab] = at), `[data-act="edit"][data-i="${at}"]`);
        return;
      }
      const acct = target.closest<HTMLElement>("tr[data-acct-line]");
      if (acct) {
        const acc = acct.dataset.acctLine ?? "";
        this.openEditor(() => (this.openAcct = acc), `[data-act="openAcct"][data-acc="${CSS.escape(acc)}"]`);
        return;
      }
    }
    if (!btn || btn.disabled) return;
    const i = Number(btn.dataset.i);
    const tab = this.tab as ListTab;
    switch (btn.dataset.act) {
      case "drawerSave":
        this.saveEditor();
        break;
      case "drawerCancel":
        this.cancelEditor();
        break;
      case "drawerDelete":
      case "del":
        // Poista, in the editor or on a line: one way, asked first and saved at once
        if (this.tab === "splits") {
          const acc = btn.dataset.acc ?? "";
          this.deleteItem((x) => {
            delete x.accountOwners[acc];
            x.splits = x.splits.filter((s) => s.account !== acc);
          });
        } else this.deleteItem((x) => this.listIn(x, tab).splice(i, 1));
        break;
      case "delPeriod": {
        const group = (btn.dataset.group ?? "")
          .split(",")
          .map(Number)
          .sort((x, y) => y - x);
        for (const j of group) d.splits.splice(j, 1);
        this.preview = null;
        this.render();
        break;
      }
      case "delAcct": {
        // only an account without transactions (its trash is disabled otherwise); as every Poista
        const acc = btn.dataset.acc ?? "";
        this.deleteItem((x) => {
          delete x.accountOwners[acc];
          x.splits = x.splits.filter((s) => s.account !== acc);
        });
        break;
      }
      case "openAcct": {
        const acc = btn.dataset.acc ?? "";
        this.openEditor(() => (this.openAcct = acc), `[data-act="openAcct"][data-acc="${CSS.escape(acc)}"]`);
        break;
      }
      case "addSplit": {
        const acc = btn.dataset.acc ?? "";
        d.splits.push({ start: "", end: "", account: acc, share: 1, owner: d.accountOwners[acc] || d.defaultOwner });
        this.preview = null;
        this.render();
        this.root.querySelector<HTMLInputElement>(`.drawer [data-gdate="start"][data-group="${d.splits.length - 1}"]`)?.focus();
        break;
      }
      case "add": {
        this.openEditor(() => {
          if (tab === "rules") {
            const id = nextNumericId(d.rules.map((r) => r.id));
            d.rules.push({ id, account: "", description: "", info: "", amount: "any", class: "", category: "", subCategory: "" });
            this.ruleFilter = "";
          } else if (tab === "targets") {
            d.targets.push({
              name: "",
              start: "",
              end: "",
              owner: d.defaultOwner,
              monthlyAmount: 0,
              class: "menot",
              category: "",
              subCategory: "",
            });
          }
          this.openEdit[tab] = this.listOf(tab).length - 1;
        });
        // a new item: straight to its first field
        this.root.querySelector<HTMLElement>(".drawer-body input, .drawer-body select")?.focus();
        break;
      }
      case "up":
      case "down": {
        const list = this.listOf(tab);
        const j = btn.dataset.act === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j]!, list[i]!];
        this.preview = null;
        this.render();
        break;
      }
      case "moveRule": {
        // in the editor: to the start, to the end, or right after a rule given by its number
        const after = this.root.querySelector<HTMLInputElement>("[data-move-after]")?.value.trim().replace(/^#/, "") ?? "";
        const where = btn.dataset.to === "start" ? "start" : btn.dataset.to === "end" ? "end" : { after };
        const to = typeof where === "object" && !after ? -1 : moveRule(d.rules, i, where);
        if (to < 0) {
          this.drawerError = fmt("moveAfterBad", { id: after || "?" });
          this.render();
          return;
        }
        this.openEdit.rules = to;
        this.drawerError = "";
        this.preview = null;
        this.render();
        break;
      }
      case "moreHits": {
        // more rows in one section of the open rule's matches; only that box is redrawn
        const sec = btn.dataset.sec === "lost" ? "lost" : "wins";
        this.hitLimit[sec] += HIT_MORE;
        const at = this.openEdit.rules;
        const box = this.root.querySelector("[data-rule-hits]");
        if (box && at !== undefined && d.rules[at]) box.innerHTML = this.ruleRows(d.rules[at], d.rules, this.sourceRows(p));
        break;
      }
      case "ruleRows":
        // the count opens the rule, whose editor lists the rows it hits
        this.openEditor(() => (this.openEdit.rules = i), `[data-act="ruleRows"][data-i="${i}"]`);
        break;
      case "restoreTx": {
        const tx = btn.dataset.tx ?? "";
        this.session.change((proj) => restoreTransaction(proj, tx));
        break;
      }
      case "edit":
        this.openEditor(() => (this.openEdit[tab] = i), `[data-act="edit"][data-i="${i}"]`);
        break;
      case "addFix": {
        const tx = btn.dataset.tx ?? "";
        this.openEditor(() => {
          d.fixes.push({ id: nextNumericId(d.fixes.map((f) => f.id)), txId: tx });
          this.openEdit.fixes = d.fixes.length - 1;
          this.fixSearch = "";
          this.newFixOpen = false;
        }, "[data-newfix] > summary");
        this.root.querySelector<HTMLElement>(".drawer-body input, .drawer-body select")?.focus();
        break;
      }
      case "preview": {
        const err = validate(p, d);
        if (err) {
          this.session.showError(err);
          return;
        }
        this.preview = previewDraft(p, withRenames(d));
        if (this.session.state.error) this.session.showError("");
        const box = this.root.querySelector("[data-preview]");
        if (box) box.innerHTML = this.previewBox();
        break;
      }
      case "closePreview":
        this.preview = null;
        this.render();
        break;
      case "discard":
        void ask(t("confirmDiscardEdits"), { danger: true }).then((yes) => {
          if (!yes) return;
          this.draft = this.load(p);
          this.preview = null;
          this.closeEditor();
          if (this.session.state.error) this.session.showError("");
          else this.render();
        });
        break;
      case "save": {
        const err = validate(p, d);
        if (err) {
          this.session.showError(err);
          return;
        }
        const draft = withRenames(d);
        this.draft = null;
        this.preview = null;
        this.session.change((proj) => saveDraft(proj, draft));
        break;
      }
      case "delProfile": {
        const id = btn.dataset.id ?? "";
        this.session.change((proj) => proj.setProfiles(proj.getProfiles().filter((x) => x.id !== id)));
        break;
      }
    }
  }
}
