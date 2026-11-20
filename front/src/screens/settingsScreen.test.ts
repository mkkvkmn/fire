// Tests that the settings screen shows the open project's own settings, never another project's
// (the draft is kept per project, not only per revision).
import type { SqlJsStatic } from "sql.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReportState } from "../app/reportState";
import type { Session, SessionState } from "../app/session";
import type { SourceRow } from "../engine/types";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { ask, askText } from "../ui/dialog";
import { migrationList } from "../project/categories";
import { RESERVED_PATHS } from "../engine/reserved";
import { showToast } from "../ui/toast";
import { setLang } from "../ui/texts";
import { ProjectScreen } from "./projectScreen";
import { SettingsScreen } from "./settingsScreen";

// The prompt itself is the app's dialog; the tests answer it.
vi.mock("../ui/dialog", () => ({ ask: vi.fn(), askText: vi.fn() }));
// Luokat tells why it refused through a toast; the tests read what it said.
vi.mock("../ui/toast", () => ({ showToast: vi.fn() }));

let SQL: SqlJsStatic;
const savedDocument = (globalThis as { document?: unknown }).document;
const savedLocation = (globalThis as { location?: unknown }).location;
beforeAll(async () => {
  SQL = await loadSqlJs();
});
afterAll(() => {
  if (savedDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = savedDocument;
  if (savedLocation === undefined) delete (globalThis as { location?: unknown }).location;
  else (globalThis as { location?: unknown }).location = savedLocation;
});

/** A project with one rule, one target and one account owner, all named after `tag`. */
function project(tag: string): Project {
  const p = Project.create(SQL);
  p.setRules([{ id: "1", account: tag, description: tag, info: "", amount: "any", class: "menot", category: tag, subCategory: "" }]);
  p.setTargets([
    { name: tag, start: "2024-01-01", end: "2024-12-31", owner: tag, monthlyAmount: 1, class: "menot", category: "", subCategory: "" },
  ]);
  p.setSettings({ defaultOwner: tag, accountOwners: { [tag]: tag } });
  return p;
}

/** The screen on a fake page: only what render() touches. */
function screenFor(state: { project: Project | null; revision: number }, onOverlayClose: () => void = () => {}) {
  const root = {
    innerHTML: "",
    hidden: false,
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
  (globalThis as { document?: unknown }).document = { addEventListener: () => {}, querySelector: () => null, activeElement: null };
  const session = { state: state as SessionState, change: vi.fn() } as unknown as Session;
  const screen = new SettingsScreen(root, session, { model: () => null, period: () => null } as unknown as ReportState, onOverlayClose);
  const shown = (tab = "", focus = "") => {
    screen.render(tab, focus);
    return root.innerHTML;
  };
  return { shown, screen, session, root };
}

describe("settings screen across projects", () => {
  it("shows the new project's own settings after another project was open", () => {
    const state = { project: project("sample") as Project | null, revision: 1 };
    const { shown } = screenFor(state);
    expect(shown()).toContain("sample");
    // closed and a fresh project opened while another page is shown: the screen is not rendered in between
    state.project = Project.create(SQL);
    state.revision = 3;
    const out = shown();
    // the new project rendered (language-neutral markers), empty: no tab has a count
    expect(out).toContain('data-tab="rules"');
    expect(out).not.toContain('class="count"');
    expect(out).not.toContain("sample");
  });

  it("shows each project's own settings when switching A, B, A", () => {
    const a = project("alpha");
    const b = project("beta");
    const state = { project: a as Project | null, revision: 1 };
    const { shown } = screenFor(state);
    const showsOnly = (own: string, other: string) => {
      const out = shown();
      expect(out).toContain(own);
      expect(out).not.toContain(other);
    };
    showsOnly("alpha", "beta");
    state.project = b;
    state.revision = 2;
    showsOnly("beta", "alpha");
    state.project = a;
    state.revision = 3;
    showsOnly("alpha", "beta");
  });

  it("scrolls to the rule from the address again in the next project", () => {
    const state = { project: project("alpha") as Project | null, revision: 1 };
    const { shown } = screenFor(state);
    shown("rules", "1");
    state.project = project("beta");
    state.revision = 2;
    shown("rules", "1");
    // showRule sets the filter to the rule id; it shows on the next render
    expect(shown("rules", "1")).toContain('value="#1"');
  });
});

describe("unsaved settings edits when the project closes", () => {
  /**
   * A settings screen and a project screen on one project. `edit` leaves the screen's draft unsaved
   * by changing the stored settings behind its back (same revision, so the draft is kept).
   */
  function setup(sample = false) {
    (globalThis as { location?: unknown }).location = { hash: "#/project" };
    const p = project("alpha");
    const state = { project: p as Project | null, revision: 1, sample, dirty: false, fileName: "a.fire.sqlite", linked: true };
    const { shown, screen } = screenFor(state);
    shown("rules", "7");
    const session = {
      state: state as SessionState,
      close: vi.fn(async () => {
        state.project = null;
      }),
    } as unknown as Session;
    const projectScreen = new ProjectScreen(
      { innerHTML: "", addEventListener: () => {}, querySelector: () => null, querySelectorAll: () => [] } as unknown as HTMLElement,
      session,
      () => 0,
      screen,
    );
    const edit = () => p.setSettings({ defaultOwner: "changed" });
    const clickClose = async () => {
      const button = { dataset: { a: "close" }, disabled: false };
      (projectScreen as unknown as { onClick(e: unknown): void }).onClick({ target: { closest: () => button } });
      await new Promise((r) => setTimeout(r, 0));
    };
    return { screen, edit, clickClose, session };
  }
  const answer = (yes: boolean) => vi.mocked(ask).mockReset().mockResolvedValue(yes);
  const note = () => (vi.mocked(ask).mock.calls[0]?.[1] as { note?: string } | undefined)?.note ?? "";
  const hash = () => (globalThis as unknown as { location: { hash: string } }).location.hash;

  it("shows no settings note when there are no unsaved edits", async () => {
    const { clickClose } = setup();
    answer(false);
    await clickClose();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(note()).toBe("");
    expect(hash()).toBe("#/project");
  });

  it("adds the note to the one close dialog; cancel goes back to the edits where they were", async () => {
    const { screen, edit, clickClose, session } = setup();
    edit();
    answer(false);
    await clickClose();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(note()).toContain(screen.unsavedNote()!);
    expect(hash()).toBe("#/settings/rules/7");
    expect(session.close).not.toHaveBeenCalled();
    expect(screen.dirty()).toBe(true);
  });

  it("cancel lands on the open item even after the screen redrew itself", async () => {
    const { screen, edit, clickClose } = setup();
    // an edit redraws with no argument: the address of the item must survive it
    (screen as unknown as { render(): void }).render();
    edit();
    answer(false);
    await clickClose();
    expect(hash()).toBe("#/settings/rules/7");
  });

  it("makes the sample dialog danger style when Settings has edits, like the normal close", async () => {
    const { edit, clickClose } = setup(true);
    edit();
    answer(false);
    await clickClose();
    expect((vi.mocked(ask).mock.calls[0]?.[1] as { danger?: boolean }).danger).toBe(true);
  });

  it("closes on confirm and the edits are gone with the project", async () => {
    const { screen, edit, clickClose, session } = setup();
    edit();
    answer(true);
    await clickClose();
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(hash()).toBe("#/");
    expect(screen.dirty()).toBe(false);
  });

  it("uses the same note in the sample's dialog, and stays quiet when clean", async () => {
    const dirty = setup(true);
    dirty.edit();
    answer(false);
    await dirty.clickClose();
    expect(note()).toContain(dirty.screen.unsavedNote()!);
    const clean = setup(true);
    answer(false);
    await clean.clickClose();
    expect(note()).toBe("");
    expect(clean.screen.unsavedNote()).toBeUndefined();
  });

  it("showEdits does nothing when nothing is unsaved", () => {
    const { screen } = setup();
    screen.showEdits();
    expect(hash()).toBe("#/project");
  });
});

describe("new rule from a Luokittelu group", () => {
  const group = { account: "", description: "Korttiosto", info: "Example Oy 1234567-8", amount: -12.5 };

  it("opens the rule editor with the group's description, info and sign filled in", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const { shown, screen } = screenFor({ project: project("alpha"), revision: 1 });
    screen.startRule(group, "#/import/classify");
    const page = shown("rules");
    expect(page).toContain('class="drawer"');
    expect(page).toContain('value="Korttiosto"');
    expect(page).toContain('value="Example Oy 1234567-8"');
    expect(page).toContain('<option value="neg" selected>');
  });

  it("goes back to Luokittelu on Peruuta, with the new rule taken away", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const { shown, screen } = screenFor({ project: project("alpha"), revision: 1 });
    screen.startRule(group, "#/import/classify");
    shown("rules");
    (screen as unknown as { cancelEditor(): void }).cancelEditor();
    expect((globalThis as unknown as { location: { hash: string } }).location.hash).toBe("#/import/classify");
    expect(shown("rules")).not.toContain("Korttiosto");
  });
});

