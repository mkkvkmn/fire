// Tapahtumat: the ledger rows behind any number, with the shared report bar, category filters,
// free-text search over every source column, CSV export of the shown rows, and an editor under a
// row to correct its transaction.
import { matches, type RowFilter } from "../../analytics/measures";
import { monthsBetween, type Period } from "../../analytics/period";
import type { ReportState } from "../../app/reportState";
import type { Session } from "../../app/session";
import { ledgerToCsv } from "../../engine/exportCsv";
import { isLocked } from "../../engine/lock";
import { fixOf } from "../../engine/fix";
import type { Fix, LedgerRow } from "../../engine/types";
import {
  compiledRules,
  deleteTransaction,
  fixFromValues,
  nextFixId,
  originalValues,
  setTransactionFix,
  type FixValues,
} from "../../project/service";
import { bindCombos, combo } from "../../ui/combo";
import { dateField, parseDateField } from "../../ui/dateField";
import { ask } from "../../ui/dialog";
import { downloadFile } from "../../storage/projectFile";
import { formatAmount, formatCount, formatDate } from "../../ui/format";
import { CLASSES, CLASS_LABEL, classification } from "../../ui/classification";
import { html, raw } from "../../ui/html";
import { parseNumber } from "../../ui/numberField";
import { icon } from "../../ui/icons";
import { PeriodPicker } from "../../ui/periodPicker";
import { fmt, t } from "../../ui/texts";
import { bindFilterBar, reportBar } from "./common";

const PAGE = 200;

export class RowsScreen {
  private local: RowFilter = {};
  private query = "";
  private limit = PAGE;
  private openRow: string | null = null;
  /** The row whose fix editor is open. */
  private fixRow: string | null = null;
  private sourceText: { revision: number; map: Map<string, string> } | null = null;
  private readonly picker: PeriodPicker;

