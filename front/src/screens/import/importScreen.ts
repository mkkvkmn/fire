// Tuonti: a three-step flow. Tiedostot (drop files, give each a file profile), Luokittelu (a
// luokittelusääntö for each group of uncategorised rows) and Korjaukset (decisions, corrections for
// single rows, a preview of every staged row, and Tuo rivit). Nothing is written to the project's
// rows before Tuo rivit; rules and file profiles are saved as they are made.
import { ask } from "../../ui/dialog";
import { matchesSearch, visibleGroups, type ClassifiedLine, type FlowStep, type ImportFlow, type RowGroup } from "../../app/importFlow";
import type { Session } from "../../app/session";
import { amountMatchOf, type Categorizable } from "../../engine/categorize";
import type { AmountMatch, Fix, FixPart, LedgerRow, Rule, SourceRow } from "../../engine/types";
import type { RuleOrigin } from "../settingsScreen";
import {
  acceptLate,
  decideDuplicates,
  deleteFix,
  dropInvalid,
  ignoreLate,
  members,
  saveProfile,
  updateProfile,
} from "../../project/service";
import type { Project } from "../../storage/project";
import { pickWithInput } from "../../storage/projectFile";
import { bindCombos, combo, type ComboOption } from "../../ui/combo";
import { categoryOptions } from "../../ui/reserved";
import { RESERVED_PATHS } from "../../engine/reserved";
import { listOrMigration } from "../../project/categories";
import { dupSection, invalidSection, lateSection, orphanSection, ownerSection } from "./checks";
import { formatAmount, formatCount, formatDate } from "../../ui/format";
import { CLASSES, CLASS_LABEL, classification } from "../../ui/classification";
import { html, raw } from "../../ui/html";
import { rowCutWarning } from "../../ui/rowCut";
import { parseNumber } from "../../ui/numberField";
import { icon } from "../../ui/icons";
import { stepper, STEP_LABEL, type ShellContext } from "../../ui/shell";
import { fmt, plural, t, type TextKey } from "../../ui/texts";
import { refocusShowMore, showMoreFoot } from "../../ui/showMore";
import { showToast } from "../../ui/toast";
import { ProfileEditor, type Role } from "./profileEditor";

const ACCEPT = ".csv,.txt,.tsv,.xlsx,.xls,.xlsm";
/** Rows (staged rows, groups) a table draws at first and adds per "Show more". */
const PAGE = 50;

type Quick = "all" | "fixed" | "dup" | "late";

