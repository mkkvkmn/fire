// Migration from v2 (part of the welcome screen): says exactly which files are read and what each
// becomes, takes the v2 settings that live in .env (never read), reads the picked folder, shows the
// result and the comparison with v2's final_data.csv, and says what happens next.
import type { Session } from "../app/session";
import { previousMonth } from "../engine/lock";
import {
  findV2Files,
  isV2Path,
  pickRoots,
  v2Roots,
  type MigrateResult,
  type ParityCause,
  type ParityTotal,
  type PickedFile,
  type V2Found,
} from "../project/migrate";
import type { Project } from "../storage/project";
import { formatAmount, formatCount } from "../ui/format";
import { html, raw } from "../ui/html";
import { icon } from "../ui/icons";
import { fmt, t, type TextKey } from "../ui/texts";

interface Pending {
  project: Project;
  result: MigrateResult;
}

const ROLES: [string, TextKey, TextKey][] = [
  ["config/source_file_reader/*.yml", "migRoleProfiles", "migRoleProfilesWhat"],
  ["config/data_processing/categories.csv", "migRoleRules", "migRoleRulesWhat"],
  ["config/data_processing/splits.csv", "migRoleSplits", "migRoleSplitsWhat"],
  ["config/data_processing/targets.csv", "migRoleTargets", "migRoleTargetsWhat"],
  ["config/data_processing/fixes.csv", "migRoleFixes", "migRoleFixesWhat"],
  ["data/source_files/*", "migRoleSources", "migRoleSourcesWhat"],
  ["data/source_files/for_preprocessors/nordnet/nordnet_salkkuraportti.csv", "migRoleNordnet", "migRoleNordnetWhat"],
  ["data/final/final_data.csv", "migRoleFinal", "migRoleFinalWhat"],
];

export class MigrateView {
  private files: PickedFile[] = [];
  /** Files in the picked folders that were not opened. */
  private skipped = 0;
  /** Config and data folders found; when either has several, the user picks one of each. */
  private roots: { configs: string[]; datas: string[] } = {
    configs: [],
    datas: [],
  };
  private chosen = { config: "", data: "" };
  private found: V2Found | null = null;
  private pending: Pending | null = null;
  private opts = {
    projectName: "",
    defaultOwner: "mkk",
    useTargets: true,
    useNordnet: true,
    lock: true,
  };

  /** True while the move runs; the message of the last failed run. */
  private running = false;
  /** A setting changed after the move ran, so the result no longer matches it. */
  private stale = false;
  private error = "";

  constructor(
    private readonly session: Session,
    private readonly back: () => void,
    private readonly refresh: () => void,
  ) {}

