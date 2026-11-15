// Welcome screen, shown when no project is open: what the app does, how the data is kept, and three
// ways to start (sample reports, guided import with sample files, own data).
import type { ImportFlow } from "../app/importFlow";
import { slugName, type Session } from "../app/session";
import { html, raw } from "../ui/html";
import { icon } from "../ui/icons";
import { meta, repoLink } from "../ui/shell";
import { MigrateView } from "./migrateView";
import { fmt, getLang, t } from "../ui/texts";

export class WelcomeScreen {
  private naming = false;
  private migrating = false;
  private readonly migrate: MigrateView;

  constructor(
    private readonly root: HTMLElement,
    private readonly session: Session,
    private readonly flow: ImportFlow,
  ) {
    this.migrate = new MigrateView(
      session,
      () => {
        this.migrating = false;
        this.render();
      },
      () => this.render(),
    );
    root.addEventListener("click", (e) => void this.onClick(e));
    root.addEventListener("change", (e) => {
      if (this.migrating && this.migrate.onChange(e.target as HTMLInputElement)) this.render();
    });
    root.addEventListener("input", (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.w !== "name") return;
      const hint = root.querySelector("[data-w-file]");
      if (hint) hint.textContent = fmt("projectFileHint", { file: `${slugName(el.value) || "fire"}.fire.sqlite` });
    });
    root.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.create();
    });
  }

  render(): void {
    if (this.migrating) {
      this.root.innerHTML = html`<header class="welcome-head">
          <div class="brand">
            <div class="brand-mark">${raw(icon("logo"))}</div>
            <div class="brand-name">${t("appTitle")}<span>${t("brandTagline")}</span></div>
          </div>
          ${raw(meta())}
        </header>
        ${raw(this.migrate.render())}`;
      return;
    }
    const point = (ic: "shield" | "user" | "project", title: string, body: string) =>
      html`<li>
        ${raw(icon(ic))}
        <div><b>${title}</b><span>${raw(body)}</span></div>
      </li>`;
    const sourceLink = html`<a href="${repoLink()}" target="_blank" rel="noopener noreferrer">${t("welcomePoint1Link")}</a>`;
    const own = this.naming
      ? html`<form class="new-project" data-w-form>
          <label class="field"
            >${t("projectNameLabel")}<input data-w="name" value="${t("projectNameDefault")}" autocomplete="off" required />
            <small data-w-file>${fmt("projectFileHint", { file: `${slugName(t("projectNameDefault"))}.fire.sqlite` })}</small></label
          >
          <label class="field"
            >${t("memberNameLabel")}<input data-w="member" autocomplete="given-name" required /><small>${t("memberNameHint")}</small></label
          >
          <p class="small muted">${t("projectSaveLater")}</p>
          <div class="actions">
            <button type="button" class="ghost" data-w="cancel">${t("cancel")}</button
            ><button type="submit" class="primary">${t("createProject")}</button>
          </div>
        </form>`
      : html`<div class="own-actions">
          <button type="button" data-w="new">${raw(icon("plus"))}${t("newProject")}</button>
          <button type="button" data-w="open">${raw(icon("open"))}${t("openProject")}</button>
          <button type="button" class="ghost wide" data-w="migrate">${raw(icon("migrate"))}${t("migrateFromV2")}</button>
        </div>`;
    this.root.innerHTML = html` <header class="welcome-head">
        <div class="brand">
          <div class="brand-mark">${raw(icon("logo"))}</div>
          <div class="brand-name">${t("appTitle")}<span>${t("brandTagline")}</span></div>
        </div>
        ${raw(meta())}
      </header>
      <section class="welcome-hero">
        <h1>${t("welcomeHeadline")}</h1>
        <p class="lead">${t("welcomeLead")}</p>
        <ul class="welcome-points">
          ${raw(point("shield", t("welcomePoint1Title"), fmt("welcomePoint1", { link: sourceLink })))}
          ${raw(point("user", t("welcomePoint2Title"), html`${t("welcomePoint2")}`))}
          ${raw(point("project", t("welcomePoint3Title"), html`${t("welcomePoint3")}`))}
        </ul>
      </section>
      <div class="section-label">${t("welcomeHow")}</div>
      <div class="welcome-choices">
        <section class="card choice">
          <span class="choice-tag">${t("choiceFastTag")}</span>
          <h3>${raw(icon("summary"))}${t("choiceFastTitle")}</h3>
          <p class="small muted">${t("choiceFastBody")}</p>
          <button type="button" class="primary" data-w="sample">${t("choiceFastButton")}</button>
        </section>
        <section class="card choice">
          <span class="choice-tag">${t("choiceGuidedTag")}</span>
          <h3>${raw(icon("import"))}${t("choiceGuidedTitle")}</h3>
          <p class="small muted">${t("choiceGuidedBody")}</p>
          <button type="button" data-w="guided">${t("choiceGuidedButton")}</button>
        </section>
        <section class="card choice">
          <span class="choice-tag">${t("choiceOwnTag")}</span>
          <h3>${raw(icon("project"))}${t("choiceOwnTitle")}</h3>
          <p class="small muted">${t("choiceOwnBody")}</p>
          ${raw(own)}
        </section>
      </div>
      <div class="section-label">${t("welcomeHowItWorks")}</div>
      <div class="grid g-3">
        <section class="card tile">
          <div class="t">${raw(icon("import"))}${t("how1Title")}</div>
          <p class="small muted">${t("how1")}</p>
        </section>
        <section class="card tile">
          <div class="t">${raw(icon("rule"))}${t("how2Title")}</div>
          <p class="small muted">${t("how2")}</p>
        </section>
        <section class="card tile">
          <div class="t">${raw(icon("eye"))}${t("how3Title")}</div>
          <p class="small muted">${t("how3")}</p>
        </section>
      </div>`;
    if (this.naming) this.root.querySelector<HTMLInputElement>('[data-w="member"]')?.focus();
  }

  private async onClick(e: Event): Promise<void> {
    if (this.migrating) {
      const mb = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-mig]");
      if (mb && !mb.disabled && (await this.migrate.onClick(mb)) && this.migrating) this.render();
      return;
    }
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-w]");
    if (!b) return;
    switch (b.dataset.w) {
      case "sample":
        await this.session.loadSample(t("sampleProjectName"), getLang());
        if (this.session.state.project) location.hash = "#/overview";
        break;
      case "guided": {
        const files = await this.session.startGuided(t("sampleProjectName"), getLang());
        const p = this.session.state.project;
        if (!p) return;
        this.flow.staging.clear();
        this.flow.staging.add(p, files);
        this.flow.guided = true;
        this.flow.touch();
        location.hash = "#/import/files";
        break;
      }
      case "migrate":
        this.migrating = true;
        this.render();
        window.scrollTo({ top: 0 });
        break;
      case "new":
        this.naming = true;
        this.render();
        break;
      case "cancel":
        this.naming = false;
        this.render();
        break;
      case "open":
        await this.session.open();
        if (this.session.state.project) location.hash = "#/overview";
        break;
    }
  }

  private async create(): Promise<void> {
    const name = this.root.querySelector<HTMLInputElement>('[data-w="name"]')?.value.trim() ?? "";
    const member = this.root.querySelector<HTMLInputElement>('[data-w="member"]')?.value.trim() ?? "";
    if (!name || !member) return;
    await this.session.newProject(member, name);
    this.naming = false;
    this.flow.staging.clear();
    this.flow.guided = false;
    this.flow.touch();
    if (this.session.state.project) location.hash = "#/import/files";
  }
}