describe("rule editor opened from Luokittelu: staged rows and the way back", () => {
  const group = { account: "", description: "Korttiosto", info: "Example Oy", amount: -12.5 };
  const staged = {
    txId: "t1",
    contentHash: "h1",
    occurrence: 1,
    sourceFile: "f.csv",
    columns: {},
    fields: { date: "2024-03-01", account: "alpha", description: "Korttiosto", info: "Example Oy", amount: -12.5 },
  } as unknown as SourceRow;

  it("lists a staged row that is not in the project in the hit list", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const { shown, screen } = screenFor({ project: project("alpha"), revision: 1 });
    screen.startRule(group, "#/import/classify", [staged]);
    const page = shown("rules");
    expect(page).toContain("Example Oy");
    expect(page).not.toContain("The rule hits no rows");
  });

  it("counts each staged row once and finds staged rows of another group by info alone", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const { shown, screen } = screenFor({ project: project("alpha"), revision: 1 });
    const other = { ...staged, txId: "t2", fields: { ...staged.fields, description: "Verkkokauppa", info: "Example Oy" } } as SourceRow;
    // the info-only rule (no description) is drafted from the first group; the other group's row has the same info
    screen.startRule({ ...group, description: "" }, "#/import/classify", [staged, other]);
    const page = shown("rules");
    expect(page).toContain("Verkkokauppa");
    expect(page).toContain("(2)");
    expect(page).not.toContain("(4)");
  });

  it("forgets the way back when the editor closes by another route, so a later save stays in Settings", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const { shown, screen } = screenFor({ project: project("alpha"), revision: 1 });
    screen.startRule(group, "#/import/classify", [staged]);
    shown("rules");
    shown("targets");
    expect((screen as unknown as { returnTo: string }).returnTo).toBe("");
  });
});