  render(): string {
    if (!this.opts.projectName) this.opts.projectName = t("migDefaultName");
    const f = this.found;
    const ready = !!f && f.profiles.length > 0 && f.sources.length > 0 && (!this.several() || (!!this.chosen.config && !!this.chosen.data));
    const roleCell = (i: number) => {
      if (!f) return "";
      const n = [
        f.profiles.length,
        f.categories ? 1 : 0,
        f.splits ? 1 : 0,
        f.targets ? 1 : 0,
        f.fixes ? 1 : 0,
        f.sources.length,
        f.nordnetRaw ? 1 : 0,
        f.finalData ? 1 : 0,
      ][i]!;
      return n > 0
        ? html`<span class="pill ok">${raw(icon("check"))}${i === 0 || i === 5 ? fmt("migNFiles", { n }) : t("migFound")}</span>`
        : html`<span class="pill">${t("migNotFound")}</span>`;
    };
    const roles = ROLES.map(
      ([path, what, becomes], i) =>
        html`<tr>
          <td class="mono small">${path}</td>
          <td>
            <b>${t(what)}</b>
            <div class="small muted">${t(becomes)}</div>
          </td>
          <td>${raw(roleCell(i))}</td>
        </tr>`,
    ).join("");
    const o = this.opts;
    const check = (key: "useTargets" | "useNordnet" | "lock", label: string, hint: string) =>
      html`<label class="check-row"
        ><input type="checkbox" data-mig="${key}" ${raw(o[key] ? "checked" : "")} /><span
          ><b>${label}</b><span class="small muted">${hint}</span></span
        ></label
      >`;
    return html` <div class="edit-head">
        <button type="button" class="sm ghost" data-mig="back">${raw(icon("arrowL"))}${t("back")}</button>
      </div>
      <section class="welcome-hero">
        <h1>${t("migTitle")}</h1>
        <p class="lead">${t("migLead")}</p>
      </section>

      <div class="section-label">${t("migStep1")}</div>
      <section class="card flush">
        <div class="table-wrap">
          <table class="mig-roles">
            <thead>
              <tr>
                <th>${t("migColPath")}</th>
                <th>${t("migColBecomes")}</th>
                <th>${t("migColFound")}</th>
              </tr>
            </thead>
            <tbody>
              ${raw(roles)}
            </tbody>
          </table>
        </div>
        <div class="card-foot small muted">${raw(icon("shield"))} ${t("migNotRead")} ${raw(codeRef())}</div>
      </section>

      <div class="section-label">${t("migStep2")}</div>
      <section class="card">
        <div class="grid g-2">
          <label class="field">${t("projectNameLabel")}<input data-mig="projectName" value="${o.projectName}" /></label>
          <label class="field"
            >${t("migOwner")}<input data-mig="defaultOwner" value="${o.defaultOwner}" /><small>${t("migOwnerHint")}</small></label
          >
        </div>
        <div class="mig-checks">
          ${raw(check("useTargets", t("migUseTargets"), t("migUseTargetsHint")))}${raw(check("useNordnet", t("migUseNordnet"), t("migUseNordnetHint")))}
        </div>
      </section>

      <div class="section-label">${t("migStep3")}</div>
      <section class="card">
        <ol class="mig-after">
          <li>${t("migAfter0")}</li>
          <li>${t("migAfter1")}</li>
          <li>${t("migAfter2")}</li>
          <li>${t("migAfter3")}</li>
          <li>${t("migAfter4")}</li>
          <li>${t("migAfter5")}</li>
        </ol>
      </section>

      <div class="section-label">${t("migStep4")}</div>
      <section class="card">
        <p class="small muted">${t("migPickHint")}</p>
        <div class="note small">
          ${raw(icon("shield"))}
          <div>${t("migUploadNote")} ${raw(codeRef())}</div>
        </div>
        <div class="actions mig-run">
          <button type="button" class="${f ? "" : "primary"}" data-mig="pick">${raw(icon("open"))}${t("migPick")}</button>
          ${raw(f ? html`<button type="button" class="ghost" data-mig="pickMore">${t("migPickMore")}</button><span class="small muted">${fmt("migPicked", { n: formatCount(this.files.length), s: f.skipped })}</span>` : "")}
          <span class="grow"></span>
          ${raw(
            this.pending && !this.stale && !this.running
              ? html`<button type="button" class="primary" data-mig="toResult">${t("migToResult")} ↓</button>`
              : html`<button type="button" class="${f ? "primary" : ""}" data-mig="run" ${raw(ready && !this.running ? "" : "disabled")}>
                  ${raw(this.running ? html`<span class="spinner" aria-hidden="true"></span>` : "")}${this.running ? t("migRunning") : t("migRun")}
                </button>`,
          )}
        </div>
        ${raw(ready && !this.running && !this.pending && !this.error ? this.readyView(f!) : "")}
        ${raw(
          this.pending && !this.stale && !this.running
            ? html`<p class="mig-ready small">
                ${raw(icon("check"))}<span
                  ><b>${t("migDoneTitle")}:</b>
                  ${t(this.pending.result.parity?.differences.length ? "migDoneDiff" : "migDoneOk")}
                  <button type="button" class="link" data-mig="toResult">${t("migToResult")} ↓</button></span
                >
              </p>`
            : "",
        )}
        ${raw(
          this.running
            ? html`<div class="note small">
                ${raw(icon("clock"))}
                <div>${t("migRunningBody")}</div>
              </div>`
            : "",
        )}
        ${raw(
          this.error
            ? html`<div class="note err small">
                ${raw(icon("alert"))}
                <div>
                  <b>${t("migFailedTitle")}</b>
                  <div>${this.error}</div>
                  <div class="muted">${t("migFailedHelp")}</div>
                </div>
              </div>`
            : "",
        )}
        ${raw(this.copiesView())}
        ${raw(
          f && !this.several() && (!f.profiles.length || !f.sources.length)
            ? html`<div class="note warn small">
                ${raw(icon("alert"))}
                <div>${t("migMissing")}</div>
              </div>`
            : "",
        )}
      </section>

      ${raw(this.pending ? this.resultView(this.pending.result) : "")}
      ${raw(
        this.pending
          ? html`<section class="card mig-open">
              ${raw(check("lock", fmt("migLock", { m: `${previousMonth(new Date()).slice(5, 7)}/${previousMonth(new Date()).slice(0, 4)}` }), t("migLockHint")))}
              <div class="actions">
                <span class="grow"></span><button type="button" class="ghost" data-mig="discard">${t("migDiscard")}</button>
                <button type="button" class="primary" data-mig="open">${t("migOpen")}</button>
              </div>
            </section>`
          : "",
      )}`;
  }