export class ImportScreen {
  /** Open file profile editor: for a staged file (key), or for a stored profile (key -1). */
  private editor: { key: number; profileId?: string; ed: ProfileEditor } | null = null;
  /** Group whose Luo luokittelusääntö button opened the rule editor (Asetukset); the focus returns to it. */
  private ruleFor: { key: string; id: string; act: string; index: number } | null = null;
  /** "Luokiteltu tässä tuonnissa" shows its groups. */
  private showClassified = false;
  /** How many classified lines are drawn ("Näytä lisää" adds a page). */
  private classifiedLimit = PAGE;
  /** The last rule saved here: its number, and the rows and groups it took off the list (until the page is left). */
  private lastSaved: { id: string; rows: number; groups: number } | null = null;
  /** Search over the Luokittelu groups, and how many of the matching groups are drawn. */
  private groupQuery = "";
  private groupLimit = PAGE;
  /** Staged row whose correction (or split) editor is open. */
  private fixFor: { txId: string; mode: "fix" | "split" } | null = null;
  private parts: FixPart[] = [];
  private quick: Quick = "all";
  private search = "";
  /** Every imported file in the list, not only the newest. */
  private allFiles = false;
  /** Filter for the file list: name or file profile. */
  private fileQuery = "";
  private fileFilter = "";
  private limit = PAGE;
  /** The project the searches above were typed for: another project starts them empty. */
  private searchFor: Project | null = null;
  private ctx: ShellContext | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: Session,
    private readonly flow: ImportFlow,
    /** Asetukset' rule editor, where Luo luokittelusääntö drafts the new rule. */
    private readonly rules: {
      startRule(input: Categorizable & { amountMatch?: AmountMatch }, back: string, extraRows: SourceRow[], origin: RuleOrigin): void;
      editRule(id: string, back: string, extraRows: SourceRow[], origin: RuleOrigin): void;
      readonly ruleOverlay: boolean;
    },
  ) {
    root.addEventListener("click", (e) => void this.onClick(e));
    root.addEventListener("change", (e) => this.onChange(e));
    root.addEventListener("input", (e) => this.onInput(e));
    // details do not bubble their toggle: listen while capturing. Opening draws the table (lazy).
    root.addEventListener(
      "toggle",
      (e) => {
        const el = e.target as HTMLDetailsElement;
        if (!el.matches?.("[data-classified]") || el.open === this.showClassified) return;
        this.showClassified = el.open;
        if (el.open) this.redraw();
      },
      true,
    );
    // A stored profile's editor left without saving (back, Peruuta, any other page): its draft goes,
    // so the next visit starts from the saved profile. On the address, as this screen does not
    // render while another page is shown.
    window.addEventListener("hashchange", () => {
      if (this.editor?.key === -1 && !location.hash.startsWith("#/import/files/profile/")) this.editor = null;
      if (!location.hash.startsWith("#/import/classify")) this.lastSaved = null;
    });
    // Esc is Peruuta in the reading settings' editor (on the document: the focus may be anywhere);
    // not when a combo's open list took it, a dialog is open, or this screen is hidden
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || root.hidden || !this.editor?.ed.readingOpen) return;
      if (document.querySelector("dialog[open]")) return;
      this.cancelReading();
    });
    root.addEventListener("dragover", (e) => {
      if (!root.querySelector(".drop")) return;
      e.preventDefault();
      root.querySelector(".drop")?.classList.add("over");
    });
    root.addEventListener("dragleave", () => root.querySelector(".drop")?.classList.remove("over"));
    root.addEventListener("drop", (e) => {
      if (!root.querySelector(".drop")) return;
      e.preventDefault();
      void this.addFiles(Array.from(e.dataTransfer?.files ?? []));
    });
    bindCombos(root, {
      options: (name, el) => this.comboOptions(name, el),
      noun: (name) => t(name === "sub" ? "nounSub" : "nounMain"),
      picked: (name, el, value) => this.comboPicked(name, el, value),
    });
  }

  private get project() {
    return this.session.state.project!;
  }

  render(ctx: ShellContext, rest: string): void {
    this.ctx = ctx;
    if (!this.session.state.project) {
      this.root.innerHTML = "";
      return;
    }
    if (this.searchFor !== this.project) this.clearSearches();
    const editKey = ctx.step === "files" && rest.startsWith("edit/") ? Number(rest.slice(5)) : null;
    // "profile/<id>", or "profile/<id>/settings" when opened from Asetukset › Tiedostoprofiilit
    const profilePath = ctx.step === "files" && rest.startsWith("profile/") ? rest.slice(8).split("/") : null;
    let body: string;
    if (editKey !== null) body = this.editorView(editKey);
    else if (profilePath) body = this.storedProfileView(decodeURIComponent(profilePath[0] ?? ""), profilePath[1] === "settings");
    else if (ctx.step === "files") body = this.filesView();
    else if (ctx.step === "classify") body = this.classifyView();
    else body = this.fixesView();
    this.root.innerHTML = html`<div class="page-head">
        <div>
          <div class="eyebrow">${t("navGroupData")}</div>
          <h1>${t("navImport")}</h1>
        </div>
      </div>
      ${raw(stepper(ctx))}${raw(body)}`;
    this.showFiles();
    this.focusRuleOpener(ctx.step);
  }

  /**
   * Back from the rule editor: the focus returns to the button that opened it, or, when its line is
   * gone (the group left the waiting list), to the group now in its place (the last one; the search
   * field when none is left).
   */
  private focusRuleOpener(step: FlowStep): void {
    const opener = this.ruleFor;
    // the editor is still open over this page: it keeps the focus
    if (opener === null || step !== "classify" || this.rules.ruleOverlay) return;
    // a save draws this page a few times in a row (the project changed, the checked groups, the
    // drawer closed): each draw puts the focus back, then it is forgotten
    queueMicrotask(() => {
      if (!this.rules.ruleOverlay) this.ruleFor = null;
    });
    const table = opener.id ? "table.done-groups" : "table.waiting-groups";
    const line = [...this.root.querySelectorAll<HTMLElement>(`${table} tbody > tr`)].find(
      (r) => r.dataset.g === opener.key && (!opener.id || r.dataset.id === opener.id),
    );
    const own = line?.querySelector<HTMLElement>(`button[data-imp="${opener.act}"]`);
    if (own) return own.focus();
    const waiting = [...this.root.querySelectorAll<HTMLElement>('table.waiting-groups button[data-imp="ruleOpen"]')];
    const next =
      waiting.find((b) => b.dataset.g === opener.key) ??
      (opener.index >= 0 ? waiting[Math.min(opener.index, waiting.length - 1)] : waiting[0]);
    (next ?? this.root.querySelector<HTMLElement>("input[data-gq]"))?.focus();
  }

  /** After a change to the staged files: their derived data is computed again, then views redraw. */
  private rerender(): void {
    this.flow.touch();
  }

  /** Empties the searches and pages, for a project opened after them. */
  private clearSearches(): void {
    this.searchFor = this.project;
    this.search = "";
    this.limit = PAGE;
    this.fileQuery = "";
    this.fileFilter = "";
    this.groupQuery = "";
    this.groupLimit = PAGE;
    this.classifiedLimit = PAGE;
    this.showClassified = false;
    this.lastSaved = null;
  }

  /** After a change to this view only (a filter, an open editor, a draft field): redraw, reuse the data. */
  private redraw(): void {
    this.flow.redraw();
  }

  // ---- Tiedostot

  private filesView(): string {
    const st = this.flow.staging;
    const open = st.openFiles();
    const ready = st.readyFiles();
    const imported = this.project.getSourceFiles();
    const profiles = new Map(this.project.getProfiles().map((p) => [p.id, p.name]));
    const todo =
      open.length > 0
        ? html`<div class="note warn todo">
            ${raw(icon("alert"))}
            <div>
              <b>${plural(open.length, "openTasksOne", "openTasks")}</b>
              <div class="small">${fmt("filesTodo", { n: open.length })}</div>
            </div>
          </div>`
        : st.empty
          ? html`<section class="infobox">
              ${raw(icon("import"))}
              <div>
                <b>${t("filesIntroTitle")}</b>
                <div class="muted small">${t("filesIntroBody")}</div>
              </div>
            </section>`
          : html`<div class="note ok todo">
              ${raw(icon("check"))}
              <div>
                <b>${t("filesAllReady")}</b>
                <div class="small">${t("filesAllReadyBody")}</div>
              </div>
            </div>`;
    const status = (f: (typeof st.files)[number]) => {
      if (f.profileId === "") return html`<span class="pill warn">${t("profileMissing")}</span>`;
      if (f.error) return html`<span class="pill err" title="${f.error}">${t("profileReadError")}</span>`;
      return html`<span class="pill ok">${raw(icon("check"))}${t(f.recognised ? "profileRecognised" : "profileChosen")}</span>`;
    };
    const fq = this.fileQuery.trim().toLowerCase();
    // every row is in the table; the search only hides rows (see showFiles), so typing stays fast
    const find = (name: string, profileId: string) => `${name} ${profiles.get(profileId) ?? profileId}`.toLowerCase();
    const stagedRows = st.files
      .map((f) => {
        const needs = f.profileId === "" || f.error !== "";
        const extra = [
          f.already > 0 ? fmt("alreadyRows", { n: f.already }) : "",
          f.problems.length > 0 ? fmt("problemRows", { n: f.problems.length }) : "",
        ].filter(Boolean);
        return html`<tr class="${needs ? "needs" : ""}" data-find="${find(f.name, f.profileId)}" data-rank="-1">
          <td>
            <span class="mono">${f.name}</span
            >${raw(extra.length ? html`<div class="small muted">${extra.join(" · ")}</div>` : "")}${raw(rowCutWarning(f.cut))}
          </td>
          <td class="${f.profileId ? "" : "muted"}">${f.profileId ? (profiles.get(f.profileId) ?? f.profileId) : t("notRecognised")}</td>
          <td class="num ${f.profileId ? "" : "muted"}">${f.profileId && !f.error ? formatCount(f.rows.length) : ""}</td>
          <td>${raw(status(f))}</td>
          <td class="num row-actions">
            <a class="btn sm ${needs ? "primary" : ""}" href="#/import/files/edit/${f.key}">${raw(icon("pencil"))}${t("edit")}</a>
            <button
              type="button"
              class="sm ghost"
              data-imp="removeFile"
              data-key="${f.key}"
              title="${t("removeFromImport")}"
              aria-label="${t("removeFromImport")}"
            >
              ${raw(icon("x"))}
            </button>
          </td>
        </tr>`;
      })
      .join("");
    const date = (iso: string) => formatDate(iso.slice(0, 10));
    const doneRows = [...imported]
      .reverse()
      .map(
        (f, i) =>
          html`<tr class="done" data-find="${find(f.name, f.profileId)}" data-rank="${i}">
            <td><span class="mono">${f.name}</span></td>
            <td>
              ${raw(profiles.has(f.profileId) ? html`<a href="#/import/files/profile/${encodeURIComponent(f.profileId)}" title="${t("editProfile")}">${profiles.get(f.profileId)}</a>` : "")}
            </td>
            <td class="num">${formatCount(f.rowCount)}</td>
            <td><span class="pill">${fmt("importedOn", { d: date(f.importedAt) })}</span></td>
            <td></td>
          </tr>`,
      )
      .join("");
    const nRows = ready.reduce((n, f) => n + f.rows.length, 0);
    const table =
      st.empty && imported.length === 0
        ? ""
        : html`<div class="section-label">${t("filesTitle")}</div>
            <section class="card flush">
              <div class="filters card-filters">
                <label class="search"
                  >${raw(icon("search"))}<input
                    type="search"
                    data-fq
                    value="${this.fileQuery}"
                    placeholder="${t("searchFilesPlaceholder")}"
                    aria-label="${t("searchFilesPlaceholder")}"
                /></label>
                <span class="small muted" data-fcount></span>
              </div>
              <div class="table-wrap">
                <table class="files">
                  <thead>
                    <tr>
                      <th>${t("colFile")}</th>
                      <th>${t("colProfile")}</th>
                      <th class="num">${t("colRows")}</th>
                      <th>${t("colStatus")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${raw(stagedRows)}${raw(doneRows)}
                  </tbody>
                </table>
              </div>
              ${raw(st.empty ? "" : html`<div class="actions card-foot"><span class="small muted">${fmt("filesReadyFoot", { f: ready.length, n: formatCount(nRows) })}</span></div>`)}
              ${raw(
                imported.length > RECENT_FILES
                  ? html`<div class="actions card-foot" data-fmore ${raw(fq ? "hidden" : "")}>
                      <span class="grow"></span>
                      <button type="button" class="sm" data-imp="allFiles">
                        ${this.allFiles ? t("filesShowRecent") : fmt("filesShowAll", { n: imported.length })}
                      </button>
                    </div>`
                  : "",
              )}
            </section>`;
    return html`${raw(todo)}
      <section class="drop compact">
        ${raw(icon("import"))}
        <div>
          <b>${t("dropTitle")}</b>
          <div class="muted small">${t("dropBody")}</div>
        </div>
        <button type="button" class="primary" data-imp="choose">${t("chooseFiles")}</button>
      </section>
      ${raw(table)} ${raw(st.empty && imported.length === 0 ? "" : this.next("classify"))}`;
  }

  /** Shows the files that match the search; without one, the newest few (or all, when asked). */
  private showFiles(): void {
    const q = this.fileQuery.trim().toLowerCase();
    let n = 0;
    for (const tr of this.root.querySelectorAll<HTMLTableRowElement>("table.files tbody tr[data-find]")) {
      const show = q ? (tr.dataset.find ?? "").includes(q) : this.allFiles || Number(tr.dataset.rank) < RECENT_FILES;
      tr.hidden = !show;
      if (show) n++;
    }
    const count = this.root.querySelector("[data-fcount]");
    if (count) count.textContent = q ? fmt("filesMatching", { n }) : "";
    const more = this.root.querySelector<HTMLElement>("[data-fmore]");
    if (more) more.hidden = q !== "";
  }

  private next(to: FlowStep | "done", back?: FlowStep): string {
    const counts = this.ctx!.counts;
    const here = this.ctx!.step;
    const b = back ? html`<a class="btn" href="#/import/${back}">${raw(icon("arrowL"))}${t("back")}</a>` : "";
    if (to === "done") return "";
    const n = counts[here];
    return html`<div class="actions flow-next">
      ${raw(b)}<span class="grow"></span>
      <a class="btn primary" href="#/import/${to}"
        >${fmt("nextStep", { step: t(STEP_LABEL[to]).toLowerCase() })}${raw(n > 0 ? html`<span class="badge">${plural(n, "openTasksOne", "openTasks")}</span>` : "")}</a
      >
    </div>`;
  }

  private async addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    const loaded = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    this.flow.staging.add(this.project, loaded);
    this.rerender();
  }

  // ---- Tiedostot > Muokkaa

  private editorView(key: number): string {
    const f = this.flow.staging.files.find((x) => x.key === key);
    if (!f) return html`<p class="muted">${t("fileGone")} <a href="#/import/files">${t("backToFiles")}</a></p>`;
    if (this.editor?.key !== key) {
      this.editor = { key, ed: new ProfileEditor(this.project, f.name, f.bytes, f.profileId) };
    }
    const pill =
      f.profileId === ""
        ? html`<span class="pill warn">${t("profileMissing")}</span>`
        : html`<span class="pill ok">${raw(icon("check"))}${t(f.recognised ? "profileRecognised" : "profileChosen")}</span>`;
    const p = this.project;
    return this.editor.ed.render(p.getSettings().defaultOwner, pill);
  }

  /** Where the stored profile's editor goes back to, and after saving: where it was opened from. */
  private profileBack = { href: "#/import/files", label: "" };

  /**
   * Editor for a stored file profile, shown with the latest file it read. Opened from Asetukset ›
   * Tiedostoprofiilit or from a profile's name in Tuonti › Tiedostot; it goes back where it came from.
   */
  private storedProfileView(id: string, fromSettings: boolean): string {
    this.profileBack = fromSettings
      ? { href: "#/settings/profiles", label: t("backToProfiles") }
      : { href: "#/import/files", label: t("backToFiles") };
    const p = this.project;
    const file = p
      .getSourceFiles()
      .filter((f) => f.profileId === id)
      .pop();
    const bytes = file ? p.getSourceFileBytes(file.id) : null;
    if (!file || !bytes)
      return html`<div class="note warn">
        ${raw(icon("alert"))}
        <div>${t("noSampleFile")} <a href="${this.profileBack.href}">${this.profileBack.label}</a></div>
      </div>`;
    if (this.editor?.profileId !== id) this.editor = { key: -1, profileId: id, ed: new ProfileEditor(p, file.name, bytes, id) };
    return this.editor.ed.render(p.getSettings().defaultOwner, html`<span class="pill">${t("storedProfile")}</span>`, this.profileBack);
  }

  /** The reading settings' editor closed: its Muokkaa button gets the focus back. */
  private focusReadingOpener(): void {
    this.root.querySelector<HTMLElement>('.reading-panel [data-imp="readingOpen"]')?.focus();
  }

  /** Peruuta in the reading settings' editor: as in Asetukset, it asks first when something was changed. */
  private cancelReading(): void {
    const ed = this.editor?.ed;
    if (!ed) return;
    const undo = () => {
      ed.cancelReading();
      this.redraw();
      this.focusReadingOpener();
    };
    if (!ed.readingChanged()) return undo();
    void ask(t("confirmDiscardItem"), { danger: true, ok: t("discardShort") }).then((yes) => {
      if (yes) undo();
    });
  }

  private saveEditor(): void {
    const e = this.editor;
    if (!e || e.ed.problem()) return;
    if (e.key === -1) {
      const profile = structuredClone(e.ed.draft);
      if (profile.id !== e.profileId) profile.id = e.profileId!;
      let res: ReturnType<typeof updateProfile> | undefined;
      this.session.change((proj) => {
        res = updateProfile(proj, profile);
      });
      this.editor = null;
      if (res)
        showToast(
          t("profileSavedTitle"),
          fmt("profileUpdated", { n: res.reread }) + (res.orphanedFixes > 0 ? ` ${fmt("orphanedFixes", { n: res.orphanedFixes })}` : ""),
        );
      // back where the editor was opened from
      location.hash = this.profileBack.href;
      return;
    }
    const profile = structuredClone(e.ed.draft);
    const exists = this.project.getProfiles().some((p) => p.id === profile.id);
    const used = this.project.getSourceFiles().some((f) => f.profileId === profile.id);
    this.session.change((proj) => {
      if (exists && used) updateProfile(proj, profile);
      else saveProfile(proj, profile);
    });
    this.flow.staging.setProfile(this.project, e.key, profile.id);
    // A saved profile may also fit other staged files that had none.
    for (const f of this.flow.staging.files) {
      if (f.profileId === "" && new RegExp(`^(?:${profile.filePattern})`).test(f.name))
        this.flow.staging.setProfile(this.project, f.key, profile.id);
    }
    this.editor = null;
    location.hash = "#/import/files";
    this.rerender();
  }

  // ---- Luokittelu

  private classifyView(): string {
    const data = this.flow.data();
    // in the order first shown: a group that loses rows to a rule keeps its place
    const groups = this.flow.ordered(data.groups);
    // every group has a rule now: a search left from before would only hide the next import's groups
    if (groups.length === 0) {
      this.groupQuery = "";
      this.groupLimit = PAGE;
    }
    const rows = groups.reduce((n, g) => n + g.rows.length, 0);
    // files not read yet (no file profile, or an error): their rows are not on this list yet
    const unread = this.ctx!.counts.files;
    const filesLink = html`<a href="#/import/files">${t(STEP_LABEL.files)}</a>`;
    const unreadNote = html`<div class="note warn todo">
      ${raw(icon("alert"))}
      <div>
        <b>${plural(unread, "filesUnreadOne", "filesUnread")}</b>
        <div class="small">${raw(fmt(unread === 1 ? "filesUnreadBodyOne" : "filesUnreadBody", { link: filesLink }))}</div>
      </div>
    </div>`;
    const todo =
      (unread > 0 ? unreadNote : "") +
      (groups.length > 0
        ? html`<div class="note warn todo">
            ${raw(icon("alert"))}
            <div>
              <b>${plural(groups.length, "openTasksOne", "openTasks")}</b>
              <div class="small">${fmt("classifyTodo", { r: rows, g: groups.length })}</div>
            </div>
          </div>`
        : unread > 0
          ? ""
          : html`<div class="note ok todo">
              ${raw(icon("check"))}
              <div>
                <b>${t("classifyDone")}</b>
                <div class="small">${t("classifyDoneBody")}</div>
              </div>
            </div>`);
    const info = html`<section class="infobox">
      ${raw(icon("rule"))}
      <div>
        <b>${t("classifyInfoTitle")}</b>
        <div class="muted small">
          ${raw(fmt("classifyInfoBody", { link: html`<a href="#/settings/rules">${t("settingsLinkWord")}</a>` }))}
        </div>
      </div>
    </section>`;
    const { shown, matching } = visibleGroups(groups, this.groupQuery, this.groupLimit);
    const body = shown
      .map(
        (g) =>
          html`<tr data-g="${g.key}">
            ${raw(this.groupCells(g))}
            <td class="num">
              <button type="button" class="sm primary" data-imp="ruleOpen" data-g="${g.key}">${t("createRule")}</button>
            </td>
          </tr>`,
      )
      .join("");
    const table = groups.length
      ? html`<section class="card flush">
          <div class="filters card-filters">
            <label class="search"
              >${raw(icon("search"))}<input
                type="search"
                data-gq
                value="${this.groupQuery}"
                placeholder="${t("searchRowsPlaceholder")}"
                aria-label="${t("searchRowsPlaceholder")}"
            /></label>
          </div>
          <div class="table-wrap">
            <table class="groups waiting-groups">
              ${raw(this.groupHead())}
              <tbody>
                ${raw(
                  body ||
                    html`<tr>
                      <td colspan="7" class="muted">${t("noGroupsFound")}</td>
                    </tr>`,
                )}
              </tbody>
            </table>
          </div>
          ${raw(showMoreFoot(shown.length, matching, "showingGroups", ["imp", "moreGroups"]))}
        </section>`
      : "";
    const classified = this.classifiedCard(this.flow.classifiedLines(groups));
    return html`${raw(todo)}${raw(info)}${raw(classified)}${raw(table)}${raw(this.next("fixes", "files"))}`;
  }

  /** The head of a Luokittelu groups table. */
  private groupHead(): string {
    return html`<thead>
      <tr>
        <th>${t("colDescription")}</th>
        <th>${t("colInfo")}</th>
        <th>${t("colAccount")}</th>
        <th class="num">${t("colRows")}</th>
        <th class="num">${t("colTotal")}</th>
        <th>${t("colFirst")}</th>
        <th></th>
      </tr>
    </thead>`;
  }

  /** A group's cells before its buttons, the same in both Luokittelu tables. */
  private groupCells(g: RowGroup): string {
    return html`<td>${g.description || t("unnamed")}</td>
      <td class="muted">${g.info}</td>
      <td>${g.account}</td>
      <td class="num">${formatCount(g.rows.length)}</td>
      <td class="num">${formatAmount(g.total)} €</td>
      <td>${formatDate(g.first)}</td>`;
  }

  /** "Luokiteltu tässä tuonnissa": a summary line on top of the waiting list, its groups shown on request. */
  private classifiedCard(lines: ClassifiedLine[]): string {
    if (lines.length === 0) return "";
    const rows = lines.reduce((n, l) => n + l.group.rows.length, 0);
    const groups = new Set(lines.map((l) => l.group.key)).size;
    const open = this.showClassified;
    const s = this.lastSaved;
    const last = s
      ? html`<span class="small">${fmt("ruleSavedNote", { id: s.id, r: formatCount(s.rows), g: formatCount(s.groups) })}</span>`
      : "";
    const body = lines
      .slice(0, this.classifiedLimit)
      .map(({ group: g, rule: r }) => {
        const cls = [r.class, r.category, r.subCategory].filter(Boolean).join(" › ");
        return html`<tr class="done" data-g="${g.key}" data-id="${r.id}">
          ${raw(this.groupCells(g))}
          <td class="num">
            <div class="done-cell">
              <span class="done-by">${raw(icon("check"))}${fmt("groupDoneBy", { id: r.id })}</span>
              <span class="small muted">${cls}</span>
              <span class="done-acts">
                <button
                  type="button"
                  class="sm"
                  data-imp="ruleEdit"
                  data-g="${g.key}"
                  data-id="${r.id}"
                  aria-label="${fmt("editRuleAria", { id: r.id })}"
                >
                  ${t("editRule")}
                </button>
                <button type="button" class="sm" data-imp="ruleOpen" data-g="${g.key}" data-id="${r.id}">${t("newRule")}</button>
              </span>
            </div>
          </td>
        </tr>`;
      })
      .join("");
    // the table is drawn only while open: 100 000 rows can make thousands of lines
    const table = open
      ? html`<div class="table-wrap">
            <table class="groups done-groups">
              ${raw(this.groupHead())}
              <tbody>
                ${raw(body)}
              </tbody>
            </table>
          </div>
          ${raw(showMoreFoot(Math.min(this.classifiedLimit, lines.length), lines.length, "showingGroups", ["imp", "moreClassified"]))}`
      : "";
    return html`<details class="card task ok classified-card" data-classified ${raw(open ? "open" : "")}>
      <summary>
        ${raw(icon("check"))}<span class="title">${fmt("classifiedTitle", { r: formatCount(rows), g: formatCount(groups) })}</span
        >${raw(last)}
      </summary>
      ${raw(table)}
    </details>`;
  }

  /**
   * Luo luokittelusääntö (or Uusi sääntö on a classified line): the one rule editor of Asetukset (its
   * drawer) opens over this page with a new rule drafted from the group.
   */
  private openRule(key: string, ruleId = ""): void {
    const before = this.flow.ordered(this.flow.data().groups);
    const done = ruleId ? this.flow.classifiedLines(before).find((l) => l.group.key === key && l.rule.id === ruleId)?.group : undefined;
    const g = done ?? before.find((x) => x.key === key);
    if (!g) return;
    this.ruleFor = { key, id: ruleId, act: "ruleOpen", index: before.indexOf(g) };
    const info = g.infoShared ? g.info : "";
    // every staged row once (they are not in the project yet), so the editor counts what the rule would hit;
    // the waiting groups, so it says how many the rule leaves; the drawer opens over this page
    this.rules.startRule(
      // the sign comes from the rows: a total of 0 (purchase and refund) or mixed signs must not lose rows
      { account: "", description: g.description, info, amount: g.total, amountMatch: amountMatchOf(g.rows.map((r) => r.fields.amount)) },
      location.hash,
      this.flow.staging.stagedRows(),
      {
        waiting: before,
        overlay: true,
        onSaved: (rule) => this.ruleSaved(rule, before),
      },
    );
    this.flow.redraw();
  }

  /** Muokkaa sääntöä on a classified line: the rule that decides it opens in the same drawer, over this page. */
  private editRule(key: string, id: string): void {
    const before = this.flow.data().groups;
    this.ruleFor = { key, id, act: "ruleEdit", index: -1 };
    this.rules.editRule(id, location.hash, this.flow.staging.stagedRows(), {
      waiting: before,
      overlay: true,
      onSaved: (rule) => this.ruleSaved(rule, before),
    });
    this.flow.redraw();
  }

  /** A rule from here was saved: the rows it took off the waiting list are listed as classified, with a note on what it did. */
  private ruleSaved(rule: Rule, before: RowGroup[]): void {
    const { rows, groups } = this.flow.markClassified(before);
    // an edit that took nothing more off the list needs no note
    this.lastSaved = rows > 0 ? { id: rule.id, rows, groups } : null;
    this.flow.redraw();
  }

  // ---- category suggestions for the combos

  /** From the category list: the categories of the form's class, the subcategories of its category. */
  private comboOptions(name: string, el: HTMLElement): (string | ComboOption)[] {
    const form = el.closest<HTMLElement>("[data-fix-form], .split-part");
    const cls = form?.querySelector<HTMLSelectElement>("[data-rule-class]")?.value ?? "";
    const main = form?.querySelector<HTMLInputElement>('[data-combo="main"] input')?.value ?? "";
    const list = listOrMigration(this.project, RESERVED_PATHS);
    return name === "main" ? categoryOptions(list, "category", cls) : categoryOptions(list, "subCategory", cls, main);
  }

  private comboPicked(name: string, el: HTMLElement, value: string): void {
    const form = el.closest<HTMLElement>("[data-fix-form], .split-part");
    if (!form) return;
    if (name === "main") {
      const sub = form.querySelector<HTMLInputElement>('[data-combo="sub"] input');
      if (sub) {
        sub.disabled = value === "";
        sub.placeholder = value ? t("searchOrAdd") : t("chooseMainFirst");
      }
    }
    if (form.matches(".split-part")) {
      const i = Number(form.dataset.part);
      const part = this.parts[i];
      if (part) {
        if (name === "main") part.category = value;
        else part.subCategory = value;
      }
    }
  }

  // ---- Korjaukset

  private fixesView(): string {
    const data = this.flow.data();
    const review = data.review!;
    const st = this.flow.staging;
    const stagedLate = this.flow.lateDecided ? [] : data.preview.late;
    const lateRows = [...stagedLate, ...review.late];
    const tasks: string[] = [];
    if (lateRows.length)
      tasks.push(html`<li>${raw(fmt("taskLate", { link: html`<a href="#late">${fmt("nRows", { n: lateRows.length })}</a>` }))}</li>`);
    if (review.failedFixes.length)
      tasks.push(
        html`<li>
          ${raw(fmt("taskOrphans", { link: html`<a href="#orphans">${fmt("nFixes", { n: review.failedFixes.length })}</a>` }))}
        </li>`,
      );
    if (review.duplicateGroups.length)
      tasks.push(
        html`<li>
          ${raw(fmt("taskDuplicates", { link: html`<a href="#dups">${fmt("nGroups", { n: review.duplicateGroups.length })}</a>` }))}
        </li>`,
      );
    if (review.invalid.length)
      tasks.push(
        html`<li>${raw(fmt("taskInvalid", { link: html`<a href="#invalid">${fmt("nRows", { n: review.invalid.length })}</a>` }))}</li>`,
      );
    const waiting = st.openFiles().length;
    if (waiting)
      tasks.unshift(
        html`<li>${raw(fmt("taskOpenFiles", { link: html`<a href="#/import/files">${plural(waiting, "nFilesOne", "nFiles")}</a>` }))}</li>`,
      );
    const uncategorised = data.preview.uncategorized.length;
    if (uncategorised && !st.empty)
      tasks.push(
        html`<li>
          ${raw(fmt("taskUncategorised", { link: html`<a href="#/import/classify">${fmt("nRows", { n: uncategorised })}</a>` }))}
        </li>`,
      );
    if (!st.empty) tasks.push(html`<li>${raw(fmt("taskApprove", { b: html`<b>${t("importRows")}</b>` }))}</li>`);
    const count = this.ctx!.counts.fixes + waiting + (st.empty ? 0 : 1);
    const todo = tasks.length
      ? html`<div class="note warn todo">
          ${raw(icon("alert"))}
          <div>
            <b>${plural(count, "openTasksBeforeOne", "openTasksBefore")}</b>
            <ol class="todo-list small">
              ${raw(tasks.join(""))}
            </ol>
          </div>
        </div>`
      : html`<div class="note ok todo">
          ${raw(icon("check"))}
          <div>
            <b>${t("fixesNothing")}</b>
            <div class="small">${t("fixesNothingBody")}</div>
          </div>
        </div>`;
    const info = html`<section class="infobox">
      ${raw(icon("review"))}
      <div>
        <b>${t("checksInfoTitle")}</b>
        <ul class="muted small checks-list">
          <li><b>${t("dupTitle")}:</b> ${t("checksDup")}</li>
          <li>
            <b>${t("checksFixesLabel")}:</b>
            ${raw(fmt("checksFixes", { link: html`<a href="#/settings/fixes">${t("settingsLinkWord")}</a>` }))}
          </li>
          <li><b>${t("invalidTitle")}:</b> ${t("checksInvalid")}</li>
          <li><b>${t("lateTitle")}:</b> ${t("checksLate")}</li>
          <li><b>${t("ownerTitle")}:</b> ${t("checksOwner")}</li>
        </ul>
        <div class="muted small">${t("checksApprove")}</div>
      </div>
    </section>`;

    const sections = [
      ownerSection(this.project, this.flow.staging),
      dupSection(this.project, review.duplicateGroups),
      orphanSection(review.failedFixes),
      invalidSection(this.project, review.invalid),
      lateSection(this.project, this.flow.staging, stagedLate, review.late),
    ].join("");
    const preview = st.empty ? "" : this.previewSection();
    const nAdd = data.preview.rows.length
      ? new Set(data.preview.rows.map((r) => r.txId)).size -
        data.preview.duplicates.filter((d) => !st.keepDuplicates.has(d.newRow.txId)).length
      : 0;
    const dupOut = data.preview.duplicates.filter((d) => !st.keepDuplicates.has(d.newRow.txId)).length;
    const bar = st.empty
      ? html`<div class="actions flow-next">
          <a class="btn" href="#/import/classify">${raw(icon("arrowL"))}${t("back")}</a><span class="grow"></span>
          <span class="small muted">${t("nothingStaged")}</span><a class="btn primary" href="#/overview">${t("toOverview")}</a>
        </div>`
      : html`<div class="actions flow-next import-bar">
          <a class="btn" href="#/import/classify">${raw(icon("arrowL"))}${t("back")}</a><span class="grow"></span>
          <span class="small muted">${fmt("importSummary", { n: formatCount(nAdd), d: dupOut })}</span>
          <button type="button" class="primary" data-imp="commit">
            ${raw(icon("check"))}${fmt("importRowsN", { n: formatCount(nAdd) })}
          </button>
        </div>`;
    return html`${raw(todo)}${raw(info)}${raw(sections)}${raw(preview)}${raw(bar)}`;
  }

  private previewSection(): string {
    const data = this.flow.data();
    const st = this.flow.staging;
    const dupIds = new Set(data.preview.duplicates.map((d) => d.newRow.txId));
    const lateIds = new Set(data.preview.late.map((r) => r.txId));
    const fixIds = new Map(st.fixes.map((f) => [f.txId, f]));
    const fileOf = new Map(st.stagedRows().map((r) => [r.txId, r.sourceFile]));
    // one line per transaction: the first ledger row, with the transaction's total amount
    const byTx = new Map<string, LedgerRow[]>();
    for (const r of data.preview.rows) {
      const list = byTx.get(r.txId) ?? [];
      list.push(r);
      byTx.set(r.txId, list);
    }
    let txs = [...byTx.entries()];
    if (this.search.trim()) txs = txs.filter(([, rs]) => matchesSearch(rs[0]!, this.search));
    if (this.fileFilter) txs = txs.filter(([id]) => fileOf.get(id) === this.fileFilter);
    if (this.quick === "fixed") txs = txs.filter(([id]) => fixIds.has(id));
    if (this.quick === "dup") txs = txs.filter(([id]) => dupIds.has(id));
    if (this.quick === "late") txs = txs.filter(([id]) => lateIds.has(id));
    txs.sort((a, b) => b[1][0]!.date.localeCompare(a[1][0]!.date));
    const counts = { all: byTx.size, fixed: [...byTx.keys()].filter((id) => fixIds.has(id)).length, dup: dupIds.size, late: lateIds.size };
    const seg = (["all", "fixed", "dup", "late"] as Quick[])
      .map(
        (k) =>
          html`<button type="button" class="${this.quick === k ? "on" : ""}" data-quick="${k}">
            ${t(QUICK_LABEL[k])} <span class="count">${counts[k]}</span>
          </button>`,
      )
      .join("");
    const files = [...new Set(fileOf.values())];
    const body = txs
      .slice(0, this.limit)
      .map(([id, rs]) => this.previewRow(id, rs, fixIds.get(id), dupIds.has(id)))
      .join("");
    return html`<div class="section-label">${t("previewRowsTitle")}</div>
      <section class="card flush">
        <div class="preview-head"><div class="small muted">${t("previewRowsHint")}</div></div>
        <div class="filters fix-filters">
          <label class="search"
            >${raw(icon("search"))}<input
              data-pq
              value="${this.search}"
              placeholder="${t("searchRowsPlaceholder")}"
              aria-label="${t("searchRowsPlaceholder")}"
          /></label>
          <select data-pfile aria-label="${t("colFile")}">
            <option value="">${t("allFiles")}</option>
            ${raw(files.map((f) => html`<option value="${f}" ${raw(f === this.fileFilter ? "selected" : "")}>${f}</option>`).join(""))}
          </select>
          <div class="seg sm">${raw(seg)}</div>
        </div>
        <div class="table-wrap">
          <table class="fix-table">
            <thead>
              <tr>
                <th>${t("colDate")}</th>
                <th>${t("colDescription")}</th>
                <th>${t("colInfo")}</th>
                <th>${t("colAccount")}</th>
                <th class="num">${t("colAmount")}</th>
                <th>${t("colClassification")}</th>
                <th>${t("colSource")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${raw(
                body ||
                  html`<tr>
                    <td colspan="8" class="muted">${t("noRowsFound")}</td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>
        ${raw(showMoreFoot(Math.min(this.limit, txs.length), txs.length, "showingNofM", ["imp", "moreRows"]))}
      </section>`;
  }

  private previewRow(txId: string, rs: LedgerRow[], fix: Fix | undefined, dup: boolean): string {
    const r = rs[0]!;
    const st = this.flow.staging;
    const amount = rs[0]!.amountOriginal;
    const label = (x: { class: string; category: string; subCategory: string }) => classification(x.class, x.category, x.subCategory);
    const cls = fix?.parts
      ? rs.map((x) => html`<div>${raw(label(x))} <span class="muted small">${formatAmount(x.amount)} €</span></div>`).join("")
      : label(r);
    let source: string;
    let acts: string;
    if (dup) {
      source = html`<span class="pill warn">${t("duplicatePill")}</span>`;
      acts = html`<label class="small check"
        ><input type="checkbox" data-keepdup="${txId}" ${raw(st.keepDuplicates.has(txId) ? "checked" : "")} /> ${t("importAnyway")}</label
      >`;
    } else if (fix) {
      source = html`<span class="pill accent">${t("fixPill")}</span>`;
      acts = html`<button type="button" class="sm ghost" data-imp="unfix" data-tx="${txId}">${t("removeFix")}</button>`;
    } else {
      source = html`<span class="small muted">${r.ruleId ? fmt("ruleShortN", { id: r.ruleId }) : "-"}</span>`;
      acts = html`<button type="button" class="sm" data-imp="fixOpen" data-tx="${txId}">${t("fixRow")}</button
        ><button type="button" class="sm ghost" data-imp="splitOpen" data-tx="${txId}">${t("splitRow")}</button>`;
    }
    const open = this.fixFor?.txId === txId;
    const editor = open
      ? html`<tr class="${this.fixFor!.mode === "split" ? "split-editor" : "exception-editor"}">
          <td colspan="8">${raw(this.fixFor!.mode === "split" ? this.splitForm(r) : this.fixForm(r))}</td>
        </tr>`
      : "";
    return (
      html`<tr class="${fix ? "fixed" : ""} ${dup ? "dup" : ""}">
        <td class="num">${formatDate(r.date)}</td>
        <td>${r.description}</td>
        <td class="muted">${r.info}</td>
        <td>${r.account}</td>
        <td class="num">${formatAmount(amount)} €</td>
        <td>${raw(cls)}</td>
        <td>${raw(source)}</td>
        <td class="num row-actions">${raw(acts)}</td>
      </tr>` + editor
    );
  }

  private fixForm(r: LedgerRow): string {
    const opt = (v: string, label: string, sel: boolean) => html`<option value="${v}" ${raw(sel ? "selected" : "")}>${label}</option>`;
    return html`<div class="rule-form exception-row" data-fix-form>
      <div class="field">
        ${t("rowLabel")}
        <div class="small muted ex-what">
          ${formatDate(r.date)} · ${r.description} · ${formatAmount(r.amountOriginal)} €<br />${fmt("byRule", { what: [r.class, r.category, r.subCategory].filter(Boolean).join(" › ") || t("uncategorised") })}
        </div>
      </div>
      <label class="field"
        >${t("fieldClass")}<select data-rule-class data-fixf="class">
          ${raw(CLASSES.map((c) => opt(c, t(CLASS_LABEL[c]!), (r.class || "menot") === c)).join(""))}
        </select></label
      >
      <div class="field">
        ${t("fieldCategory")}${raw(combo("main", r.category, { placeholder: t("searchOrAdd"), label: t("fieldCategory") }))}
      </div>
      <div class="field">
        ${t("fieldSubCategory")}${raw(combo("sub", r.subCategory, { placeholder: t("searchOrAdd"), label: t("fieldSubCategory") }))}
      </div>
      <span></span>
      <div class="actions rule-actions">
        <button type="button" class="sm ghost" data-imp="fixCancel">${t("cancel")}</button
        ><button type="button" class="sm primary" data-imp="fixSave" data-tx="${r.txId}">${t("saveFix")}</button>
      </div>
    </div>`;
  }

  private splitForm(r: LedgerRow): string {
    const opt = (v: string, label: string, sel: boolean) => html`<option value="${v}" ${raw(sel ? "selected" : "")}>${label}</option>`;
    const ms = members(this.project);
    const total = r.amountOriginal;
    const sum = this.parts.reduce((a, p) => a + p.amount, 0);
    const left = Math.round((total - sum) * 100) / 100;
    const parts = this.parts
      .map(
        (p, i) =>
          html`<div class="rule-form split-part" data-part="${i}">
            <label class="field"
              >${i === 0 ? t("colAmount") : ""}<input
                class="num"
                data-partf="amount"
                data-i="${i}"
                value="${formatAmount(p.amount)}"
                inputmode="decimal"
                aria-label="${t("colAmount")}"
            /></label>
            <label class="field"
              >${i === 0 ? t("fieldClass") : ""}<select data-rule-class data-partf="class" data-i="${i}" aria-label="${t("fieldClass")}">
                ${raw(CLASSES.map((c) => opt(c, t(CLASS_LABEL[c]!), p.class === c)).join(""))}
              </select></label
            >
            <div class="field">
              ${i === 0 ? t("fieldCategory") : ""}${raw(combo("main", p.category, { placeholder: t("searchOrAdd"), label: t("fieldCategory") }))}
            </div>
            <div class="field">
              ${i === 0 ? t("fieldSubCategory") : ""}${raw(combo("sub", p.subCategory, { placeholder: t("searchOrAdd"), label: t("fieldSubCategory") }))}
            </div>
            <label class="field"
              >${i === 0 ? t("memberLabel") : ""}<select data-partf="owner" data-i="${i}" aria-label="${t("memberLabel")}">
                ${raw(opt("", t("asAccount"), !p.owner) + ms.map((m) => opt(m, m, p.owner === m)).join(""))}
              </select></label
            >
            <button
              type="button"
              class="sm ghost icon-only"
              data-imp="partDel"
              data-i="${i}"
              title="${t("removePart")}"
              aria-label="${t("removePart")}"
              ${raw(this.parts.length <= 2 ? "disabled" : "")}
            >
              ${raw(icon("x"))}
            </button>
          </div>`,
      )
      .join("");
    const ok = Math.abs(left) < 0.005;
    return html`<div class="split-head">
        <b>${t("splitTitle")}</b><span class="small muted">${formatDate(r.date)} · ${r.description} · ${formatAmount(total)} €</span>
      </div>
      ${raw(parts)}
      <div class="split-foot">
        <button type="button" class="sm ghost" data-imp="partAdd">${raw(icon("plus"))}${t("addPart")}</button>
        <span class="pill ${ok ? "ok" : "warn"}"
          >${raw(icon(ok ? "check" : "alert"))}${fmt("partsTotal", { s: formatAmount(sum), l: formatAmount(left) })}</span
        ><span class="grow"></span> <button type="button" class="sm ghost" data-imp="fixCancel">${t("cancel")}</button
        ><button type="button" class="sm primary" data-imp="splitSave" data-tx="${r.txId}" ${raw(ok ? "" : "disabled")}>
          ${t("saveSplit")}
        </button>
      </div>`;
  }

  private stagedRow(txId: string): LedgerRow | undefined {
    return this.flow.data().preview.rows.find((r) => r.txId === txId);
  }

  private commit(): void {
    const st = this.flow.staging;
    let res: ReturnType<typeof st.commit> | undefined;
    this.session.change((p) => {
      res = st.commit(p);
    });
    if (!res) return;
    this.flow.lateDecided = false;
    // the imported rows are the project's now: the next import starts its Luokittelu list afresh
    this.flow.clearClassified();
    this.lastSaved = null;
    this.classifiedLimit = PAGE;
    this.flow.touch();
    const r = res;
    showToast(
      fmt("toastTitle", { n: formatCount(r.rows) }),
      [
        fmt("toastFiles", { n: r.files }),
        r.fixes ? fmt("toastFixes", { n: r.fixes }) : "",
        r.late ? fmt("toastLate", { n: r.late }) : "",
        r.duplicatesLeftOut ? fmt("toastDups", { n: r.duplicatesLeftOut }) : "",
        t("toastUpdated"),
      ]
        .filter(Boolean)
        .join(" · "),
      { href: "#/rows", label: t("toastShowRows") },
    );
    location.hash = "#/overview";
  }

  // ---- events

  private async onClick(e: Event): Promise<void> {
    const el = e.target as HTMLElement;
    const q = el.closest<HTMLButtonElement>("button[data-quick]");
    if (q) {
      this.quick = q.dataset.quick as Quick;
      this.limit = PAGE;
      this.redraw();
      return;
    }
    const a = el.closest<HTMLAnchorElement>('a[href^="#late"], a[href^="#orphans"], a[href^="#dups"], a[href^="#invalid"]');
    if (a) {
      e.preventDefault();
      this.root.querySelector(a.getAttribute("href")!)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const b = el.closest<HTMLButtonElement>("button[data-imp]");
    if (!b || b.disabled) return;
    const p = this.project;
    const st = this.flow.staging;
    switch (b.dataset.imp) {
      case "choose": {
        const files = await pickWithInput(ACCEPT, true);
        await this.addFiles(files);
        break;
      }
      case "removeFile":
        st.remove(p, Number(b.dataset.key));
        this.rerender();
        break;
      case "guess":
        this.editor?.ed.guess();
        this.redraw();
        break;
      // the reading settings' editor (a drawer): open, Käytä, Peruuta
      case "readingOpen":
        this.editor?.ed.openReading();
        this.redraw();
        this.root.querySelector<HTMLElement>(".drawer")?.focus();
        break;
      case "readingApply":
        this.editor?.ed.applyReading();
        this.redraw();
        this.focusReadingOpener();
        break;
      case "readingCancel":
        this.cancelReading();
        break;
      case "dropMissing":
        this.editor?.ed.dropMissing();
        this.redraw();
        break;
      case "saveProfile":
        this.saveEditor();
        break;
      case "ruleOpen":
        this.openRule(b.dataset.g ?? "", b.dataset.id ?? "");
        break;
      case "ruleEdit":
        this.editRule(b.dataset.g ?? "", b.dataset.id ?? "");
        break;
      case "lateAdd":
      case "lateSkip": {
        const all = b.dataset.imp === "lateSkip";
        const boxes = [...this.root.querySelectorAll<HTMLInputElement>("input[data-late]")];
        const stored = { add: new Set<string>(), skip: [] as string[] };
        for (const x of boxes) {
          const [kind, id] = (x.dataset.late ?? "").split(":") as ["s" | "p", string];
          const add = !all && x.checked;
          if (kind === "s") {
            if (add) st.skipLate.delete(id);
            else st.skipLate.add(id);
          } else if (add) stored.add.add(id);
          else stored.skip.push(id);
        }
        this.flow.lateDecided = true;
        if (stored.add.size || stored.skip.length) {
          this.session.change((proj) => {
            if (stored.add.size) acceptLate(proj, stored.add);
            if (stored.skip.length) ignoreLate(proj, stored.skip);
          });
        }
        this.rerender();
        break;
      }
      case "dropInvalid": {
        const tx = b.dataset.tx ?? "";
        this.session.change((proj) => dropInvalid(proj, [tx]));
        break;
      }
      case "delFix":
        if (!(await ask(t("confirmDeleteFix"), { ok: t("remove"), danger: true }))) return;
        this.session.change((proj) => deleteFix(proj, b.dataset.id ?? ""));
        break;
      case "dupKeep":
      case "dupDrop": {
        const g = this.flow.data().review?.duplicateGroups[Number(b.dataset.i)];
        if (!g) return;
        const newest = [...g].sort((x, y) => y.sourceFile.localeCompare(x.sourceFile))[0]!;
        this.session.change((proj) => decideDuplicates(proj, g, b.dataset.imp === "dupDrop" ? new Set([newest.txId]) : new Set()));
        break;
      }
      case "allFiles":
        this.allFiles = !this.allFiles;
        this.redraw();
        break;
      case "moreRows": {
        const before = this.root.querySelectorAll("table.fix-table tbody > tr").length;
        this.limit += PAGE;
        this.redraw();
        refocusShowMore(this.root, '[data-imp="moreRows"]', "table.fix-table", before);
        break;
      }
      case "moreGroups": {
        const before = this.root.querySelectorAll("table.waiting-groups tbody > tr").length;
        this.groupLimit += PAGE;
        this.redraw();
        refocusShowMore(this.root, '[data-imp="moreGroups"]', "table.waiting-groups", before);
        break;
      }
      case "moreClassified": {
        const before = this.root.querySelectorAll("table.done-groups tbody > tr").length;
        this.classifiedLimit += PAGE;
        this.redraw();
        refocusShowMore(this.root, '[data-imp="moreClassified"]', "table.done-groups", before);
        break;
      }
      case "fixOpen":
      case "splitOpen": {
        const tx = b.dataset.tx ?? "";
        const r = this.stagedRow(tx);
        if (!r) return;
        this.fixFor = { txId: tx, mode: b.dataset.imp === "splitOpen" ? "split" : "fix" };
        const half = Math.round((r.amountOriginal / 2) * 100) / 100;
        this.parts = [
          { amount: half, class: r.class || "menot", category: r.category, subCategory: r.subCategory },
          { amount: Math.round((r.amountOriginal - half) * 100) / 100, class: r.class || "menot", category: "", subCategory: "" },
        ];
        this.redraw();
        break;
      }
      case "fixCancel":
        this.fixFor = null;
        this.redraw();
        break;
      case "fixSave": {
        const form = this.root.querySelector<HTMLElement>("[data-fix-form]");
        if (!form) return;
        const cls = form.querySelector<HTMLSelectElement>("[data-fixf=class]")!.value;
        const main = form.querySelector<HTMLInputElement>('[data-combo="main"] input')!.value.trim();
        const sub = form.querySelector<HTMLInputElement>('[data-combo="sub"] input')!.value.trim();
        st.setFix({ id: `k-${Date.now().toString(36)}`, txId: b.dataset.tx ?? "", class: cls, category: main, subCategory: sub });
        this.fixFor = null;
        this.rerender();
        break;
      }
      case "splitSave":
        st.setFix({
          id: `k-${Date.now().toString(36)}`,
          txId: b.dataset.tx ?? "",
          parts: this.parts.map((x) => ({ ...x, ...(x.owner ? {} : { owner: undefined }) })),
        });
        this.fixFor = null;
        this.rerender();
        break;
      case "partAdd":
        this.parts.push({ amount: 0, class: this.parts[0]?.class ?? "menot", category: "", subCategory: "" });
        this.redraw();
        break;
      case "partDel":
        this.parts.splice(Number(b.dataset.i), 1);
        this.redraw();
        break;
      case "unfix": {
        const f = st.fixes.find((x) => x.txId === b.dataset.tx);
        if (f) st.removeFix(f.id);
        this.rerender();
        break;
      }
      case "commit":
        this.commit();
        break;
    }
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const ed = this.editor?.ed;
    if (ed && el.dataset.pf) {
      if (el.dataset.pf === "use") {
        ed.use(el.value);
        this.redraw();
        return;
      }
      const reread = ed.setField(el.dataset.pf, el.value);
      if (reread) ed.reload();
      this.redraw();
      return;
    }
    if (ed && el.dataset.roleCol !== undefined) {
      // a role chosen on a column of the file
      ed.setRole(el.dataset.roleCol, el.value as Role);
      this.redraw();
      return;
    }
    if (el.dataset.ownerAcc) {
      // stored on import; until then only the choice is kept
      this.flow.staging.accountOwners[el.dataset.ownerAcc] = el.value;
      return;
    }
    if (el.dataset.keepdup) {
      const st = this.flow.staging;
      if ((el as HTMLInputElement).checked) st.keepDuplicates.add(el.dataset.keepdup);
      else st.keepDuplicates.delete(el.dataset.keepdup);
      this.rerender();
      return;
    }
    if (el.dataset.pfile !== undefined) {
      this.fileFilter = el.value;
      this.redraw();
      return;
    }
    if (el.dataset.partf) {
      const part = this.parts[Number(el.dataset.i)];
      if (!part) return;
      const k = el.dataset.partf;
      if (k === "amount") part.amount = parseNumber(el.value) || 0;
      else if (k === "class") part.class = el.value;
      else if (k === "owner") part.owner = el.value || undefined;
      this.redraw();
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.dataset.fq !== undefined) {
      this.fileQuery = el.value;
      this.showFiles();
      return;
    }
    if (el.dataset.pq !== undefined) {
      this.search = el.value;
      this.limit = PAGE;
      const pos = el.selectionStart;
      this.redraw();
      const again = this.root.querySelector<HTMLInputElement>("[data-pq]");
      again?.focus();
      if (pos !== null) again?.setSelectionRange(pos, pos);
      return;
    }
    if (el.dataset.gq !== undefined) {
      this.groupQuery = el.value;
      this.groupLimit = PAGE;
      const pos = el.selectionStart;
      this.redraw();
      const again = this.root.querySelector<HTMLInputElement>("[data-gq]");
      again?.focus();
      if (pos !== null) again?.setSelectionRange(pos, pos);
      return;
    }
    const ed = this.editor?.ed;
    if (ed && el.dataset.pf && el.type !== "number" && el.type !== "date") {
      ed.setField(el.dataset.pf, el.value);
      this.refreshEditorPreview();
      // typing in the reading settings' editor: its result line follows at once (the rest on leaving the field)
      const result = this.root.querySelector<HTMLElement>(".drawer [data-reading-result]");
      if (result) result.innerHTML = ed.readingResult();
    }
  }

  private refreshEditorPreview(): void {
    const ed = this.editor?.ed;
    const box = this.root.querySelector<HTMLElement>("[data-preview]");
    if (!ed || !box) return;
    const p = this.project;
    box.innerHTML = ed.previewCard(p.getSettings().defaultOwner);
    const problem = ed.problem();
    const pr = this.root.querySelector("[data-problem]");
    if (pr) pr.textContent = problem;
    const save = this.root.querySelector<HTMLButtonElement>('[data-imp="saveProfile"]');
    if (save) save.disabled = problem !== "";
  }
}

/** Imported files shown before "show all". */
const RECENT_FILES = 10;

const QUICK_LABEL: Record<Quick, TextKey> = { all: "quickAllRows", fixed: "quickFixed", dup: "quickDuplicates", late: "quickLate" };