describe("saving a rule made from Luokittelu", () => {
  const group = { account: "", description: "Korttiosto", info: "Example Oy", amount: -12.5 };

  /** A screen with the new rule open and filled in (a class is required to save). */
  function open(unsavedEdit: boolean) {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const p = project("alpha");
    const { shown, screen, session } = screenFor({ project: p, revision: 1 });
    shown("rules");
    screen.startRule(group, "#/import/classify");
    shown("rules");
    const d = (screen as unknown as { draft: { rules: { class: string }[] } }).draft;
    d.rules.at(-1)!.class = "menot";
    // an unsaved edit elsewhere in Settings: the stored settings differ from the draft
    if (unsavedEdit) p.setSettings({ defaultOwner: "changed" });
    const save = () => (screen as unknown as { saveEditor(): void }).saveEditor();
    return { save, session };
  }
  const hash = () => (globalThis as unknown as { location: { hash: string } }).location.hash;

  it("asks first, naming the other unsaved edits, and saves nothing on no", async () => {
    const { save, session } = open(true);
    vi.mocked(ask).mockReset().mockResolvedValue(false);
    save();
    await new Promise((r) => setTimeout(r, 0));
    expect(ask).toHaveBeenCalledTimes(1);
    expect((vi.mocked(ask).mock.calls[0]?.[1] as { note?: string }).note).toBe("Myös muut tallentamattomat muutokset tallennetaan.");
    expect(session.change).not.toHaveBeenCalled();
    expect(hash()).toBe("#/settings/rules");
  });

  it("saves and goes back to Luokittelu on yes", async () => {
    const { save, session } = open(true);
    vi.mocked(ask).mockReset().mockResolvedValue(true);
    save();
    await new Promise((r) => setTimeout(r, 0));
    expect(session.change).toHaveBeenCalledTimes(1);
    expect(hash()).toBe("#/import/classify");
  });

  it("saves and goes back without asking when nothing else is unsaved", () => {
    const { save, session } = open(false);
    vi.mocked(ask).mockReset();
    save();
    expect(ask).not.toHaveBeenCalled();
    expect(session.change).toHaveBeenCalledTimes(1);
    expect(hash()).toBe("#/import/classify");
  });
});