  /** The green "ready" message: what the pick holds, before the move runs. */
  private readyView(f: V2Found): string {
    const extra = [
      f.categories ? t("migReadyRules") : "",
      f.splits ? t("migReadySplits") : "",
      f.targets ? t("migReadyTargets") : "",
      f.fixes ? t("migReadyFixes") : "",
      f.finalData ? t("migReadyFinal") : "",
    ].filter(Boolean);
    return html`<p class="mig-ready small">
      ${raw(icon("check"))}<span
        ><b>${t("migReadyTitle")}:</b>
        ${fmt("migReadyBody", { p: f.profiles.length, s: formatCount(f.sources.length), extra: extra.join(", ") || "-" })}</span
      >
    </p>`;
  }

  private resultView(r: MigrateResult): string {
    const missing = r.files.filter((x) => x.profile === null);
    const par = r.parity;
    // v2 and v3 totals per file; a file only in final_data.csv gets a row of its own
    const totals = new Map((par?.byFile ?? []).map((x) => [x.key, x]));
    const differs = (x: ParityTotal | undefined) => !!x && Math.abs(x.v3 - x.v2) >= 0.01;
    const sums = (name: string) => {
      if (!par) return "";
      const x = totals.get(name);
      return html`<td class="num">${x ? formatAmount(x.v2) : ""}</td>
        <td class="num">${x ? formatAmount(x.v3) : ""}</td>
        <td class="num ${differs(x) ? "bad-text" : "muted"}">${x ? formatAmount(x.v3 - x.v2) : ""}</td>`;
    };
    const onlyV2 = [...totals.keys()].filter((k) => k && !r.files.some((f) => f.name === k));
    const filesDiffer = (par?.byFile ?? []).filter(differs).length;
    const diffFirst = (a: { name: string }, b: { name: string }) =>
      Number(differs(totals.get(b.name))) - Number(differs(totals.get(a.name)));
    const files = [
      ...[...r.files].sort(diffFirst).map(
        (x) =>
          html`<tr class="${x.profile ? "" : "needs"}">
            <td class="mono small">${x.name}</td>
            <td>${x.profile ?? t("migNoProfile")}</td>
            <td class="num">${x.profile ? formatCount(x.rows) : ""}</td>
            ${raw(sums(x.name))}
            <td class="small ${x.problems ? "bad-text" : "muted"}">
              ${x.problems === -1 ? t("migReadFailed") : x.problems ? fmt("problemRows", { n: x.problems }) : ""}
            </td>
          </tr>`,
      ),
      ...onlyV2.map(
        (k) =>
          html`<tr>
            <td class="mono small">${k}</td>
            <td class="muted">${t("migOnlyFinal")}</td>
            <td></td>
            ${raw(sums(k))}
            <td></td>
          </tr>`,
      ),
    ].join("");
    const parity = !par
      ? html`<div class="note small">
          ${raw(icon("alert"))}
          <div>${t("migNoFinal")}</div>
        </div>`
      : par.differences.length === 0
        ? html`<div class="note ok">
            ${raw(icon("check"))}
            <div>
              <b>${t("migParityOk")}</b>
              <div class="small">${fmt("migParityOkBody", { m: par.months, a: formatCount(par.rowsV2), b: formatCount(par.rowsV3) })}</div>
            </div>
          </div>`
        : html`<div class="note warn">
              ${raw(icon("alert"))}
              <div>
                <div class="mig-diff">
                  <div>
                    <div class="t">${t("migDiffRows")}</div>
                    <div class="v">${formatCount(par.causes.reduce((n, c) => n + c.rows, 0))}</div>
                  </div>
                  <div>
                    <div class="t">${t("migDiffSum")}</div>
                    <div class="v">${formatAmount(par.causes.reduce((n, c) => n + Math.abs(c.amount), 0))} €</div>
                  </div>
                </div>
                <div class="small">${t("migParityDiffBody")}</div>
              </div>
            </div>
            <div class="section-label">${t("migCauses")}</div>
            ${raw(causesView(par.causes))} ${raw(classTotalsView(par.byClass))}
            <details class="mig-files">
              <summary>${fmt("migShowMonths", { n: par.differences.length })}</summary>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>${t("colMonth")}</th>
                      <th>${t("fieldClass")}</th>
                      <th class="num">v2</th>
                      <th class="num">v3</th>
                      <th class="num">${t("migDiff")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${raw(
                      par.differences
                        .map(
                          (d) =>
                            html`<tr>
                              <td>${d.month}</td>
                              <td>${d.cls || t("uncategorised")}</td>
                              <td class="num">${formatAmount(d.v2)}</td>
                              <td class="num">${formatAmount(d.v3)}</td>
                              <td class="num bad-text">${formatAmount(d.v3 - d.v2)}</td>
                            </tr>`,
                        )
                        .join(""),
                    )}
                  </tbody>
                </table>
              </div>
            </details>`;
    return html`<div class="section-label" id="mig-result">${t("migResult")}</div>
      <section class="card">
        <div class="grid g-4 stat-grid mig-stats">
          <div class="tile">
            <div class="t">${t("statFiles")}</div>
            <div class="v">${formatCount(r.files.length - missing.length)}</div>
          </div>
          <div class="tile">
            <div class="t">${t("statRules")}</div>
            <div class="v">${formatCount(r.rules)}</div>
          </div>
          <div class="tile">
            <div class="t">${t("splitsTitle")} / ${t("tabTargets")}</div>
            <div class="v">${r.splits} / ${r.targets}</div>
          </div>
          <div class="tile">
            <div class="t">${t("tabFixes")}</div>
            <div class="v">
              ${r.fixesMapped}${raw(r.fixesUnmatched ? html` <span class="small warn-text">(${fmt("migUnmatched", { n: r.fixesUnmatched })})</span>` : "")}
            </div>
          </div>
        </div>
        ${raw(
          missing.length
            ? html`<div class="note warn small">
                ${raw(icon("alert"))}
                <div>${fmt("migFilesNoProfile", { n: missing.length })}</div>
              </div>`
            : "",
        )}
        ${raw(parity)}
        <details class="mig-files">
          <summary>
            ${par?.differences.length ? fmt("migShowByFile", { n: filesDiffer, all: r.files.length }) : fmt("migShowFiles", { n: r.files.length })}
          </summary>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>${t("colFile")}</th>
                  <th>${t("colProfile")}</th>
                  <th class="num">${t("colRows")}</th>
                  ${raw(
                    par
                      ? html`<th class="num">v2</th>
                          <th class="num">v3</th>
                          <th class="num">${t("migDiff")}</th>`
                      : "",
                  )}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${raw(files)}
              </tbody>
            </table>
          </div>
        </details>
      </section>`;
  }

