// Projekti: the open project file (save as, download, close), key numbers, members, source files,
// the lock and recalculating locked months.
import { ask, askText } from "../ui/dialog";
import { slugName, type Session } from "../app/session";
import { isEmptyDiff, type LedgerDiff } from "../engine/diff";
import { previousMonth } from "../engine/lock";
import { applyRefresh, members, planRefresh, previewLock, renameMember, saveDraft, setLock, type RefreshPlan } from "../project/service";
import { canSaveInPlace, EXTENSION, projectFileName } from "../storage/projectFile";
import { renderDiff } from "../ui/diffView";
import { formatCount } from "../ui/format";
import { html, raw } from "../ui/html";
import { icon } from "../ui/icons";
import { PeriodPicker } from "../ui/periodPicker";
import { fmt, locale, plural, t } from "../ui/texts";

function backupName(fileName: string, now = new Date()): string {
  const base = (fileName || "fire").replace(EXTENSION, "").replace(/\.sqlite$/, "");
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `${base}-backup-${stamp}${EXTENSION}`;
}

/** `2024-10` as `10/2024`. */
const mmyyyy = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/** Files listed before "Näytä kaikki", newest first (as on Tuonti › Tiedostot). */
const RECENT_FILES = 10;

export class ProjectScreen {
  private showInfo = false;
  private allFiles = false;
  private pendingLock: { revision: number; month: string; diff: LedgerDiff } | null = null;
  private pendingRefresh: { revision: number; plan: RefreshPlan; backedUp: boolean } | null = null;
  private readonly lockPicker: PeriodPicker;
  private readonly refreshPicker: PeriodPicker;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: Session,
    /** Number of added files that are not imported yet (they are lost when the project closes). */
    private readonly stagedFiles: () => number = () => 0,
    /** Unsaved Settings edits: a warning for the close dialog, and a way back to them when the user cancels. */
    private readonly settingsEdits: { unsavedNote(): string | undefined; showEdits(): void } = {
      unsavedNote: () => undefined,
      showEdits: () => {},
    },
  ) {
    const first = () => this.monthRange()[0];
    const last = () => this.monthRange()[1];
    this.lockPicker = new PeriodPicker({ mode: "month", quick: ["month", "prevMonth"], first, last, onChange: () => this.render() });
    this.refreshPicker = new PeriodPicker({ mode: "range", quick: ["all", "12", "prev"], first, last, onChange: () => this.render() });
    root.addEventListener("click", (e) => this.onClick(e));
    root.addEventListener("change", (e) => this.onChange(e));
  }

  /** First and last month with actual rows (this month when there are none). Target rows run into the future, so they do not count. */
  private monthRange(): [string, string] {
    const p = this.session.state.project;
    const months = p
      ? p
          .getLedger()
          .filter((r) => r.rowType === "Actual")
          .map((r) => r.month)
          .filter(Boolean)
          .sort()
      : [];
    const now = previousMonth(new Date());
    return [months[0] ?? now, months.at(-1) ?? now];
  }

  render(): void {
    const s = this.session.state;
    const p = s.project;
    if (!p) {
      this.root.innerHTML = "";
      return;
    }
    const [first, last] = this.monthRange();
    const locked = p.getSettings().lockedThrough;
    if (!this.lockPicker.to) this.lockPicker.set(locked || last, locked || last);
    if (!this.refreshPicker.to) this.refreshPicker.set(first, locked || last);
    this.root.innerHTML = html` <div class="page-head">
        <div><h1>${t("navProject")}</h1></div>
      </div>
      <div class="grid g-hero">${raw(this.fileCard())}${raw(this.stats())}</div>
      <div class="grid g-2 project-tools">${raw(this.lockCard(locked))}${raw(this.refreshCard())}</div>
      <div class="section-label">${t("membersTitle")}</div>
      ${raw(this.membersCard())}
      <div class="section-label">${t("sourceFilesTitle")}</div>
      ${raw(this.filesCard())}`;
    this.lockPicker.mount(this.root.querySelector<HTMLElement>("[data-lock-picker]"));
    this.refreshPicker.mount(this.root.querySelector<HTMLElement>("[data-refresh-picker]"));
  }

  /** The project's file name, or the name Save will suggest for a project never saved. */
  private fileName(): string {
    const s = this.session.state;
    return s.fileName || projectFileName(slugName(s.project!.getSettings().projectName) || "fire");
  }

  /** Where the project file is, worded for what this browser can do. */
  private where(): string {
    const s = this.session.state;
    const file = this.fileName();
    if (s.linked) return fmt("whereLinked", { file });
    if (!s.fileName) return fmt(canSaveInPlace() ? "whereNeverPick" : "whereNeverDownload", { file });
    if (!canSaveInPlace()) return fmt("whereDownload", { browser: browserName() || t("thisBrowser"), file });
    return fmt("whereUnlinked", { file });
  }

  /** What closing does to the file, plus a warning about unsaved changes. */
  private closeText(): string {
    const s = this.session.state;
    const file = this.fileName();
    const base = !s.fileName
      ? t("closeWhereNever")
      : s.linked || canSaveInPlace()
        ? fmt("closeWhereLinked", { file })
        : fmt("closeWhereDownload", { file });
    return s.dirty && s.fileName ? `${base} ${t("closeLosesChanges")}` : base;
  }

  private fileCard(): string {
    const s = this.session.state;
    const p = s.project!;
    const name = s.fileName || p.getSettings().projectName || t("unsavedProject");
    const note = s.sample ? t("projectSampleNote") : canSaveInPlace() ? t("projectWorkingCopy") : t("projectWorkingCopyDownload");
    const state = s.sample ? t("sampleNoSave") : s.dirty ? t("stateDirty") : s.fileName ? t("stateSaved") : t("stateNeverSaved");
    const buttons = s.sample
      ? html`<button type="button" class="ghost danger" data-a="close">${t("closeProject")}</button>`
      : html`${raw(canSaveInPlace() ? html`<button type="button" data-a="saveAs">${t("saveAs")}</button>` : "")}
          <button type="button" class="ghost" data-a="download">${raw(icon("download"))}${t("downloadCopy")}</button>
          <button type="button" class="ghost danger" data-a="close">${t("closeProject")}</button>`;
    const info = s.sample
      ? ""
      : html`<button
          type="button"
          class="sm ghost icon-only info-btn"
          data-a="info"
          aria-expanded="${String(this.showInfo)}"
          title="${t("whereInfo")}"
          aria-label="${t("whereInfo")}"
        >
          ${raw(icon("info"))}
        </button>`;
    const panel =
      this.showInfo && !s.sample
        ? html`<div class="file-info">
            <b>${t("whereInfo")}</b>
            <p>${this.where()}</p>
            <p class="muted">${t("wherePath")}</p>
            <p class="muted">${t("whereWorkingCopy")}</p>
          </div>`
        : "";
    return html`<section class="card">
      <div class="file-head">
        <div class="brand-mark big">${raw(icon("project"))}</div>
        <div class="grow">
          <h3>${name}</h3>
          <span class="small"><span class="dot ${s.dirty ? "warn" : "ok"}"></span>${state}</span>
        </div>
        ${raw(info)}
      </div>
      ${raw(panel)}
      <p class="small muted">${note}</p>
      <div class="actions">${raw(buttons)}</div>
      ${raw(s.sample ? "" : html`<p class="small muted close-note">${this.closeText()}</p>`)}
    </section>`;
  }

  private stats(): string {
    const c = this.session.state.project!.counts();
    const tile = (label: string, v: number) =>
      html`<div class="tile">
        <div class="t">${label}</div>
        <div class="v">${formatCount(v)}</div>
      </div>`;
    return html`<section class="card">
      <div class="grid g-2 stat-grid">
        ${raw(tile(t("statFiles"), c.sourceFiles))}${raw(tile(t("statRawRows"), c.rawRows))}
        ${raw(tile(t("statLedger"), c.ledgerRows))}${raw(tile(t("statRules"), c.rules))}
      </div>
    </section>`;
  }

  private membersCard(): string {
    const p = this.session.state.project!;
    const def = p.getSettings().defaultOwner;
    const ledger = p.getLedger();
    const splits = p.getSplits();
    const targets = p.getTargets();
    const fixes = p.getFixes();
    const accountOwners = p.getSettings().accountOwners;
    const rows = members(p)
      .map((m) => {
        const nS = splits.filter((x) => x.owner === m).length;
        const nT = targets.filter((x) => x.owner === m).length;
        const nF = fixes.filter((f) => f.owner === m || f.parts?.some((x) => x.owner === m)).length;
        const nA = Object.values(accountOwners).filter((o) => o === m).length;
        const used = [
          nA ? fmt("memberUseAccounts", { n: nA }) : "",
          nS ? fmt("memberUseSplits", { n: nS }) : "",
          nT ? fmt("memberUseTargets", { n: nT }) : "",
          nF ? fmt("memberUseFixes", { n: nF }) : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const nRows = ledger.filter((r) => r.owner === m).length;
        const isDef = m === def;
        const inUse = nA + nS + nT + nF > 0;
        const remove = isDef
          ? html`<button type="button" class="sm ghost" disabled title="${t("memberRemoveDefault")}">${t("memberRemove")}</button>`
          : html`<button
              type="button"
              class="sm ghost danger"
              data-a="removeMember"
              data-m="${m}"
              ${raw(inUse ? html`disabled title="${t("memberRemoveUsed")}"` : "")}
            >
              ${t("memberRemove")}
            </button>`;
        return html`<tr>
          <td><input value="${m}" data-member="${m}" aria-label="${t("memberNameAria")}" /></td>
          <td>
            ${raw(isDef ? html`<span class="pill accent">${t("memberDefault")}</span>` : html`<button type="button" class="sm ghost" data-a="makeDefault" data-m="${m}">${t("memberMakeDefault")}</button>`)}
          </td>
          <td class="num">${formatCount(nRows)}</td>
          <td class="small muted">${used}</td>
          <td class="num">${raw(remove)}</td>
        </tr>`;
      })
      .join("");
    return html`<section class="card flush">
      <div class="table-wrap">
        <table class="members">
          <thead>
            <tr>
              <th>${t("memberName")}</th>
              <th>${t("memberRole")}</th>
              <th class="num">${t("memberRows")}</th>
              <th>${t("memberUsed")}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${raw(rows)}
          </tbody>
        </table>
      </div>
      <div class="actions card-foot">
        <button type="button" class="sm primary" data-a="addMember">${raw(icon("plus"))}${t("memberAdd")}</button
        ><span class="small muted">${t("membersBody")}</span>
      </div>
    </section>`;
  }

  private filesCard(): string {
    const p = this.session.state.project!;
    const files = p.getSourceFiles();
    if (files.length === 0) {
      return html`<section class="card">
        <p class="muted">${t("noFilesYet")} <a href="#/import/files">${t("importFilesLink")}</a></p>
      </section>`;
    }
    const profiles = new Map(p.getProfiles().map((x) => [x.id, x.name]));
    const date = new Intl.DateTimeFormat(locale(), { dateStyle: "short" });
    const shown = [...files].reverse().slice(0, this.allFiles ? undefined : RECENT_FILES);
    const rows = shown
      .map(
        (f) =>
          html`<tr>
            <td><span class="mono">${f.name}</span></td>
            <td>${profiles.get(f.profileId) ?? f.profileId}</td>
            <td class="num">${formatCount(f.rowCount)}</td>
            <td>${date.format(new Date(f.importedAt))}</td>
          </tr>`,
      )
      .join("");
    return html`<section class="card flush">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("colFile")}</th>
              <th>${t("colProfile")}</th>
              <th class="num">${t("colRows")}</th>
              <th>${t("colImported")}</th>
            </tr>
          </thead>
          <tbody>
            ${raw(rows)}
          </tbody>
        </table>
      </div>
      ${raw(
        files.length > RECENT_FILES
          ? html`<div class="actions card-foot">
              <span class="grow"></span>
              <button type="button" class="sm" data-a="allFiles">
                ${this.allFiles ? t("filesShowRecent") : fmt("filesShowAll", { n: files.length })}
              </button>
            </div>`
          : "",
      )}
    </section>`;
  }

  private lockCard(locked: string): string {
    const s = this.session.state;
    const pending = this.pendingLock?.revision === s.revision ? this.pendingLock : null;
    const box = pending
      ? html`<div class="confirm-box">
          <h3>${pending.month ? fmt("lockConfirmTitle", { m: mmyyyy(pending.month) }) : t("unlockConfirmTitle")}</h3>
          ${raw(renderDiff(pending.diff))}
          <div class="actions">
            <button type="button" class="primary" data-a="lockConfirm">${t("applyChanges")}</button>
            <button type="button" class="ghost" data-a="lockCancel">${t("cancel")}</button>
          </div>
        </div>`
      : "";
    return html`<section class="card">
      <div class="card-head">
        <h3>${t("lockTitle")}</h3>
        <span class="pill">${raw(icon("lock"))}${locked ? fmt("lockedThroughPill", { m: mmyyyy(locked) }) : t("nothingLockedPill")}</span>
      </div>
      <p class="small muted">${t("lockBodyNew")}</p>
      <div class="actions">
        <span>${t("lockThrough")}</span>
        <div data-lock-picker></div>
        <button type="button" data-a="lockPreview">${t("lockPreview")}</button>
        ${raw(locked ? html`<button type="button" class="ghost" data-a="unlock">${t("unlockAllButton")}</button>` : "")}
      </div>
      ${raw(box)}
    </section>`;
  }

  private refreshCard(): string {
    const s = this.session.state;
    const pending = this.pendingRefresh?.revision === s.revision ? this.pendingRefresh : null;
    let box = "";
    if (pending) {
      const plan = pending.plan;
      const title = fmt("refreshPlanPeriod", { from: mmyyyy(plan.from), to: mmyyyy(plan.to) });
      const buttons = isEmptyDiff(plan.diff)
        ? html`<div class="actions"><button type="button" class="ghost" data-a="refreshCancel">${t("close")}</button></div>`
        : html`<p class="small muted">${t("backupNote")}</p>
            <div class="actions">
              ${raw(s.sample ? "" : html`<button type="button" data-a="backup">${raw(icon("download"))}${pending.backedUp ? t("backupDone") : t("backupFirst")}</button>`)}
              <button type="button" class="primary" data-a="refreshApply">${t("applyRefresh")}</button>
              <button type="button" class="ghost" data-a="refreshCancel">${t("cancel")}</button>
            </div>`;
      box = html`<div class="confirm-box">
        <h3>${title}</h3>
        ${raw(renderDiff(plan.diff))}${raw(buttons)}
      </div>`;
    }
    return html`<section class="card">
      <div class="card-head"><h3>${t("refreshTitleNew")}</h3></div>
      <p class="small muted">${t("refreshBodyNew")}</p>
      <div class="actions">
        <div data-refresh-picker></div>
        <button type="button" data-a="refreshPlan">${raw(icon("refresh"))}${t("refreshPreview")}</button>
      </div>
      ${raw(box)}
    </section>`;
  }

  private moveLock(month: string): void {
    const p = this.session.state.project;
    if (!p) return;
    // Always confirm: the button says "preview", so it must not lock on its own.
    this.pendingLock = { revision: this.session.state.revision, month, diff: previewLock(p, month) };
    this.render();
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement;
    const from = el.dataset.member;
    if (from === undefined) return;
    const to = el.value.trim();
    if (!to || to === from) {
      el.value = from;
      return;
    }
    if (members(this.session.state.project!).includes(to)) {
      el.value = from;
      return;
    }
    this.session.change((p) => renameMember(p, from, to));
  }

  private onClick(e: Event): void {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-a]");
    if (!btn || btn.disabled) return;
    const s = this.session;
    const edits = this.settingsEdits.unsavedNote();
    const guard = () => {
      const staged = this.stagedFiles();
      return ask(`${t("closeAsk")} ${this.closeText()}`, {
        ok: t("closeProject"),
        danger: s.state.dirty || !s.state.fileName || staged > 0 || edits !== undefined,
        note:
          [staged > 0 ? plural(staged, "closeLosesStagedOne", "closeLosesStagedMany") : "", edits ?? ""].filter(Boolean).join(" ") ||
          undefined,
      });
    };
    switch (btn.dataset.a) {
      case "allFiles":
        this.allFiles = !this.allFiles;
        this.render();
        break;
      case "info":
        this.showInfo = !this.showInfo;
        this.render();
        break;
      case "saveAs":
        void s.saveAs();
        break;
      case "download":
        s.download();
        break;
      case "close":
        void (
          s.state.sample ? ask(t("confirmLeaveSample"), { ok: t("closeProject"), danger: edits !== undefined, note: edits }) : guard()
        ).then(async (yes) => {
          if (!yes) return this.settingsEdits.showEdits();
          await s.close();
          location.hash = "#/";
        });
        break;
      case "makeDefault": {
        const m = btn.dataset.m ?? "";
        s.change((p) => saveDraft(p, { defaultOwner: m }));
        break;
      }
      case "addMember": {
        void askText(t("memberAddPrompt")).then((name) => {
          const p = s.state.project;
          if (!name || !p || members(p).includes(name)) return;
          s.change((proj) => proj.setSettings({ members: [...proj.getSettings().members, name] }));
        });
        break;
      }
      case "removeMember": {
        const m = btn.dataset.m ?? "";
        s.change((p) => p.setSettings({ members: p.getSettings().members.filter((x) => x !== m) }));
        break;
      }
      case "lockPreview":
        this.moveLock(this.lockPicker.to);
        break;
      case "unlock":
        this.moveLock("");
        break;
      case "lockConfirm": {
        if (this.pendingLock?.revision !== s.state.revision) return;
        const month = this.pendingLock.month;
        this.pendingLock = null;
        s.change((p) => setLock(p, month));
        break;
      }
      case "lockCancel":
        this.pendingLock = null;
        this.render();
        break;
      case "refreshPlan": {
        const p = s.state.project;
        if (!p) return;
        this.pendingRefresh = {
          revision: s.state.revision,
          plan: planRefresh(p, this.refreshPicker.from, this.refreshPicker.to),
          backedUp: false,
        };
        this.render();
        break;
      }
      case "backup":
        if (!this.pendingRefresh) return;
        s.download(backupName(s.state.fileName));
        this.pendingRefresh.backedUp = true;
        this.render();
        break;
      case "refreshApply": {
        if (this.pendingRefresh?.revision !== s.state.revision) return;
        const plan = this.pendingRefresh.plan;
        this.pendingRefresh = null;
        s.change((p) => applyRefresh(p, plan));
        break;
      }
      case "refreshCancel":
        this.pendingRefresh = null;
        this.render();
        break;
    }
  }
}

/** The browser's name, for wording only; what it can do is detected from its features. */
function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "";
}
