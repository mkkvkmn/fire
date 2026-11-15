// Settings screen: editors for rules, splits, fixes, targets, owners, profiles and user scripts.
// Edits are a draft; "Preview changes" shows what the open months would get, then "Save" applies.
// Locked months never change here.
import { ask } from "../ui/dialog";
import {
  AMOUNT_MATCH,
  CLASSES,
  COLS,
  MAX_RULE_ROWS,
  MAX_SEARCH,
  NOUN,
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
import { html, raw } from "../ui/html";
import { icon } from "../ui/icons";
import { PRE_WHAT } from "../ui/preprocessors";
import { fmt, plural, t, type TextKey } from "../ui/texts";

export class SettingsScreen {
  private tab: Tab = "rules";
  private draft: Draft | null = null;
  private preview: LedgerDiff | null = null;
  private ruleFilter = "";
  private openRule: string | null = null;
  private fixSearch = "";
  /** Filter text per settings tab (Luokittelusäännöt has its own, it also finds rule ids). */
  private tabFilter: Partial<Record<Tab, string>> = {};
  /** The fix whose inputs are open, by its place in the draft. */
  private openFix: number | null = null;
  /** Accounts whose splits are open on Tilit. */
  private openAccts = new Set<string>();
  /** "Uusi korjaus" is open (collapsed by default; stays as the user left it). */
  private newFixOpen = false;
  private countTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: Session,
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

  /** Renders the screen; `tab` comes from the address (#/settings/<tab>). */
  /** Renders the screen; `focus` is a rule id from the address (#/settings/rules/<id>) to show. */
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
      this.openRule = null;
    }
    const d = this.current(p);
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
        body = html`<p class="muted">${t("targetsBody")}</p>
          <div class="actions"><button type="button" class="primary" data-act="add">${raw(icon("plus"))}${t("addTarget")}</button></div>
          ${raw(this.filterBox("targetFilterHint"))}
          ${raw(
            this.table("targets", d.targets as unknown as Item[], {
              sort: (a, b) => (d.targets[b]!.end || "9999").localeCompare(d.targets[a]!.end || "9999") || b - a,
              find: (i) =>
                [d.targets[i]!.name, d.targets[i]!.owner, d.targets[i]!.class, d.targets[i]!.category, d.targets[i]!.subCategory]
                  .join(" ")
                  .toLowerCase(),
            }),
          )}`;
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
      ${raw(this.footer())}
    `;
    // Through the CSSOM: the content security policy blocks style attributes in markup.
    for (const line of this.root.querySelectorAll<HTMLElement>("[data-members]"))
      line.style.setProperty("--members", line.dataset.members ?? "1");
    if (this.tab === "rules") {
      this.updateRuleCounts();
      if (focus && focus !== this.focused) this.showRule(focus);
    }
    this.focused = focus;
  }

  /** Opens the Rules tab with a new rule drafted from a row (from Tapahtumat). */
  startRule(input: { account: string; description: string; info: string; amount: number }): void {
    const p = this.project;
    if (!p) return;
    this.current(p);
    const d = this.draft!;
    const rule = ruleFromRow(input, nextNumericId(d.rules.map((r) => r.id)));
    d.rules.push(rule);
    this.tab = "rules";
    this.ruleFilter = "";
    this.openRule = rule.id;
    this.preview = null;
  }

  private footer(): string {
    const dirty = this.dirty();
    const locked = this.project!.getSettings().lockedThrough;
    return html`
      <div class="settings-footer">
        <p class="muted small">${locked ? fmt("settingsLockNote", { m: locked }) : t("settingsOpenNote")} ${t("settingsSaveNote")}</p>
        <div class="actions">
          <button type="button" class="primary" data-act="preview" ${raw(dirty ? "" : "disabled")}>${t("previewChanges")}</button>
          <button type="button" data-act="discard" ${raw(dirty ? "" : "disabled")}>${t("discardEdits")}</button>
          <span class="muted small" data-dirty>${dirty ? t("unsavedEdits") : ""}</span>
        </div>
        <div data-preview>${raw(this.previewBox())}</div>
      </div>
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
    if (key === "owner") return this.owners(p, this.draft!);
    const item = this.listOf(this.tab as ListTab)[Number(el.dataset.i)];
    if (!item) return [];
    const d = this.draft!;
    const known = [...d.rules, ...d.targets, ...p.getLedger()];
    const same = (a: unknown, b: string) => String(a ?? "").toLowerCase() === b.toLowerCase();
    const values =
      key === "category"
        ? known.filter((r) => !item.class || same(item.class, r.class)).map((r) => r.category)
        : known.filter((r) => !item.category || same(item.category, r.category)).map((r) => r.subCategory);
    return [...new Set(values.filter(Boolean).map((x) => x.toLowerCase()))].sort();
  }

  /** The project's members (also those added by hand on Projekti), plus names only this draft uses. */
  private owners(p: Project, d: Draft): string[] {
    const draftNames = [
      d.defaultOwner,
      ...Object.values(d.accountOwners),
      ...d.splits.map((s) => s.owner),
      ...d.targets.map((x) => x.owner),
      ...d.fixes.map((f) => f.owner ?? ""),
    ];
    return [...new Set([...members(p), ...draftNames.filter(Boolean)])];
  }

  // ---- generic list table

  private cell(i: number, c: Col, item: Item): string {
    const v = item[c.key];
    const text = v === undefined || v === null || (typeof v === "number" && Number.isNaN(v)) ? "" : String(v);
    const attrs = html`data-i="${i}" data-k="${c.key}" aria-label="${t(c.label)}"`;
    if (c.kind === "class" || c.kind === "amountMatch") {
      const choices = c.kind === "class" ? CLASSES : AMOUNT_MATCH;
      const empty = c.kind === "class" ? html`<option value="" ${raw(text === "" ? "selected" : "")}>-</option>` : "";
      const required = c.kind === "class" && !c.optional ? "required" : "";
      return html`<td>
        <select ${raw(attrs)} ${raw(required)}>
          ${raw(empty)}${raw(
            choices
              .map(([val, label]) => html`<option value="${val}" ${raw(val === text ? "selected" : "")}>${t(label)}</option>`)
              .join(""),
          )}
        </select>
      </td>`;
    }
    if (c.list) {
      return html`<td>${raw(combo(c.key, text, { label: t(c.label), attrs: html`data-i="${i}" data-k="${c.key}"` }))}</td>`;
    }
    if (c.kind === "date") return html`<td>${raw(dateField(text, attrs))}</td>`;
    const type = "text";
    const cls = c.kind === "number" ? "num-input" : "";
    const list = c.list ? html`list="${c.list}"` : "";
    const mode = c.kind === "number" ? 'inputmode="decimal"' : "";
    return html`<td><input type="${type}" class="${cls}" value="${text}" ${raw(attrs)} ${raw(list)} ${raw(mode)} /></td>`;
  }

  private table(
    tab: ListTab,
    items: Item[],
    opts: {
      lead?: (i: number) => string;
      leadHead?: string;
      extra?: (i: number) => string;
      extraHead?: string;
      order?: boolean;
      filter?: (i: number) => boolean;
      after?: (i: number) => string;
      sort?: (a: number, b: number) => number;
      find?: (i: number) => string;
    } = {},
  ): string {
    const cols = COLS[tab];
    if (items.length === 0) return html`<p class="muted">${t("noRows")}</p>`;
    const head =
      (opts.leadHead !== undefined ? html`<th>${opts.leadHead}</th>` : "") +
      cols.map((c) => html`<th>${t(c.label)}</th>`).join("") +
      (opts.extraHead !== undefined ? html`<th class="num">${raw(opts.extraHead)}</th>` : "") +
      "<th></th>";
    const rows = items.map((item, i) => {
      if (opts.filter && !opts.filter(i)) return "";
      const move = opts.order
        ? html`<button
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
              ${raw(i === items.length - 1 ? "disabled" : "")}
            >
              ${raw(icon("arrowDown"))}
            </button>`
        : "";
      return (
        html`<tr data-row="${i}" ${raw(opts.find ? html`data-find="${opts.find(i)}" ${raw(this.hiddenUnless(opts.find(i)))}` : "")}>
          ${raw(opts.lead ? opts.lead(i) : "")}${raw(cols.map((c) => this.cell(i, c, item)).join(""))}${raw(opts.extra ? opts.extra(i) : "")}
          <td class="row-actions">
            ${raw(move)}<button
              type="button"
              class="sm ghost icon-only"
              data-act="del"
              data-i="${i}"
              title="${t("remove")}"
              aria-label="${t("remove")}"
            >
              ${raw(icon("trash"))}
            </button>
          </td>
        </tr>` + (opts.after ? opts.after(i) : "")
      );
    });
    // a display order; each row keeps its place in the list (data-i), so edits land on the right item
    const order = items.map((_, i) => i);
    if (opts.sort) order.sort(opts.sort);
    const body = order.map((i) => rows[i]).join("");
    return html`<div class="table-wrap">
      <table class="edit-table">
        <thead>
          <tr>
            ${raw(head)}
          </tr>
        </thead>
        <tbody>
          ${raw(body)}
        </tbody>
      </table>
    </div>`;
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
    const tr = this.root.querySelector<HTMLElement>(`.edit-table tr[data-row="${i}"]`);
    tr?.classList.add("found");
    tr?.scrollIntoView({ block: "center" });
  }

  /** Shows only the rules that match the filter, without rebuilding the table (it can be long). */
  private applyRuleFilter(): void {
    const d = this.draft;
    if (!d) return;
    for (const tr of this.root.querySelectorAll<HTMLTableRowElement>(".edit-table tr[data-row]")) {
      const r = d.rules[Number(tr.dataset.row)];
      tr.hidden = !r || !this.ruleShown(r);
    }
  }

  private rulesTab(p: Project, d: Draft): string {
    const filter = (i: number) => this.ruleShown(d.rules[i]!);
    const rows = this.sourceRows(p);
    const after = (i: number) => {
      const r = d.rules[i]!;
      if (this.openRule !== r.id) return "";
      return html`<tr class="form-row">
        <td colspan="10">${raw(this.ruleRows(r, d.rules, rows))}</td>
      </tr>`;
    };
    return html`
      <p class="muted">${t("rulesBody")}</p>
      ${raw(reservedNames(p))}
      <div class="actions"><button type="button" class="primary" data-act="add">${raw(icon("plus"))}${t("addRule")}</button></div>
      <label class="field inline-filter"
        ><span>${t("filter")}</span><input type="search" data-rule-filter value="${this.ruleFilter}" placeholder="${t("ruleFilterHint")}"
      /></label>
      ${raw(
        this.table("rules", d.rules as unknown as Item[], {
          leadHead: "#",
          lead: (i) => html`<td class="muted small">${d.rules[i]!.id}</td>`,
          extraHead: html`${t("colMatches")} ${raw(infoPop(t("matchesInfoTitle"), [t("matchesInfoHits"), t("matchesInfoValid")]))}`,
          extra: (i) =>
            html`<td class="num">
              <button type="button" class="link" data-act="ruleRows" data-id="${d.rules[i]!.id}" data-count="${i}">…</button>
            </td>`,
          order: true,
          filter,
          after,
        }),
      )}
    `;
  }

  /** Rows a rule matches, marking the ones it decides (last match wins). */
  private ruleRows(rule: Rule, rules: Rule[], rows: SourceRow[]): string {
    let compiled;
    try {
      compiled = compileRules(rules);
    } catch (e) {
      return html`<p class="bad-text">${e instanceof Error ? e.message : String(e)}</p>`;
    }
    const idx = rules.findIndex((r) => r.id === rule.id);
    const own = compiled[idx]!;
    const hits: { row: SourceRow; wins: boolean }[] = [];
    for (const row of rows) {
      if (row.fields.amount === null) continue;
      const input = { account: row.fields.account, description: row.fields.description, info: row.fields.info, amount: row.fields.amount };
      if (!ruleMatches(own, input)) continue;
      const later = compiled.slice(idx + 1).some((c) => ruleMatches(c, input));
      hits.push({ row, wins: !later });
    }
    if (hits.length === 0) return html`<p class="muted">${t("ruleNoRows")}</p>`;
    const list = hits
      .slice(0, MAX_RULE_ROWS)
      .map(
        ({ row, wins }) =>
          html`<tr class="${wins ? "" : "muted"}">
            <td>${formatDate(row.fields.date)}</td>
            <td>${row.fields.account}</td>
            <td>${row.fields.description}</td>
            <td class="num">${formatAmount(row.fields.amount ?? 0)}</td>
            <td>${wins ? t("ruleDecides") : t("ruleOverridden")}</td>
          </tr>`,
      )
      .join("");
    return html`<div class="table-wrap">
        <table>
          <tbody>
            ${raw(list)}
          </tbody>
        </table>
      </div>
      ${raw(hits.length > MAX_RULE_ROWS ? html`<p class="muted small">${fmt("moreRows", { n: hits.length - MAX_RULE_ROWS })}</p>` : "")}`;
  }

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
      else this.showRuleCounts(compiled, matches, wins);
    };
    slice();
  }

  private showRuleCounts(compiled: (ReturnType<typeof compileRules>[number] | string)[], matches: number[], wins: number[]): void {
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>("button[data-act=ruleRows]")) {
      const i = Number(btn.dataset.count);
      const c = compiled[i];
      if (typeof c === "string") {
        btn.textContent = t("invalidRegex");
        btn.title = c;
        btn.classList.add("bad-text");
      } else {
        // voimassa / osumat: the rows where this rule stays in force, then every row it hits
        const w = wins[i] ?? 0;
        const n = matches[i] ?? 0;
        btn.textContent = `${formatCount(w)} / ${formatCount(n)}`;
        btn.title = n === 0 ? t("matchesNoneTitle") : fmt("matchesTitle", { w: formatCount(w), n: formatCount(n) });
        btn.classList.toggle("bad-text", n === 0);
        btn.classList.toggle("warn-text", n > 0 && w === 0);
      }
    }
  }

  // ---- fixes

  private fixesTab(p: Project, d: Draft): string {
    const rows = this.sourceRows(p);
    const byTx = new Map(rows.map((r) => [r.txId, r]));
    const rules = compiledRules(p);
    const cols = COLS.fixes;
    const list = d.fixes
      .map((f, i) => {
        const r = byTx.get(f.txId);
        const tx = r
          ? html`<td class="small">
              <div>${formatDate(r.fields.date)} · <span class="num">${formatAmount(r.fields.amount ?? 0)} €</span></div>
              <div class="muted">${r.fields.description}</div>
            </td>`
          : html`<td class="small bad-text" title="${f.txId}">${t("fixNoRow")}</td>`;
        const open = this.openFix === i;
        const acts = html`<td class="row-actions">
          <button
            type="button"
            class="sm ghost icon-only ${open ? "on" : ""}"
            data-act="editFix"
            data-i="${i}"
            title="${t("edit")}"
            aria-label="${t("edit")}"
            aria-expanded="${String(open)}"
          >
            ${raw(icon("pencil"))}
          </button>
          <button type="button" class="sm ghost icon-only" data-act="del" data-i="${i}" title="${t("remove")}" aria-label="${t("remove")}">
            ${raw(icon("trash"))}
          </button>
        </td>`;
        const changes = fixChanges(f, r ? originalValues(r, rules) : null);
        const find = [
          r ? formatDate(r.fields.date) : "",
          r?.fields.description ?? "",
          r?.fields.account ?? "",
          changes.replace(/<[^>]+>/g, " "),
        ]
          .join(" ")
          .toLowerCase();
        const hide = this.hiddenUnless(find);
        const inputs = open
          ? html`<tr class="fix-editor" data-find="${find}" ${raw(hide)}>
              <td colspan="3">
                <div class="table-wrap">
                  <table class="edit-table">
                    <thead>
                      <tr>
                        ${raw(cols.map((c) => html`<th>${t(c.label)}</th>`).join(""))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        ${raw(cols.map((c) => this.cell(i, c, f as unknown as Item)).join(""))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p class="small muted">${t("fixesBody")}</p>
              </td>
            </tr>`
          : "";
        return (
          html`<tr class="${open ? "open" : ""}" data-find="${find}" ${raw(hide)}>
            ${raw(tx)}
            <td>${raw(changes)}</td>
            ${raw(acts)}
          </tr>` + inputs
        );
      })
      .reverse() // newest first: a fix just added shows right under the search
      .join("");
    const table = d.fixes.length
      ? html`<div class="table-wrap">
          <table class="fix-list">
            <thead>
              <tr>
                <th>${t("colTx")}</th>
                <th>${t("colChanges")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${raw(list)}
            </tbody>
          </table>
        </div>`
      : html`<p class="muted">${t("noRows")}</p>`;
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
      ${raw(this.filterBox("fixFilterHint"))} ${raw(table)} ${raw(this.deletedList(p))}
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
    const today = new Date().toISOString().slice(0, 10);
    const pct = (share: number) => `${Math.round(share * 1000) / 10} %`.replace(".", ",");
    const lines = accounts
      .map((a) => {
        const idx = d.splits
          .map((x, i) => [x, i] as const)
          .filter(([x]) => x.account === a)
          .sort(([x, i], [y, j]) => (y.end || "9999").localeCompare(x.end || "9999") || j - i)
          .map(([, i]) => i);
        const open = this.openAccts.has(a) || idx.some((i) => !d.splits[i]!.start);
        const cur = d.accountOwners[a] ?? "";
        const owner =
          a === ""
            ? html`<span class="small bad-text">${t("splitNoAccount")}</span>`
            : html`<select data-owner-acc="${a}" aria-label="${fmt("ownerOf", { a })}">
                ${raw(
                  [...new Set([cur, ...ms].filter(Boolean))]
                    .map((m) => html`<option value="${m}" ${raw(m === cur ? "selected" : "")}>${m}</option>`)
                    .join(""),
                )}
              </select>`;
        // what the splits give today, else how many there are
        const now = idx.map((i) => d.splits[i]!).filter((x) => x.start <= today && today <= x.end);
        const summary = now.length
          ? fmt("acctSplitNow", { parts: now.map((x) => `${x.owner} ${pct(x.share)}`).join(", ") })
          : idx.length
            ? plural(new Set(idx.map((i) => `${d.splits[i]!.start}|${d.splits[i]!.end}`)).size, "acctPeriodsOne", "acctPeriods")
            : "";
        const toggle = html`<button
          type="button"
          class="acct-toggle"
          data-act="toggleAcct"
          data-acc="${a}"
          aria-expanded="${String(open)}"
          title="${open ? t("collapse") : t("acctShowSplits")}"
        >
          ${raw(icon(open ? "chevD" : "chevR"))}<b>${a || "?"}</b>
        </button>`;
        const head = html`<div class="acct-row">
          ${raw(toggle)}<span class="acct-owner">${raw(owner)}</span> <span class="small muted acct-sum">${summary}</span>
        </div>`;
        const find = [a, cur, ...idx.map((i) => d.splits[i]!.owner)].join(" ").toLowerCase();
        const hide = this.hiddenUnless(find);
        if (!open) return html`<div class="acct" data-find="${find}" ${raw(hide)}>${raw(head)}</div>`;
        // one line per period (same start and end): the dates once, then each member's share
        const periods = new Map<string, number[]>();
        for (const i of idx) {
          const x = d.splits[i]!;
          const key = `${x.start}|${x.end}`;
          periods.set(key, [...(periods.get(key) ?? []), i]);
        }
        const cols = [...new Set([...ms, ...idx.map((i) => d.splits[i]!.owner)].filter(Boolean))];
        const shareText = (v: number) => String(Math.round(v * 1000) / 10).replace(".", ",");
        const rows = [...periods.values()]
          .map((group) => {
            const first = d.splits[group[0]!]!;
            const g = group.join(",");
            const shares = cols
              .map((m) => {
                const i = group.find((j) => d.splits[j]!.owner === m);
                const v = i === undefined ? "" : shareText(d.splits[i]!.share);
                return html`<span class="pct"
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
                >`;
              })
              .join("");
            const sum = Math.round(group.reduce((n, j) => n + d.splits[j]!.share, 0) * 1000) / 10;
            const ok = Math.abs(sum - 100) < 0.05;
            return html`<div class="period-line" data-members="${cols.length}">
              ${raw(dateField(first.start, html`data-gdate="start" data-group="${g}" aria-label="${t("colStart")}"`))}
              ${raw(dateField(first.end, html`data-gdate="end" data-group="${g}" aria-label="${t("colEnd")}"`))} ${raw(shares)}
              <span class="small ${ok ? "muted" : "warn-text"}" title="${t("sharesTotal")}"
                >${ok ? "100 %" : `${String(sum).replace(".", ",")} %`}</span
              >
              <button
                type="button"
                class="sm ghost icon-only"
                data-act="delPeriod"
                data-group="${g}"
                title="${t("removePeriod")}"
                aria-label="${t("removePeriod")}"
              >
                ${raw(icon("trash"))}
              </button>
            </div>`;
          })
          .join("");
        const labels = idx.length
          ? html`<div class="period-line period-labels small muted" data-members="${cols.length}">
              <span>${t("colStart")}</span><span>${t("colEnd")}</span>${raw(cols.map((m) => html`<span>${m}</span>`).join(""))}<span
                >${t("sharesTotal")}</span
              ><span></span>
            </div>`
          : "";
        const body = html`<div class="acct-body">
          ${raw(idx.length ? labels + rows : html`<p class="small muted">${fmt("acctNoSplitsYet", { o: cur || "?" })}</p>`)}
          ${raw(a ? html`<button type="button" class="sm primary" data-act="addSplit" data-acc="${a}">${raw(icon("plus"))}${t("addSplit")}</button>` : "")}
        </div>`;
        return html`<div class="acct open" data-find="${find}" ${raw(hide)}>${raw(head)}${raw(body)}</div>`;
      })
      .join("");
    return html`<p class="muted">${t("acctOwnersBody")} ${t("splitsBody")}</p>
      ${raw(this.filterBox("acctFilterHint"))}
      <div class="acct-list">
        <div class="acct-row acct-labels small muted">
          <span>${t("colAccount")}</span><span>${t("acctOwner")}</span><span>${t("splitsTitle")}</span>
        </div>
        ${raw(lines)}
      </div>`;
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
              href="#/import/files/profile/${encodeURIComponent(x.id)}"
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
        <table class="profile-list">
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
    return this.draft![tab] as unknown as Item[];
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
    if (!btn || btn.disabled) return;
    const i = Number(btn.dataset.i);
    const tab = this.tab as ListTab;
    switch (btn.dataset.act) {
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
      case "toggleAcct": {
        const acc = btn.dataset.acc ?? "";
        if (this.openAccts.has(acc)) this.openAccts.delete(acc);
        else this.openAccts.add(acc);
        this.render();
        break;
      }
      case "addSplit": {
        const acc = btn.dataset.acc ?? "";
        d.splits.push({ start: "", end: "", account: acc, share: 1, owner: d.accountOwners[acc] || d.defaultOwner });
        this.openAccts.add(acc);
        this.preview = null;
        this.render();
        this.root.querySelector<HTMLInputElement>(`.acct.open [data-gdate="start"][data-group="${d.splits.length - 1}"]`)?.focus();
        break;
      }
      case "add": {
        if (tab === "rules") {
          const id = nextNumericId(d.rules.map((r) => r.id));
          d.rules.push({ id, account: "", description: "", info: "", amount: "any", class: "", category: "", subCategory: "" });
          this.ruleFilter = "";
        } else if (tab === "splits") {
          d.splits.push({ start: "", end: "", account: "", share: 0.5, owner: d.defaultOwner });
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
        this.preview = null;
        this.render();
        // the new row: last in the list, wherever the table shows it
        const added = this.listOf(tab).length - 1;
        this.root.querySelector<HTMLInputElement>(`.edit-table tr[data-row="${added}"] input`)?.focus();
        break;
      }
      case "del":
        this.listOf(tab).splice(i, 1);
        if (tab === "fixes") this.openFix = null;
        this.preview = null;
        this.render();
        break;
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
      case "ruleRows": {
        const id = btn.dataset.id ?? "";
        this.openRule = this.openRule === id ? null : id;
        this.render();
        break;
      }
      case "restoreTx": {
        const tx = btn.dataset.tx ?? "";
        this.session.change((proj) => restoreTransaction(proj, tx));
        break;
      }
      case "editFix":
        this.openFix = this.openFix === i ? null : i;
        this.render();
        break;
      case "addFix": {
        const tx = btn.dataset.tx ?? "";
        d.fixes.push({ id: nextNumericId(d.fixes.map((f) => f.id)), txId: tx });
        this.openFix = d.fixes.length - 1;
        this.fixSearch = "";
        this.newFixOpen = false;
        this.preview = null;
        this.render();
        this.root.querySelector<HTMLInputElement>(".fix-list tr.fix-editor input, .fix-list tr.fix-editor select")?.focus();
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
          this.openFix = null;
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