  /** Handles a click inside the view; returns true when it was handled. */
  async onClick(b: HTMLButtonElement): Promise<boolean> {
    switch (b.dataset.mig) {
      case "back":
        this.pending?.project.close();
        this.pending = null;
        this.back();
        return true;
      case "pick":
      case "pickMore": {
        const picked = await pickFolder();
        if (picked.files.length === 0 && picked.skipped === 0) return true;
        const more = b.dataset.mig === "pickMore";
        this.files = more ? [...this.files, ...picked.files] : picked.files;
        this.skipped = (more ? this.skipped : 0) + picked.skipped;
        this.roots = v2Roots(this.files);
        this.chosen = {
          config: this.roots.configs.length === 1 ? this.roots.configs[0]! : "",
          data: this.roots.datas.length === 1 ? this.roots.datas[0]! : "",
        };
        this.refind();
        this.pending?.project.close();
        this.pending = null;
        return true;
      }
      case "run": {
        if (!this.found || this.running) return true;
        this.pending?.project.close();
        this.pending = null;
        this.error = "";
        this.stale = false;
        this.running = true;
        this.refresh();
        // let the "working" state paint before the move blocks the page
        await new Promise((r) => setTimeout(r, 30));
        this.pending = await this.session.migrate(this.found, this.opts);
        this.running = false;
        if (!this.pending) this.error = this.session.state.error || t("migFailed");
        this.opts.lock = (this.pending?.result.parity?.differences.length ?? 1) === 0;
        return true;
      }
      case "toResult":
        // no re-render, so the smooth scroll is not cut short
        document.getElementById("mig-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return false;
      case "discard":
        this.pending?.project.close();
        this.pending = null;
        return true;
      case "open": {
        if (!this.pending) return true;
        const p = this.pending.project;
        this.pending = null;
        await this.session.adopt(p, this.opts.lock ? previousMonth(new Date()) : "");
        location.hash = "#/overview";
        return true;
      }
    }
    return false;
  }

  /** True when the pick holds more than one v2 config or data folder. */
  private several(): boolean {
    return this.roots.configs.length > 1 || this.roots.datas.length > 1;
  }

  /** Sorts the files again, keeping only the chosen copy when there are several. */
  private refind(): void {
    const files = this.several() ? pickRoots(this.files, this.chosen.config, this.chosen.data) : this.files;
    this.found = { ...findV2Files(files), skipped: this.skipped };
    this.pending?.project.close();
    this.pending = null;
  }

  private copiesView(): string {
    if (!this.several()) return "";
    const sel = (key: "config" | "data", list: string[], label: string) =>
      html`<label class="field"
        >${label}<select data-mig="${key}">
          ${raw(
            html`<option value="" ${raw(this.chosen[key] ? "" : "selected")}>${t("migChooseCopy")}</option>` +
              list
                .map(
                  (r) => html`<option value="${r}" ${raw(this.chosen[key] === r ? "selected" : "")}>${r || t("migPickedFolder")}</option>`,
                )
                .join(""),
          )}
        </select></label
      >`;
    return html`<div class="note warn">
      ${raw(icon("alert"))}
      <div>
        <b>${t("migCopiesTitle")}</b>
        <div class="small">${t("migCopiesBody")}</div>
        <div class="grid g-2 mig-copies">
          ${raw(sel("config", this.roots.configs, t("migConfigFolder")))}${raw(sel("data", this.roots.datas, t("migDataFolder")))}
        </div>
      </div>
    </div>`;
  }

  onChange(el: HTMLInputElement): boolean {
    const k = el.dataset.mig;
    if (k === "config" || k === "data") {
      this.chosen[k] = el.value;
      this.refind();
      this.stale = !!this.pending;
      return true;
    }
    if (k === "useTargets" || k === "useNordnet" || k === "lock") {
      this.opts[k] = el.checked;
      if (k !== "lock") this.stale = !!this.pending;
      return k !== "lock";
    }
    if (k === "projectName" || k === "defaultOwner") {
      this.opts[k] = el.value.trim();
      // a new owner changes the result; the run button comes back
      if (k === "defaultOwner" && this.pending) return (this.stale = true);
      return false;
    }
    return false;
  }
}

/** Lets the user pick a folder; opens only its v2 files and counts the rest. */
function pickFolder(): Promise<{ files: PickedFile[]; skipped: number }> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.addEventListener("change", async () => {
      const list = Array.from(input.files ?? []).map((f) => ({
        f,
        path: (f.webkitRelativePath || f.name).replace(/\\/g, "/"),
      }));
      const keep = list.filter((x) => isV2Path(x.path));
      const files = await Promise.all(
        keep.map(async (x) => ({
          path: x.path,
          bytes: new Uint8Array(await x.f.arrayBuffer()),
        })),
      );
      resolve({ files, skipped: list.length - keep.length });
    });
    input.addEventListener("cancel", () => resolve({ files: [], skipped: 0 }));
    input.click();
  });
}