  constructor(
    private readonly root: HTMLElement,
    private readonly state: ReportState,
    private readonly session: Session,
  ) {
    this.picker = new PeriodPicker({
      mode: "range",
      quick: ["month", "12", "ytd", "prev", "all"],
      first: () => this.state.model()?.firstMonth ?? "",
      last: () => this.state.model()?.lastMonth ?? "",
      onChange: (from, to) => {
        // a click-through's filter stays; only its period follows the picker
        const d = this.state.drill;
        this.state.drill = d ? (d.period ? { ...d, period: { from, to } } : d) : null;
        this.state.set({ preset: "custom", custom: { from, to } });
      },
    });
    bindFilterBar(root, state);
    root.addEventListener("change", (e) => {
      const el = e.target as HTMLSelectElement;
      const k = el.dataset.rowf;
      if (!k) return;
      (this.local as Record<string, string | undefined>)[k] = el.value === "" ? undefined : el.value;
      if (k === "class") this.local.category = this.local.subCategory = undefined;
      if (k === "category") this.local.subCategory = undefined;
      this.limit = PAGE;
      this.render();
    });
    root.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.rowq === undefined) return;
      this.query = el.value;
      this.limit = PAGE;
      const pos = el.selectionStart;
      this.render();
      const again = this.root.querySelector<HTMLInputElement>("[data-rowq]");
      again?.focus();
      if (pos !== null) again?.setSelectionRange(pos, pos);
    });
    root.addEventListener("click", (e) => this.onClick(e));
    bindCombos(root, {
      options: (name, el) => this.fixChoices(name, el),
      noun: (name) => t(name === "subCategory" ? "nounSub" : "nounMain"),
    });
  }

  /** Categories seen with the editor's class, sub-categories seen with its category. */
  private fixChoices(name: string, el: HTMLElement): string[] {
    const form = el.closest<HTMLElement>(".fix-editor");
    const rows = this.state.model()?.rows ?? [];
    const val = (k: string) =>
      (form?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-fixv="${k}"]`)?.value ?? "").trim().toLowerCase();
    const pick =
      name === "category"
        ? rows.filter((r) => !val("class") || r.class.toLowerCase() === val("class")).map((r) => r.category)
        : rows.filter((r) => r.category.toLowerCase() === val("category")).map((r) => r.subCategory);
    return [...new Set(pick.map((x) => x.toLowerCase()).filter(Boolean))].sort();
  }

  /** Every source column of each transaction as one lower-case string, for search. */
  private sources(): Map<string, string> {
    const s = this.session.state;
    if (!s.project) return new Map();
    if (this.sourceText?.revision !== s.revision) {
      const map = new Map(s.project.getSourceRows().map((r) => [r.txId, Object.values(r.columns).join(" ").toLowerCase()]));
      this.sourceText = { revision: s.revision, map };
    }
    return this.sourceText.map;
  }

  private shown(): { rows: LedgerRow[]; period: Period; filter: RowFilter } | null {
    const m = this.state.model();
    const barPeriod = this.state.period();
    if (!m || !barPeriod) return null;
    const drill = this.state.drill;
    const p: Period = drill?.period ?? barPeriod;
    const months = new Set(monthsBetween(p.from, p.to));
    const pool =
      drill?.target !== undefined
        ? this.state.targetRows(drill.target, p)
        : drill?.rule !== undefined
          ? this.state.ruleRows(drill.rule, p)
          : drill?.rowType === "Target"
            ? m.targets
            : m.rows;
    const filter: RowFilter = { ...this.local, ...(drill?.filter ?? {}) };
    const q = this.query.trim().toLowerCase();
    const src = q ? this.sources() : null;
    const rows = pool
      .filter((r) => months.has(r.month) && matches(r, filter))
      .filter((r) => {
        if (!q) return true;
        const own = [
          r.date,
          r.account,
          r.description,
          r.info,
          r.class,
          r.category,
          r.subCategory,
          r.ruleId,
          r.sourceFile,
          r.owner,
          String(r.amount),
        ]
          .join(" ")
          .toLowerCase();
        return own.includes(q) || (src?.get(r.txId) ?? "").includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.rowId.localeCompare(b.rowId));
    return { rows, period: p, filter };
  }

  render(): void {
    const m = this.state.model();
    const res = this.shown();
    if (!m || !res) {
      this.root.innerHTML = html`<div class="page-head">
          <div>
            <div class="eyebrow">${t("navGroupReports")}</div>
            <h1>${t("navRows")}</h1>
          </div>
        </div>
        <section class="card empty-state">
          <h3>${t("overviewEmptyTitle")}</h3>
          <p class="muted">${t("rowsEmptyBody")}</p>
          <a class="btn primary" href="#/import/files">${raw(icon("import"))}${t("importFilesLink")}</a>
        </section>`;
      return;
    }
    const { rows, period: p, filter } = res;
    this.picker.set(p.from, p.to);
    const drill = this.state.drill;
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const inPeriod = m.rows.filter((r) => monthsBetween(p.from, p.to).includes(r.month));
    const values = (key: "class" | "category" | "subCategory") =>
      [...new Set(inPeriod.filter((r) => matches(r, { ...filter, [key]: undefined })).map((r) => r[key].toLowerCase()))]
        .filter(Boolean)
        .sort();
    const select = (key: "class" | "category" | "subCategory", all: string) => {
      const cur = filter[key] ?? "";
      const locked = drill?.filter[key] !== undefined;
      return html`<select data-rowf="${key}" aria-label="${all}" ${raw(locked ? "disabled" : "")}>
        <option value="">${all}</option>
        ${raw(
          values(key)
            .map((v) => html`<option value="${v}" ${raw(v === cur ? "selected" : "")}>${v}</option>`)
            .join(""),
        )}
      </select>`;
    };
    const middle = html`<label class="search"
        >${raw(icon("search"))}<input
          type="search"
          data-rowq
          value="${this.query}"
          placeholder="${t("searchRowsPlaceholder")}"
          aria-label="${t("searchRowsPlaceholder")}"
      /></label>
      ${raw(select("class", t("allClasses")))}${raw(select("category", t("allCategories")))}${raw(select("subCategory", t("allSubCategories")))}
      <button
        type="button"
        class="ghost icon-only"
        data-rowact="clear"
        title="${t("resetFilters")}"
        aria-label="${t("resetFilters")}"
        ${raw(this.filtered() ? "" : "disabled")}
      >
        ${raw(icon("eraser"))}
      </button>`;

    const chips: string[] = [];
    const chip = (label: string, key: string) =>
      html`<button type="button" class="pill accent chip" data-chip="${key}" title="${t("removeFilter")}">
        ${label} ${raw(icon("x"))}
      </button>`;
    if (filter.class) chips.push(chip(`${t("fieldClass")}: ${filter.class}`, "class"));
    if (filter.category) chips.push(chip(`${t("fieldCategory")}: ${filter.category}`, "category"));
    if (filter.subCategory) chips.push(chip(`${t("fieldSubCategory")}: ${filter.subCategory}`, "subCategory"));
    if (filter.classes) chips.push(chip(filter.classes.join(" + "), "drill"));
    if (filter.categories) chips.push(chip(filter.categories.join(" + "), "drill"));
    if (filter.description) chips.push(chip(filter.description, "drill"));
    if (this.query.trim()) chips.push(chip(`${t("searchChip")}: ${this.query.trim()}`, "query"));
    // a click-through's dates are in the period picker: one place for the period, no chip for it
    if (drill?.target !== undefined) chips.push(chip(`${t("goalChip")}: ${drill.target}`, "drill"));
    if (drill?.rule !== undefined) chips.push(chip(`${t("ruleChip")}: ${drill.rule}`, "drill"));
    const lockedThrough = this.session.state.project?.getSettings().lockedThrough ?? "";
    const fixList = this.session.state.project?.getFixes() ?? [];
    // a row's fix by its transaction: its ruleId cannot tell a fix id from a rule id
    const fixesByTx = new Map<string, Fix[]>();
    for (const f of fixList) fixesByTx.set(f.txId, [...(fixesByTx.get(f.txId) ?? []), f]);

    const body = rows
      .slice(0, this.limit)
      .map((r) => {
        const fixed = fixOf(r, fixesByTx.get(r.txId) ?? []) !== undefined;
        const cls = classification(r.class, r.category, r.subCategory);
        const owner = r.split
          ? html`${r.owner} ${Math.round(r.share * 100)} % <span class="pill accent">${t("sharedPill")}</span>`
          : html`${r.owner}`;
        const acts =
          r.rowType === "Actual"
            ? html`<button
                type="button"
                class="sm ghost icon-only ${this.fixRow === r.rowId ? "on" : ""}"
                data-rowact="fix"
                data-row="${r.rowId}"
                title="${t("edit")}"
                aria-label="${t("edit")}"
                aria-expanded="${String(this.fixRow === r.rowId)}"
              >
                ${raw(icon("pencil"))}
              </button>`
            : "";
        const open = this.openRow === r.rowId;
        const detail = open
          ? html`<tr class="row-detail">
              <td colspan="7">
                <div class="grid g-2">
                  <div>
                    <h3>${r.description} · ${formatAmount(r.amount)} €</h3>
                    <p class="small muted">
                      ${formatDate(r.date)} · ${r.account} · ${t("sourceFileLabel")} <span class="mono">${r.sourceFile}</span>
                    </p>
                    <p class="small">
                      ${raw(
                        fixed
                          ? fmt("rowDecidedFix", { id: html`<a href="#/settings/fixes">${r.ruleId}</a>` })
                          : r.ruleId
                            ? fmt("rowDecidedRule", {
                                id: html`<a href="#/settings/rules/${encodeURIComponent(r.ruleId)}" title="${t("openRule")}"
                                  >${r.ruleId}</a
                                >`,
                              })
                            : t("rowDecidedNone"),
                      )}
                    </p>
                  </div>
                  <div class="note">
                    ${raw(icon(isLocked(r.month, lockedThrough) ? "lock" : "unlock"))}
                    <div>
                      <b>${isLocked(r.month, lockedThrough) ? t("monthLockedTitle") : t("monthOpenTitle")}</b>
                      <div class="small muted">${isLocked(r.month, lockedThrough) ? t("monthLockedBody") : t("monthOpenBody")}</div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>`
          : "";
        const editor = this.fixRow === r.rowId ? this.fixEditor(r, fixList, lockedThrough) : "";
        return (
          html`<tr class="${r.rowType === "Target" ? "target-row" : ""} ${open ? "open" : ""}" data-open="${r.rowId}">
            <td class="num">${formatDate(r.date)}</td>
            <td>${r.description}${raw(r.info ? html`<div class="small muted">${r.info}</div>` : "")}</td>
            <td>${r.account}</td>
            <td>${raw(cls)}${raw(fixed ? html` <span class="pill warn" title="${t("fixedTitle")}">${t("fixedPill")}</span>` : "")}</td>
            <td>${raw(owner)}</td>
            <td class="num ${r.amount < 0 ? "down" : "up"}">${formatAmount(r.amount)} €</td>
            <td class="row-actions">${raw(acts)}</td>
          </tr>` +
          editor +
          detail
        );
      })
      .join("");

    this.root.innerHTML = html` <div class="page-head">
        <div>
          <div class="eyebrow">${t("navGroupReports")}</div>
          <h1>${t("navRows")}</h1>
        </div>
        <div class="filters"><button type="button" data-rowact="csv" title="${t("csvHelp")}">${raw(icon("download"))}CSV</button></div>
      </div>
      ${raw(reportBar(this.state, m, "", middle))}
      <div class="actions chips">
        ${raw(chips.join(""))}${raw(chips.length ? html`<button type="button" class="sm ghost" data-rowact="clear">${t("clearFilters")}</button>` : "")}
        <span class="grow"></span
        ><span class="small muted"
          >${raw(fmt("rowsCountTotal", { n: formatCount(rows.length), sum: html`<b class="num">${formatAmount(total)} €</b>` }))}</span
        >
      </div>
      <section class="card flush">
        <div class="table-wrap">
          <table class="rows-table">
            <thead>
              <tr>
                <th>${t("colDate")}</th>
                <th>${t("colDescription")}</th>
                <th>${t("colAccount")}</th>
                <th>${t("colClassification")}</th>
                <th>${t("colOwner")}</th>
                <th class="num">${t("colAmount")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${raw(
                body ||
                  html`<tr>
                    <td colspan="7" class="muted">${t("noRowsFound")}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
        <div class="actions card-foot">
          <span class="small muted"
            >${fmt("showingRows", { a: formatCount(Math.min(this.limit, rows.length)), n: formatCount(rows.length) })}</span
          ><span class="grow"></span>
          ${raw(rows.length > this.limit ? html`<button type="button" class="sm" data-rowact="more">${t("showMoreRows")}</button>` : "")}
        </div>
      </section>`;
    this.picker.mount(this.root.querySelector<HTMLElement>("[data-period]"));
  }

  /** Ends a click-through, keeping the period the picker shows, so the dates do not jump. */
  private endDrill(): void {
    const period = this.state.drill?.period;
    this.state.drill = null;
    if (period) this.state.set({ preset: "custom", custom: period });
    else this.render();
  }

  private onClick(e: Event): void {
    const el = e.target as HTMLElement;
    const chipBtn = el.closest<HTMLButtonElement>("button[data-chip]");
    if (chipBtn) {
      const k = chipBtn.dataset.chip!;
      const drill = this.state.drill;
      if (k === "query") this.query = "";
      else if (k === "drill") return this.endDrill();
      else {
        (this.local as Record<string, string | undefined>)[k] = undefined;
        // a filter that came with the click: take it out of the click-through too
        if (drill && drill.filter[k as keyof RowFilter] !== undefined) {
          const filter = { ...drill.filter, [k]: undefined };
          if (drill.target === undefined && drill.rule === undefined && Object.values(filter).every((v) => v === undefined))
            return this.endDrill();
          this.state.drill = { ...drill, filter };
        }
      }
      this.render();
      return;
    }
    const b = el.closest<HTMLButtonElement>("button[data-rowact]");
    if (!b) {
      const tr = el.closest<HTMLTableRowElement>("tr[data-open]");
      if (tr && !el.closest("button, a, input, select")) {
        this.openRow = this.openRow === tr.dataset.open ? null : (tr.dataset.open ?? null);
        this.render();
      }
      return;
    }
    switch (b.dataset.rowact) {
      case "clear":
        this.local = {};
        this.query = "";
        this.endDrill();
        break;
      case "more":
        this.limit += PAGE;
        this.render();
        break;
      case "csv": {
        const res = this.shown();
        if (res) downloadFile(new TextEncoder().encode(ledgerToCsv(res.rows)), "final_data.csv", "text/csv;charset=utf-8");
        break;
      }
      case "fix":
        this.fixRow = this.fixRow === b.dataset.row ? null : (b.dataset.row ?? null);
        this.render();
        this.root.querySelector<HTMLInputElement>(".fix-editor input, .fix-editor select")?.focus();
        break;
      case "fixCancel":
        this.fixRow = null;
        this.render();
        break;
      case "txDelete":
        void this.deleteTx();
        break;
      case "fixSave":
      case "fixRemove":
        this.saveFix(b.dataset.rowact === "fixRemove");
        break;
    }
  }

  /** True when a filter of this page (not the report bar's period or member) is set. */
  private filtered(): boolean {
    return Object.values(this.local).some((v) => v !== undefined) || this.query.trim() !== "" || this.state.drill !== null;
  }

  /** Deletes the open row's transaction after asking. */
  private async deleteTx(): Promise<void> {
    const p = this.session.state.project;
    const r = p?.getLedger().find((x) => x.rowId === this.fixRow);
    if (!p || !r) return;
    const what = `${formatDate(r.date)} · ${r.description} · ${formatAmount(r.amountOriginal)} €`;
    if (!(await ask(fmt("confirmDeleteTx", { what }), { ok: t("deleteTx"), danger: true }))) return;
    let ok = true;
    this.session.change((proj) => {
      ok = deleteTransaction(proj, r.txId);
    });
    if (!ok) {
      this.session.showError(t("monthLockedBody"));
      return;
    }
    this.fixRow = null;
    this.render();
  }

  /** The transaction's values before any fix, or null when its source row is gone. */
  private original(txId: string): FixValues | null {
    const p = this.session.state.project;
    const row = p?.getSourceRows().find((x) => x.txId === txId);
    return p && row ? originalValues(row, compiledRules(p)) : null;
  }

  /** The editor under a row: the transaction's fields as they are now, saved as a fix. */
  private fixEditor(r: LedgerRow, fixes: Fix[], lockedThrough: string): string {
    const wrap = (body: string) =>
      html`<tr class="fix-editor">
        <td colspan="7">${raw(body)}</td>
      </tr>`;
    if (isLocked(r.month, lockedThrough)) {
      return wrap(
        html`<div class="note small">
          ${raw(icon("lock"))}
          <div><b>${t("monthLockedTitle")}</b> ${t("monthLockedBody")}</div>
        </div>`,
      );
    }
    if (fixes.some((f) => f.txId === r.txId && f.parts)) {
      return wrap(
        html`<div class="note small">
          ${raw(icon("fix"))}
          <div>${raw(fmt("fixSplitElsewhere", { link: html`<a href="#/settings/fixes">${t("fixSplitLink")}</a>` }))}</div>
        </div>`,
      );
    }
    const orig = this.original(r.txId);
    if (!orig) return wrap(html`<p class="small bad-text">${t("fixNoRow")}</p>`);
    const fix = fixes.find((f) => f.txId === r.txId && !f.parts);
    const opt = (v: string, label: string, sel: boolean) => html`<option value="${v}" ${raw(sel ? "selected" : "")}>${label}</option>`;
    const cls = r.class.toLowerCase();
    const field = (label: string, input: string) => html`<label class="field">${label}${raw(input)}</label>`;
    const text = (k: string, v: string, choices = false) =>
      choices ? combo(k, v, { label: k, attrs: html`data-fixv="${k}"` }) : html`<input data-fixv="${k}" value="${v}" />`;
    const was = [
      formatDate(orig.date),
      orig.description,
      `${formatAmount(orig.amount ?? 0)} €`,
      [orig.class, orig.category, orig.subCategory].filter(Boolean).join(" › ") || t("uncategorised"),
    ].join(" · ");
    return wrap(
      html`<div class="fix-form">
        <div class="fix-head"><b>${t("fixEditTitle")}</b><span class="small muted">${t("fixOriginal")}: ${was}</span></div>
        <div class="fix-fields">
          ${raw(field(t("colDate"), dateField(r.date, html`data-fixv="date" aria-label="${t("colDate")}"`)))}
          ${raw(field(t("colDescription"), text("description", r.description)))} ${raw(field(t("colInfo"), text("info", r.info)))}
          ${raw(r.split ? "" : field(t("colAmount"), html`<input class="num-input" data-fixv="amount" inputmode="decimal" value="${String(r.amount).replace(".", ",")}" />`))}
          ${raw(
            field(
              t("fieldClass"),
              html`<select data-fixv="class">
                ${raw(cls ? "" : opt("", "-", true))}${raw(CLASSES.map((c) => opt(c, t(CLASS_LABEL[c]!), cls === c)).join(""))}
              </select>`,
            ),
          )}
          ${raw(field(t("fieldCategory"), text("category", r.category, true)))}
          ${raw(field(t("fieldSubCategory"), text("subCategory", r.subCategory, true)))}
        </div>
        <div class="actions">
          <span class="small muted">${t("fixEditHint")}</span><span class="grow"></span>
          <button type="button" class="sm ghost danger" data-rowact="txDelete">${t("deleteTx")}</button>
          ${raw(fix ? html`<button type="button" class="sm ghost danger" data-rowact="fixRemove">${t("removeFix")}</button>` : "")}
          <button type="button" class="sm ghost" data-rowact="fixCancel">${t("cancel")}</button>
          <button type="button" class="sm primary" data-rowact="fixSave">${t("saveFix")}</button>
        </div>
      </div>`,
    );
  }

  private saveFix(remove: boolean): void {
    const p = this.session.state.project;
    const r = p?.getLedger().find((x) => x.rowId === this.fixRow);
    const box = this.root.querySelector<HTMLElement>(".fix-editor");
    if (!p || !r || !box) return;
    const orig = this.original(r.txId);
    if (!orig) return;
    const val = (k: string) => box.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-fixv="${k}"]`)?.value ?? "";
    const amountText = val("amount").trim();
    const amount = parseNumber(amountText);
    if (amountText && !Number.isFinite(amount)) {
      this.session.showError(t("badNumber"));
      return;
    }
    const old = p.getFixes().find((f) => f.txId === r.txId && !f.parts);
    const wanted: FixValues = {
      date: parseDateField(val("date")) ?? orig.date,
      description: val("description"),
      info: val("info"),
      amount: r.split || !amountText ? undefined : amount,
      class: val("class"),
      category: val("category"),
      subCategory: val("subCategory"),
    };
    const fix = remove ? null : fixFromValues(old?.id ?? nextFixId(p.getFixes()), r.txId, orig, wanted, old?.owner);
    let locked: string[] = [];
    this.session.change((proj) => {
      locked = setTransactionFix(proj, r.txId, fix);
    });
    if (locked.length) {
      this.session.showError(fmt("fixLocked", { ids: locked.join(", "), m: p.getSettings().lockedThrough }));
      return;
    }
    this.fixRow = null;
    this.render();
  }
}
