// App entry point: the shell (sidebar, sample banner, status) with a hash router over the screens.
// #/overview, #/rows, #/project, #/import/<step>, #/settings; the welcome screen when no project is open.
import { ask } from "./ui/dialog";
import { FLOW_STEPS, ImportFlow, type FlowStep } from "./app/importFlow";
import { ReportState, type Drill } from "./app/reportState";
import { Session } from "./app/session";
import { ImportScreen } from "./screens/import/importScreen";
import { ProjectScreen } from "./screens/projectScreen";
import { RowsScreen } from "./screens/reports/rows";
import { OverviewScreen } from "./screens/reports/overview";
import { SettingsScreen } from "./screens/settingsScreen";
import { WelcomeScreen } from "./screens/welcome";
import { installChartTooltips } from "./ui/charts";
import { html } from "./ui/html";
import { sampleBanner, sidebar, type Route } from "./ui/shell";
import { getLang, setLang, t, type Lang } from "./ui/texts";
import { showToast } from "./ui/toast";
import "./style.css";

const LANG_KEY = "fire.lang";

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "fi" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

function storeLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // per-viewer convenience only
  }
}

const ROUTES: Route[] = ["welcome", "project", "overview", "rows", "import", "settings"];
/** Old addresses from v3 before the new layout. */
const ALIASES: Record<string, string> = { summary: "overview", flows: "overview", wealth: "overview", review: "import/classify" };

function parseHash(): { route: Route; step: FlowStep; rest: string } {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  const head = parts[0] ?? "";
  const alias = ALIASES[head];
  if (alias) {
    location.replace(`#/${alias}`);
    return parseHash();
  }
  const open = session.state.project !== null;
  let route: Route = (ROUTES as string[]).includes(head) ? (head as Route) : open ? "overview" : "welcome";
  if (!open) route = "welcome";
  else if (route === "welcome") route = "overview";
  const step = (FLOW_STEPS as string[]).includes(parts[1] ?? "") ? (parts[1] as FlowStep) : "files";
  return { route, step, rest: parts.slice(2).join("/") };
}

// An exception that nothing caught: say so instead of leaving a blank or stale screen. Nothing is reported anywhere.
let crashShown = false;
function crashed(): void {
  if (crashShown) return;
  crashShown = true;
  showToast(t("crashTitle"), t("crashBody"), undefined, 30000, "warn");
  setTimeout(() => (crashShown = false), 30000);
}
// Only events that carry a thrown value: browser notices such as the ResizeObserver loop note have none.
window.addEventListener("error", (e) => {
  if (e.error !== null && e.error !== undefined) crashed();
});
window.addEventListener("unhandledrejection", crashed);

const app = document.querySelector<HTMLDivElement>("#app")!;
const session = new Session();
const flow = new ImportFlow(session);
setLang(storedLang() ?? (navigator.language.startsWith("fi") ? "fi" : "en"));

app.innerHTML = `
  <div class="shell" data-shell-root>
    <aside class="side"></aside>
    <main class="main"><div class="page">
      <div data-banner></div>
      <div id="status" role="status" aria-live="polite"></div>
      <div id="screen-project" class="screen"></div>
      <div id="screen-overview" class="screen"></div>
      <div id="screen-rows" class="screen"></div>
      <div id="screen-import" class="screen"></div>
      <div id="screen-settings" class="screen"></div>
    </div></main>
  </div>
  <main class="bare" id="screen-welcome" hidden></main>
`;

const el = (id: string) => app.querySelector<HTMLElement>(`#${id}`)!;
const shellRoot = app.querySelector<HTMLElement>("[data-shell-root]")!;
const side = app.querySelector<HTMLElement>(".side")!;
const banner = app.querySelector<HTMLElement>("[data-banner]")!;
const status = el("status");

const welcome = new WelcomeScreen(el("screen-welcome"), session, flow);
const importScreen = new ImportScreen(el("screen-import"), session, flow);
const settingsScreen = new SettingsScreen(el("screen-settings"), session);
const reports = new ReportState(session);
const overview = new OverviewScreen(el("screen-overview"), reports);
const rowsScreen = new RowsScreen(el("screen-rows"), reports, session);
const projectScreen = new ProjectScreen(el("screen-project"), session, () => flow.staging.files.length);
installChartTooltips(app);