/** The migration code in the public repository, at the commit this site was built from. */
function codeLink(): string {
  const commit = __BUILD_COMMIT__;
  return `https://github.com/mkkvkmn/fire/blob/${commit === "local" ? "main" : commit}/front/src/project/migrate.ts`;
}

/** "Check for yourself what the move reads: <link>." */
function codeRef(): string {
  return fmt("migCodeLink", {
    link: html`<a href="${codeLink()}" target="_blank" rel="noopener noreferrer"
      ><span class="mono">front/src/project/migrate.ts</span></a
    >`,
  });
}

/** The groups of rows that v2 and v3 handle differently, largest first. */
function causesView(causes: ParityCause[]): string {
  if (causes.length === 0) return "";
  const shown = causes.slice(0, 30);
  const rule = (id: string) => id || t("migNoRule");
  const rows = shown
    .map((c) => {
      const kind = t(c.kind === "rule" ? "migKindRule" : c.kind === "v2" ? "migKindV2" : c.kind === "dup" ? "migKindDup" : "migKindV3");
      const rules = c.kind === "rule" ? `${rule(c.v2Rule)} → ${rule(c.v3Rule)}` : c.kind === "v3" ? c.v3Rule : c.v2Rule;
      const missing = c.v2FixUnmatched
        ? html`<div class="bad-text">${fmt("migFixUnmatched", { id: c.v2Rule })}</div>`
        : c.v2Missing
          ? html`<div class="bad-text">${fmt("migRuleMissing", { id: c.v2Rule })}</div>`
          : c.why?.length
            ? c.why
                .map(
                  (w) =>
                    html`<div class="mig-why">
                      ${fmt("migWhy", { field: t(WHY_FIELD[w.field]), pattern: w.pattern })}<br />v2: <b>${w.v2 || "∅"}</b> · v3:
                      <b>${w.v3 || "∅"}</b>
                    </div>`,
                )
                .join("")
            : "";
      const classes = c.kind === "rule" ? `${c.v2Class} → ${c.v3Class}` : c.kind === "v3" ? c.v3Class : c.v2Class;
      return html`<tr>
        <td>${kind}</td>
        <td class="mono small">${rules}${raw(missing)}</td>
        <td class="small">${classes}</td>
        <td class="num">${formatCount(c.rows)}</td>
        <td class="num">${formatAmount(c.amount)}</td>
        <td class="small muted">${c.example}</td>
      </tr>`;
    })
    .join("");
  const dups = causes.filter((c) => c.kind === "dup");
  const dupNote = dups.length
    ? html`<div class="note small">
        ${raw(icon("info"))}
        <div>
          ${fmt("migDupNote", { n: formatCount(dups.reduce((n, c) => n + c.rows, 0)), sum: `${formatAmount(dups.reduce((n, c) => n + c.amount, 0))} €` })}
        </div>
      </div>`
    : "";
  const n = causes.reduce((m, c) => m + c.rows, 0);
  return html`<details class="mig-files">
    <summary>${fmt("migShowRows", { n: formatCount(n) })}</summary>
    <p class="small muted">${t("migCausesHint")}</p>
    ${raw(dupNote)}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("migColCause")}</th>
            <th>${t("migColRules")}</th>
            <th>${t("migColClassification")}</th>
            <th class="num">${t("colRows")}</th>
            <th class="num">${t("colAmount")}</th>
            <th>${t("migColExample")}</th>
          </tr>
        </thead>
        <tbody>
          ${raw(rows)}
        </tbody>
      </table>
    </div>
    ${raw(causes.length > shown.length ? html`<p class="small muted">${fmt("migMoreCauses", { n: causes.length - shown.length })}</p>` : "")}
  </details>`;
}

const WHY_FIELD = {
  account: "migWhyAccount",
  description: "migWhyDescription",
  info: "migWhyInfo",
  amount: "migWhyAmount",
} as const;

/** Totals over all months by classification, where v2 and v3 differ. */
function classTotalsView(byClass: ParityTotal[]): string {
  if (byClass.length === 0) return "";
  const rows = byClass
    .map(
      (r) =>
        html`<tr>
          <td class="small">${r.key}</td>
          <td class="num">${formatAmount(r.v2)}</td>
          <td class="num">${formatAmount(r.v3)}</td>
          <td class="num bad-text">${formatAmount(r.v3 - r.v2)}</td>
        </tr>`,
    )
    .join("");
  return html`<details class="mig-files">
    <summary>${fmt("migShowByClass", { n: byClass.length })}</summary>
    <div class="table-wrap mig-totals">
      <table>
        <thead>
          <tr>
            <th>${t("migColClassification")}</th>
            <th class="num">v2</th>
            <th class="num">v3</th>
            <th class="num">${t("migDiff")}</th>
          </tr>
        </thead>
        <tbody>
          ${raw(rows)}
        </tbody>
      </table>
    </div>
  </details>`;
}
