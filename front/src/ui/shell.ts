// The app shell: sidebar (brand, save, navigation with the open project and the Tuonti steps,
// privacy note, language and version) and the sample-data banner.
import { FLOW_STEPS, type FlowStep } from "../app/importFlow";
import type { SessionState } from "../app/session";
import { html, raw } from "./html";
import { icon, type IconName } from "./icons";
import { getLang, t, type TextKey } from "./texts";

export type Route = "welcome" | "project" | "overview" | "rows" | "import" | "settings";

const REPO_URL = "https://github.com/mkkvkmn/fire";

export function repoLink(): string {
  const commit = __BUILD_COMMIT__;
  return commit === "local" ? REPO_URL : `${REPO_URL}/commit/${commit}`;
}

export const STEP_LABEL: Record<FlowStep, TextKey> = { files: "stepFiles", classify: "stepClassify", fixes: "stepFixes" };

export interface ShellContext {
  route: Route;
  /** The settings tab shown when the address names none (the settings screen keeps its last one). */
  settingsTab?: string;
  step: FlowStep;
  state: SessionState;
  counts: Record<FlowStep, number>;
  /** True while files are staged: the last step is not done before Tuo rivit. */
  staged: boolean;
  /** True when the project has imported rows; before that no step is marked done. */
  hasRows: boolean;
}

function link(route: Route, label: string, ic: IconName, active: boolean, extra = ""): string {
  return html`<a href="#/${route}" class="${active ? "active" : ""}" ${raw(active ? 'aria-current="page"' : "")}
    >${raw(icon(ic))}<span class="lbl">${label}</span>${raw(extra)}</a
  >`;
}

/** State of one flow step: the current one, done (nothing open) or still open. */
export function stepState(step: FlowStep, ctx: ShellContext): "on" | "done" | "" {
  if (ctx.route === "import" && step === ctx.step) return "on";
  if (step === "fixes" && ctx.staged) return "";
  if (!ctx.hasRows && !ctx.staged) return "";
  return ctx.counts[step] === 0 ? "done" : "";
}

function badge(n: number): string {
  return n > 0 ? html`<span class="badge">${n}</span>` : "";
}

/** The settings tabs, in the order of the settings screen. */
const SETTINGS_TABS: [string, TextKey][] = [
  ["rules", "tabRules"],
  ["splits", "tabSplits"],
  ["fixes", "tabFixes"],
  ["targets", "tabTargets"],
  ["profiles", "tabProfiles"],
  ["scripts", "tabScripts"],
];

/** Asetukset opens up into its tabs while it is the page shown. */
function settingsSubs(ctx: ShellContext): string {
  if (ctx.route !== "settings") return "";
  const cur = location.hash.split("/")[2] || ctx.settingsTab || "rules";
  return SETTINGS_TABS.map(
    ([id, label], i) =>
      html`<a
        href="#/settings/${id}"
        class="nav-sub flow-sub plain ${i < SETTINGS_TABS.length - 1 ? "more" : ""} ${id === cur ? "on" : ""}"
        ${raw(id === cur ? 'aria-current="page"' : "")}
        ><span class="dot"></span><span class="lbl">${t(label)}</span></a
      >`,
  ).join("");
}