/** Saves the project file. Added files that are not imported yet are not part of it: say so. */
function save(): void {
  void session.save().then(() => {
    if (!flow.staging.empty)
      showToast(t("stateStaged"), t("stagedSaveBody"), { href: "#/import/fixes", label: t("importRows") }, 12000, "warn");
  });
}

// Every clickable number opens Tapahtumat with the rows behind it.
app.addEventListener("click", (e) => {
  const target = e.target as Element;
  const drill = target.closest?.("[data-drill]");
  if (drill) {
    try {
      reports.openRows(JSON.parse(drill.getAttribute("data-drill") ?? "") as Drill);
    } catch {
      // ignore a malformed payload
    }
    return;
  }
  const b = target.closest?.<HTMLButtonElement>("button[data-shell]");
  if (!b || b.disabled) return;
  switch (b.dataset.shell) {
    case "save":
      save();
      break;
    case "lang": {
      const lang: Lang = getLang() === "fi" ? "en" : "fi";
      setLang(lang);
      storeLang(lang);
      render();
      break;
    }
    case "endSample":
      void ask(t("confirmLeaveSample"), { ok: t("bannerStartOwn") }).then(async (yes) => {
        if (!yes) return;
        await session.close();
        location.hash = "#/";
      });
      break;
  }
});

// Ctrl+S saves the project file.
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && session.state.project && !session.state.sample) {
    e.preventDefault();
    save();
  }
});

// Added files wait in memory until Tuo rivit: the browser asks before a reload or a closed tab drops them.
// Not for the sample: nothing of it is kept, and the guided files are staged again after a reload.
window.addEventListener("beforeunload", (e) => {
  if (!flow.staging.empty && !session.state.sample) e.preventDefault();
});

function render(): void {
  const { route, step, rest } = parseHash();
  document.documentElement.lang = getLang();
  const s = session.state;
  const counts = flow.data().counts;
  const bare = route === "welcome";
  shellRoot.hidden = bare;
  el("screen-welcome").hidden = !bare;
  if (bare) {
    welcome.render();
  } else {
    side.innerHTML = sidebar({
      route,
      step,
      state: s,
      counts,
      staged: !flow.staging.empty,
      hasRows: (s.project?.counts().rawRows ?? 0) > 0,
      settingsTab: settingsScreen.currentTab,
    });
    banner.innerHTML = s.sample ? sampleBanner(flow.guided) : "";
    status.innerHTML = s.error
      ? html`<div class="note err">${t("errorPrefix")}: ${s.error}</div>`
      : s.busy
        ? html`<div class="muted small">${t("busy")}</div>`
        : "";
    for (const r of ROUTES) if (r !== "welcome") el(`screen-${r}`).hidden = r !== route;
    if (route === "overview") overview.render();
    else if (route === "rows") rowsScreen.render();
    else if (route === "project") projectScreen.render();
    else if (route === "import")
      importScreen.render(
        { route, step, state: s, counts, staged: !flow.staging.empty, hasRows: (s.project?.counts().rawRows ?? 0) > 0 },
        rest,
      );
    else settingsScreen.render(location.hash.split("/")[2] ?? "", decodeURIComponent(location.hash.split("/")[3] ?? ""));
  }
  const name = s.project ? s.fileName || s.project.getSettings().projectName || t("unsavedProject") : "";
  document.title = s.project ? `${s.dirty ? "* " : ""}${name} - ${t("appTitle")}` : t("appTitle");
}

window.addEventListener("hashchange", () => {
  if (parseHash().route !== "rows") reports.drill = null;
  render();
  window.scrollTo({ top: 0 });
});
reports.subscribe(() => render());
flow.subscribe(() => render());
let lastProject: unknown = null;
let lastRevision = -1;
let riskShown = false;
session.subscribe((s) => {
  if (s.storageAtRisk && !riskShown) {
    riskShown = true;
    showToast(t("storageAtRiskTitle"), t("storageAtRiskBody"), undefined, 15000, "warn");
  }
  if (s.project !== lastProject) {
    lastProject = s.project;
    flow.reset();
    // A guided sample project whose staged files were lost in a reload: stage them again.
    const files = session.guidedFiles();
    if (files.length > 0 && s.project) {
      flow.staging.add(s.project, files);
      flow.guided = true;
    }
  } else if (s.revision !== lastRevision) {
    flow.restage();
  }
  lastRevision = s.revision;
  render();
});
render();
void session.init();
