// The open project and its link to a file on disk: new, open, save, save as, download, sample.
// Every change is mirrored to the working copy so a closed tab loses nothing.
import type { SqlJsStatic } from "sql.js";
import { previousMonth } from "../engine/lock";
import { matchProfile } from "../engine/profiles";
import { demoData, type DemoData, type DemoLang } from "../project/demo";
import { migrateV2, type MigrateOptions, type MigrateResult, type V2Found } from "../project/migrate";
import { ensureAccountOwners, importFile, rebuildLedger, setLock } from "../project/service";
import { Project } from "../storage/project";
import {
  canSaveInPlace,
  downloadFile,
  pickProjectFile,
  projectFileName,
  rememberedHandle,
  rememberHandle,
  saveAs,
  writeToHandle,
  WritePermissionError,
  markWriteBlocked,
} from "../storage/projectFile";
import { loadSqlJs } from "../storage/sqljs";
import { fmt } from "../ui/texts";
import { clearWorkingCopy, loadWorkingCopy, saveWorkingCopy } from "../storage/workingCopy";

export interface SessionState {
  project: Project | null;
  /** Project file name, "" for a project never saved. */
  fileName: string;
  /** True when the project has changes not saved to its file. */
  dirty: boolean;
  /** True when saving writes straight back to the linked file. */
  linked: boolean;
  /** Last error message to show, "" when none. */
  error: string;
  busy: boolean;
  /** Increases on every change to the project, so screens can cache derived data. */
  revision: number;
  /** True while the sample project is open: nothing is saved. */
  sample: boolean;
  /** True when the browser refused to keep the working copy: it may be cleared under storage pressure or after a week away. */
  storageAtRisk: boolean;
}

type Listener = (s: SessionState) => void;