describe("rule editor drawn over Luokittelu", () => {
  const group = { account: "", description: "Korttiosto", info: "Example Oy", amount: -12.5 };
  const row = (txId: string, description: string) =>
    ({
      txId,
      contentHash: txId,
      occurrence: 1,
      sourceFile: "f.csv",
      columns: {},
      fields: { date: "2024-03-01", account: "alpha", description, info: "Example Oy", amount: -12.5 },
    }) as unknown as SourceRow;
  const hit = row("t1", "Korttiosto");
  const miss = row("t2", "Verkkokauppa");
  const waiting = [
    { key: "alpha|korttiosto", rows: [hit] },
    { key: "alpha|verkkokauppa", rows: [miss] },
  ];

  it("draws only the drawer, with the waiting rows first and what the rule leaves of them", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/import/classify" };
    const { screen, root } = screenFor({ project: project("alpha"), revision: 1 });
    screen.startRule(group, "#/import/classify", [hit, miss], { waiting, overlay: true });
    expect(screen.ruleOverlay).toBe(true);
    screen.render();
    const page = root.innerHTML;
    expect(page).toContain('class="drawer"');
    expect(page).not.toContain('role="tablist"');
    expect(page).toContain("Luokittelua odottaa nyt 2 riviä 2 ryhmässä.");
    expect(page).toContain("Tämän säännön jälkeen jää 1 riviä 1 ryhmässä.");
    expect(page).toContain("Sääntö luokittelee nämä luokittelua odottavat rivit (1)");
  });

  it("moves to the Asetukset page when that is shown, the editor still open", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const { screen, shown } = screenFor({ project: project("alpha"), revision: 1 });
    screen.startRule(group, "#/import/classify", [hit], { waiting, overlay: true });
    const page = shown("rules");
    expect(screen.ruleOverlay).toBe(false);
    expect(page).toContain('role="tablist"');
    expect(page).toContain('class="drawer"');
  });

  it("hands the saved rule to the page that asked, then lets it redraw", async () => {
    (globalThis as { location?: unknown }).location = { hash: "#/import/classify" };
    const closed = vi.fn();
    const saved = vi.fn();
    const { screen, session } = screenFor({ project: project("alpha"), revision: 1 }, closed);
    screen.startRule(group, "#/import/classify", [hit], { waiting, overlay: true, onSaved: saved });
    screen.render();
    (screen as unknown as { draft: { rules: { class: string }[] } }).draft.rules.at(-1)!.class = "menot";
    vi.mocked(ask).mockReset();
    (screen as unknown as { saveEditor(): void }).saveEditor();
    expect(session.change).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ description: "Korttiosto", class: "menot" }));
    expect(screen.ruleOverlay).toBe(false);
    await Promise.resolve();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("says a saved rule is in force, and an edited one will be", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/settings/rules" };
    const { screen, shown } = screenFor({ project: project("alpha"), revision: 1 });
    const own = row("t3", "alpha");
    // the project's rule 1 (account and description "alpha"), with a row it hits counted alongside
    screen.startRule(group, "", [own]);
    const s = screen as unknown as { openEdit: { rules?: number }; draft: { rules: { description: string }[] } };
    s.draft.rules.pop();
    s.openEdit = { rules: 0 };
    expect(shown("rules")).toContain("Sääntö on voimassa näillä riveillä (1)");
    s.draft.rules[0]!.description = "alph";
    expect(shown("rules")).toContain("Sääntö tulee voimaan näillä riveillä (1)");
  });
});

