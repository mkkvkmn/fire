// Tests the sidebar links: at phone width the labels are hidden visually (style.css), so each main
// link must still carry its label text as the accessible name, and its icon must be hidden.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sidebar, stepState, type ShellContext } from "./shell";
import { setLang, t } from "./texts";

const ctx = {
  route: "overview",
  step: "files",
  state: { sample: true, dirty: false, fileName: "", project: null },
  counts: { files: 0, classify: 0, fixes: 0 },
  staged: false,
  hasRows: false,
} as unknown as ShellContext;

afterAll(() => setLang("fi"));

describe.each(["fi", "en"] as const)("sidebar links in %s", (lang) => {
  let markup = "";
  let links: RegExpMatchArray[] = [];
  beforeAll(() => {
    setLang(lang);
    markup = sidebar(ctx);
    links = [...markup.matchAll(/<a href="#\/(\w+)"(?![^>]*nav-sub)[^>]*>([\s\S]*?)<\/a\s*>/g)];
  });

  it("names each main link with the same text as the desktop label", () => {
    const names = links.map((m) => [
      m[1],
      (m[2] ?? "")
        .replace(/<svg[\s\S]*?<\/svg>/g, "")
        .replace(/<[^>]+>/g, "")
        .trim(),
    ]);
    expect(names).toEqual([
      ["overview", t("navOverview")],
      ["rows", t("navRows")],
      ["import", t("navImport")],
      ["settings", t("navSettings")],
      ["project", t("navProject")],
    ]);
  });

  it("hides the icons from screen readers and marks the current page", () => {
    for (const m of links) expect(m[2] ?? "").not.toMatch(/<svg(?![^>]*aria-hidden="true")/);
    expect(markup).toContain('<a href="#/overview" class="active" aria-current="page"');
  });

  it("names the language button by its visible code, with the help text as title", () => {
    const btn = markup.match(/<button[^>]*data-shell="lang"[^>]*>([\s\S]*?)<\/button>/);
    expect(btn?.[0]).not.toContain("aria-label");
    expect(btn?.[0]).toContain(`title="${t("languageToggle")}"`);
    expect((btn?.[1] ?? "").replace(/<svg[\s\S]*?<\/svg>/g, "").trim()).toBe(lang.toUpperCase());
  });
});

describe("Tuonti step marks", () => {
  const at = (counts: ShellContext["counts"]) =>
    ({ ...ctx, route: "import", step: "files", staged: true, hasRows: true, counts }) as unknown as ShellContext;

  it("marks Luokittelu done when no group waits and every file is read", () => {
    expect(stepState("classify", at({ files: 0, classify: 0, fixes: 0 }))).toBe("done");
  });

  it("does not mark Luokittelu done while a file is not read yet", () => {
    expect(stepState("classify", at({ files: 1, classify: 0, fixes: 0 }))).toBe("");
  });
});