export class Session {
  private SQL: SqlJsStatic | null = null;
  private handle: FileSystemFileHandle | null = null;
  private listeners: Listener[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistAsked = false;
  state: SessionState = {
    project: null,
    fileName: "",
    dirty: false,
    linked: false,
    error: "",
    busy: false,
    revision: 0,
    sample: false,
    storageAtRisk: false,
  };

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private async sql(): Promise<SqlJsStatic> {
    this.SQL ??= await loadSqlJs();
    return this.SQL;
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.set({ busy: true, error: "" });
    try {
      await fn();
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      this.set({ busy: false });
    }
  }

  private replace(project: Project, fileName: string, handle: FileSystemFileHandle | null, dirty: boolean, sample = false): void {
    this.state.project?.close();
    this.handle = handle;
    // projects from before account owners: write down who owns each account today (no row changes)
    if (ensureAccountOwners(project).length > 0 && !sample) dirty = true;
    this.set({
      project,
      fileName,
      dirty,
      linked: handle !== null,
      revision: this.state.revision + 1,
      sample,
    });
  }

  /** When a project is created, opened or adopted (not on a restore): asks the browser once per page load to keep the working copy, and flags the risk when it says no. */
  private async askPersistence(): Promise<void> {
    if (this.persistAsked) return;
    this.persistAsked = true;
    const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
    if (!storage?.persist) return;
    try {
      if ((await storage.persisted()) || (await storage.persist())) return;
      this.set({ storageAtRisk: true });
    } catch {
      // not available in this context: nothing to ask
    }
  }

  /** Restores the working copy from the last visit, if any. */
  init(): Promise<void> {
    return this.run(async () => {
      const copy = await loadWorkingCopy();
      if (!copy) return;
      const handle = await rememberedHandle();
      const linked = handle && handle.name === copy.meta.fileName ? handle : null;
      this.replace(Project.open(await this.sql(), copy.bytes), copy.meta.fileName, linked, copy.meta.dirty, copy.meta.sample === true);
    });
  }

  newProject(defaultOwner: string, projectName = ""): Promise<void> {
    return this.run(async () => {
      const p = Project.create(await this.sql());
      p.setSettings({ defaultOwner, projectName });
      this.replace(p, "", null, true);
      await rememberHandle(null);
      await this.persistNow();
      void this.askPersistence();
    });
  }

  open(): Promise<void> {
    return this.run(async () => {
      const picked = await pickProjectFile();
      if (!picked) return;
      const p = Project.open(await this.sql(), picked.bytes);
      this.replace(p, picked.name, picked.handle, false);
      await rememberHandle(picked.handle);
      await this.persistNow();
      void this.askPersistence();
    });
  }

  /** The demo project: 24 months ending last month, every file imported. Nothing is saved. */
  loadSample(sampleName: string, lang: DemoLang): Promise<void> {
    return this.run(async () => {
      const d = demoData(lang, previousMonth(new Date()));
      const p = Project.create(await this.sql());
      setupDemo(p, d, sampleName, lang);
      for (const f of d.files) {
        const profile = matchProfile(f.name, d.profiles);
        if (profile) importFile(p, f.name, f.bytes, profile);
      }
      rebuildLedger(p);
      this.replace(p, "", null, false, true);
      await rememberHandle(null);
      await this.persistNow();
    });
  }

  /**
   * The guided import: the demo project without the card's file profile and without the food
   * rules, so the guide shows a file to set up and rows to categorise. Returns the demo files for
   * the caller to stage.
   */
  startGuided(sampleName: string, lang: DemoLang): Promise<{ name: string; bytes: Uint8Array }[]> {
    const d = demoData(lang, previousMonth(new Date()));
    return this.run(async () => {
      const p = Project.create(await this.sql());
      setupDemo(p, d, sampleName, lang);
      p.setProfiles(d.profiles.filter((x) => x.id !== d.guidedProfile));
      p.setRules(d.rules.filter((r) => r.category !== d.guidedCategory));
      this.replace(p, "", null, false, true);
      await rememberHandle(null);
      await this.persistNow();
    }).then(() => d.files);
  }

  /** Builds a project from v2 files without opening it, so the user sees the result first. */
  async migrate(found: V2Found, opts: MigrateOptions): Promise<{ project: Project; result: MigrateResult } | null> {
    let out: { project: Project; result: MigrateResult } | null = null;
    await this.run(async () => {
      const p = Project.create(await this.sql());
      try {
        out = { project: p, result: migrateV2(p, found, opts) };
      } catch (e) {
        p.close();
        throw e;
      }
    });
    return out;
  }

  /** Opens a migrated project (unsaved), optionally locking every month up to `lockThrough`. */
  adopt(p: Project, lockThrough: string): Promise<void> {
    return this.run(async () => {
      if (lockThrough) setLock(p, lockThrough);
      this.replace(p, "", null, true);
      await rememberHandle(null);
      await this.persistNow();
      void this.askPersistence();
    });
  }

  /** The demo files of a guided sample project, to stage again after a reload (staging is in memory). */
  guidedFiles(): { name: string; bytes: Uint8Array }[] {
    const p = this.state.project;
    if (!p || !this.state.sample || p.counts().rawRows > 0) return [];
    return demoData(p.getSettings().language, previousMonth(new Date())).files;
  }

  /** Saves to the linked file; without one, asks where to save (Chromium) or downloads. */
  save(): Promise<void> {
    return this.run(async () => {
      const p = this.state.project;
      if (!p || this.state.sample) return;
      if (this.handle) {
        try {
          await writeToHandle(this.handle, p.export());
          this.set({ dirty: false });
        } catch (e) {
          if (!(e instanceof WritePermissionError)) throw e;
          // no permission for the linked file: forget the link and ask where to save instead
          const name = this.handle.name;
          this.handle = null;
          await rememberHandle(null);
          this.set({ linked: false });
          try {
            await this.saveAsInner(p);
          } catch {
            throw new Error(fmt("saveNoPermission", { file: name }));
          }
        }
      } else {
        await this.saveAsInner(p);
      }
      await this.persistNow();
    });
  }

  saveAs(): Promise<void> {
    return this.run(async () => {
      const p = this.state.project;
      if (!p) return;
      await this.saveAsInner(p);
      await this.persistNow();
    });
  }

  private async saveAsInner(p: Project): Promise<void> {
    const name = projectFileName(this.fileStem(p));
    if (canSaveInPlace()) {
      let handle: FileSystemFileHandle | null;
      try {
        handle = await saveAs(p.export(), name);
      } catch (e) {
        if (!(e instanceof WritePermissionError)) throw e;
        markWriteBlocked();
        // the browser picked a file but did not let the page write it: download instead
        downloadFile(p.export(), name);
        this.set({ fileName: name, dirty: false, linked: false });
        return;
      }
      if (!handle) return;
      this.handle = handle;
      await rememberHandle(handle);
      this.set({ fileName: handle.name, dirty: false, linked: true });
    } else {
      downloadFile(p.export(), name);
      this.set({ fileName: name, dirty: false, linked: false });
    }
  }

  /** The saved file's name, or a file name made from the project name for a project never saved. */
  private fileStem(p: Project): string {
    return this.state.fileName || slugName(p.getSettings().projectName) || "fire";
  }

  /** Downloads a copy without changing the link (also a backup in Chromium). */
  download(name?: string): void {
    const p = this.state.project;
    if (p) downloadFile(p.export(), name ?? projectFileName(this.fileStem(p)));
  }

  close(): Promise<void> {
    return this.run(async () => {
      this.state.project?.close();
      this.handle = null;
      forgetReportOwner();
      this.set({
        project: null,
        fileName: "",
        dirty: false,
        linked: false,
        revision: this.state.revision + 1,
        sample: false,
      });
      await rememberHandle(null);
      await clearWorkingCopy();
    });
  }

  /** Applies a change to the project, marks it unsaved and updates the working copy. */
  change<T>(fn: (p: Project) => T): T | undefined {
    const p = this.state.project;
    if (!p) return undefined;
    try {
      const out = fn(p);
      this.set({
        dirty: !this.state.sample,
        error: "",
        revision: this.state.revision + 1,
      });
      this.schedulePersist();
      return out;
    } catch (e) {
      this.set({
        error: e instanceof Error ? e.message : String(e),
        revision: this.state.revision + 1,
      });
      return undefined;
    }
  }

  /** Shows a message in the status line. */
  showError(message: string): void {
    this.set({ error: message });
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persistNow(), 500);
  }

  private async persistNow(): Promise<void> {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = null;
    const p = this.state.project;
    if (!p) return;
    await saveWorkingCopy(p.export(), {
      fileName: this.state.fileName,
      dirty: this.state.dirty,
      updatedAt: new Date().toISOString(),
      sample: this.state.sample,
    });
  }
}

/** "Perheen talous 2025" -> "perheen-talous-2025": a safe file name from a project name. */
export function slugName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function setupDemo(p: Project, d: DemoData, name: string, lang: DemoLang): void {
  p.setProfiles(d.profiles);
  p.setRules(d.rules);
  p.setSplits(d.splits);
  p.setTargets(d.targets);
  p.setSettings({
    defaultOwner: d.members[0],
    members: [d.members[1]],
    projectName: name,
    language: lang,
  });
}

/** The report filters are kept in this browser (app/reportState.ts); the chosen member is a name. */
function forgetReportOwner(): void {
  try {
    const key = "fire.reportFilters";
    const v = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown> | null;
    if (v && v.owner) localStorage.setItem(key, JSON.stringify({ ...v, owner: "" }));
  } catch {
    // nothing kept, or storage blocked
  }
}