export function sidebar(ctx: ShellContext): string {
  const s = ctx.state;
  const p = s.project;
  const name = p ? s.fileName || p.getSettings().projectName || t("unsavedProject") : "";
  const saveBox = s.sample
    ? html`<div class="side-save">
        <button type="button" class="primary" disabled title="${t("sampleNoSaveHelp")}">${raw(icon("save"))}${t("save")}</button>
        <span class="small">${raw(icon("demo"))}${t("sampleNoSave")}</span>
      </div>`
    : html`<div class="side-save">
        <button type="button" class="primary" data-shell="save" title="${t("saveHelp")}" ${raw(s.dirty || !s.fileName ? "" : "disabled")}>
          ${raw(icon("save"))}${t("save")}
        </button>
        <span class="small"
          >${raw(s.dirty ? '<span class="dot warn"></span>' : '<span class="dot ok"></span>')}${s.dirty ? t("stateDirty") : s.fileName ? t("stateSaved") : t("stateNeverSaved")}</span
        >
        ${raw(
          ctx.staged
            ? html`<a class="small" href="#/import/fixes" title="${t("stagedHelp")}"><span class="dot warn"></span>${t("stateStaged")}</a>`
            : "",
        )}
      </div>`;
  const flow = FLOW_STEPS.map((step, i) => {
    const st = stepState(step, ctx);
    return html`<a href="#/import/${step}" class="nav-sub flow-sub ${i < FLOW_STEPS.length - 1 ? "more" : ""} ${st}"
      ><span class="dot"></span><span class="lbl">${t(STEP_LABEL[step])}</span>${raw(badge(ctx.counts[step]))}</a
    >`;
  }).join("");
  const nav =
    link("project", t("navProject"), "project", ctx.route === "project") +
    html`<a href="#/project" class="nav-sub" title="${t("openProjectTitle")}"
      ><span class="dot ${s.dirty ? "warn" : "ok"}"></span><span class="lbl">${name}</span></a
    >` +
    html`<div class="nav-group">${t("navGroupReports")}</div>` +
    link("overview", t("navOverview"), "summary", ctx.route === "overview") +
    link("rows", t("navRows"), "rows", ctx.route === "rows") +
    html`<div class="nav-group">${t("navGroupData")}</div>` +
    link("import", t("navImport"), "import", ctx.route === "import") +
    flow +
    link("settings", t("navSettings"), "settings", ctx.route === "settings") +
    settingsSubs(ctx);
  return html` <div class="brand">
      <div class="brand-mark">${raw(icon("logo"))}</div>
      <div class="brand-name">${t("appTitle")}<span>${t("brandTagline")}</span></div>
    </div>
    ${raw(saveBox)}
    <nav class="nav" aria-label="${t("navProject")}">${raw(nav)}</nav>
    <div class="side-foot">
      <div class="privacy">${raw(icon("shield"))}<span>${t("privacyLine")}</span></div>
      ${raw(meta())}
    </div>`;
}

/** Language button and version line, shared by the sidebar and the welcome screen. */
export function meta(): string {
  return html`<div class="side-meta">
    <button type="button" class="sm ghost" data-shell="lang" title="${t("languageToggle")}">
      ${raw(icon("globe"))} ${getLang().toUpperCase()}
    </button>
    <span class="small muted" title="Commit ${__BUILD_COMMIT__}"
      >v${__APP_VERSION__} · <a href="${repoLink()}" target="_blank" rel="noopener noreferrer">${t("sourceCodeLower")}</a> ·
      <a href="THIRD-PARTY-NOTICES.txt" target="_blank" rel="noopener noreferrer">${t("licencesLower")}</a></span
    >
  </div>`;
}

export function sampleBanner(guided: boolean): string {
  return html`<div class="demo-banner">
    ${raw(icon("demo"))}
    <div>${guided ? t("bannerGuided") : t("bannerSample")}</div>
    <span class="grow"></span> <button type="button" class="sm primary" data-shell="endSample">${t("bannerStartOwn")}</button>
  </div>`;
}

/** The Tuonti stepper: 1 Tiedostot > 2 Luokittelu > 3 Korjaukset. */
export function stepper(ctx: ShellContext): string {
  return html`<nav class="flow" aria-label="${t("flowAria")}">
    ${raw(
      FLOW_STEPS.map((step, i) => {
        const st = stepState(step, ctx);
        return html`<a href="#/import/${step}" class="${st}" ${raw(st === "on" ? 'aria-current="step"' : "")}
          ><b>${st === "done" ? "✓" : String(i + 1)}</b>${t(STEP_LABEL[step])}${raw(badge(ctx.counts[step]))}</a
        >`;
      }).join('<span class="chev" aria-hidden="true">›</span>'),
    )}
  </nav>`;
}