describe("a saved rule opened from Luokittelu", () => {
  it("opens rule 1 over the page, and Peruuta keeps it as it was", async () => {
    (globalThis as { location?: unknown }).location = { hash: "#/import/classify" };
    const closed = vi.fn();
    const { screen, root } = screenFor({ project: project("alpha"), revision: 1 }, closed);
    screen.editRule("1", "#/import/classify", [], { waiting: [], overlay: true });
    expect(screen.ruleOverlay).toBe(true);
    screen.render();
    expect(root.innerHTML).toContain("Luokittelusääntö 1");
    expect(root.innerHTML).not.toContain('role="tablist"');
    (screen as unknown as { cancelEditor(): void }).cancelEditor();
    await Promise.resolve();
    expect(closed).toHaveBeenCalledTimes(1);
    expect((screen as unknown as { draft: { rules: unknown[] } }).draft.rules).toHaveLength(1);
  });

  it("saves an edit without asking when nothing else is unsaved", () => {
    (globalThis as { location?: unknown }).location = { hash: "#/import/classify" };
    const { screen, session } = screenFor({ project: project("alpha"), revision: 1 });
    screen.editRule("1", "#/import/classify", [], { waiting: [], overlay: true });
    screen.render();
    (screen as unknown as { draft: { rules: { amount: string }[] } }).draft.rules[0]!.amount = "pos";
    vi.mocked(ask).mockReset();
    (screen as unknown as { saveEditor(): void }).saveEditor();
    expect(ask).not.toHaveBeenCalled();
    expect(session.change).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a rule that is gone", () => {
    const { screen } = screenFor({ project: project("alpha"), revision: 1 });
    screen.editRule("9", "#/import/classify", [], { overlay: true });
    expect(screen.ruleOverlay).toBe(false);
  });
});

describe("Luokat", () => {
  it("shows the migration step for a project without a category list, and the tree once it has one", () => {
    const p = project("alpha");
    const state = { project: p as Project | null, revision: 1 };
    const { shown } = screenFor(state);
    let out = shown("categories");
    expect(out).toContain('data-act="catMigrate"');
    expect(out).not.toContain('data-act="catRename"');
    p.setSettings({ categories: migrationList(p, RESERVED_PATHS) });
    state.revision = 2;
    out = shown("categories");
    expect(out).not.toContain('data-act="catMigrate"');
    expect(out).toContain("catRename");
    // reserved names are locked: no buttons, a lock
    expect(out).toContain('class="cat-lock"');
  });

  it("reads the rules again after a rename, so the old names do not show as unsaved edits", async () => {
    const p = project("alpha");
    p.setSettings({ categories: migrationList(p, RESERVED_PATHS) });
    const state = { project: p as Project | null, revision: 1 };
    const { shown, screen, session } = screenFor(state);
    vi.mocked(session.change).mockImplementation(((fn: (x: Project) => unknown) => {
      fn(p);
      state.revision++;
    }) as Session["change"]);
    shown("categories");
    vi.mocked(askText).mockResolvedValueOnce("beta");
    vi.mocked(ask).mockResolvedValueOnce(true);
    const node = JSON.stringify({ class: "menot", category: "alpha", subCategory: "" });
    (screen as unknown as { categoryAction(act: string, b: unknown): void }).categoryAction("catRename", { dataset: { node } });
    await vi.waitFor(() => expect(p.getRules()[0]?.category).toBe("beta"));
    expect(shown("rules")).toContain("beta");
    expect(screen.dirty()).toBe(false);
  });

  it("says the name is missing when the new name is only spaces, and renames nothing", async () => {
    setLang("en");
    const p = project("alpha");
    p.setSettings({ categories: migrationList(p, RESERVED_PATHS) });
    const state = { project: p as Project | null, revision: 1 };
    const { shown, screen, session } = screenFor(state);
    shown("categories");
    vi.mocked(askText).mockResolvedValueOnce("   ");
    const node = JSON.stringify({ class: "menot", category: "alpha", subCategory: "" });
    (screen as unknown as { categoryAction(act: string, b: unknown): void }).categoryAction("catRename", { dataset: { node } });
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith("The name is missing.", "", undefined, 8000, "warn"));
    expect(session.change).not.toHaveBeenCalled();
    expect(p.getRules()[0]?.category).toBe("alpha");
    setLang("fi");
  });
});
