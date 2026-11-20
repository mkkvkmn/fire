// A staged import: files the user dropped, read with their file profiles and previewed against the
// project, but not written to it until commit(). Korjaukset made for staged rows wait here too, so a
// cancelled import leaves nothing behind. No DOM.
import { decisionKey, findPossibleDuplicates, type DuplicateCandidate } from "../engine/duplicates";
import { isLocked } from "../engine/lock";
import { matchProfile } from "../engine/profiles";
import { readSourceRows, readTable, type RowProblem } from "../engine/read";
import type { Fix, LedgerRow, SourceProfile, SourceRow } from "../engine/types";
import type { Project } from "../storage/project";
import { acceptLate, computeLedger, ensureAccountOwners, importFile, ignoreLate, rebuildLedger } from "./service";

export interface StagedFile {
  key: number;
  name: string;
  bytes: Uint8Array;
  /** File profile id, "" while no profile is chosen. */
  profileId: string;
  /** True when the profile was matched from the file name (not chosen by hand). */
  recognised: boolean;
  /** New rows the file would add. */
  rows: SourceRow[];
  /** Rows the project already has (an overlapping export); they are skipped. */
  already: number;
  problems: RowProblem[];
  /** Rows kept and dropped when the file is over the row limit, null otherwise. */
  cut: { kept: number; dropped: number } | null;
  /** Reading error with the chosen profile, "" when the file reads. */
  error: string;
}

export interface StagedPreview {
  /** Ledger rows of the staged transactions as they would be imported. */
  rows: LedgerRow[];
  /** Staged rows no luokittelusääntö matches. */
  uncategorized: SourceRow[];
  /** Staged rows dated in a locked month. */
  late: SourceRow[];
  /** Staged rows that look like a row already in the project. */
  duplicates: DuplicateCandidate[];
}

export class Staging {
  files: StagedFile[] = [];
  /** Korjaukset for staged rows, saved with commit(). */
  fixes: Fix[] = [];
  /** Possible duplicates to import anyway (tx ids). Others are left out. */
  keepDuplicates = new Set<string>();
  /** Late rows (tx ids) to leave out of their locked month. Others are added. */
  skipLate = new Set<string>();
  /** The project's rowsVersion when the files were last read: reading again gives the same rows. */
  readFor = -1;
  private nextKey = 1;

  get empty(): boolean {
    return this.files.length === 0;
  }

  /** Adds files and matches each to a file profile by its name. */
  add(project: Project, files: { name: string; bytes: Uint8Array }[]): void {
    const profiles = project.getProfiles();
    for (const f of files) {
      const match = matchProfile(f.name, profiles);
      this.files.push({
        key: this.nextKey++,
        name: f.name,
        bytes: f.bytes,
        profileId: match?.id ?? "",
        recognised: Boolean(match),
        rows: [],
        already: 0,
        problems: [],
        cut: null,
        error: "",
      });
    }
    this.read(project);
  }

  remove(project: Project, key: number): void {
    const gone = this.files.find((f) => f.key === key);
    this.files = this.files.filter((f) => f.key !== key);
    if (gone) {
      const ids = new Set(gone.rows.map((r) => r.txId));
      this.fixes = this.fixes.filter((x) => !ids.has(x.txId));
    }
    this.read(project);
  }

  /** Sets the file profile of one file (the profile itself is saved to the project by the caller). */
  setProfile(project: Project, key: number, profileId: string): void {
    const f = this.files.find((x) => x.key === key);
    if (!f) return;
    f.profileId = profileId;
    f.recognised = false;
    this.read(project);
  }

  /** Re-reads every staged file in order, so occurrence numbers match what commit() will store. */
  read(project: Project): void {
    this.readFor = project.rowsVersion;
    const profiles = new Map(project.getProfiles().map((p) => [p.id, p]));
    const counts = project.hashCounts();
    for (const f of this.files) {
      f.rows = [];
      f.already = 0;
      f.problems = [];
      f.cut = null;
      f.error = "";
      const profile = profiles.get(f.profileId);
      if (!profile) continue;
      try {
        const table = readTable(f.name, f.bytes, profile);
        f.cut = table.cut ?? null;
        const res = readSourceRows(f.name, table, profile, counts);
        f.rows = res.rows;
        f.already = res.alreadyImported.length;
        f.problems = res.problems;
        for (const r of res.rows) counts.set(r.contentHash, Math.max(counts.get(r.contentHash) ?? 0, r.occurrence));
      } catch (e) {
        f.error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  /** Files that cannot be imported yet: no file profile, or it does not read the file. */
  openFiles(): StagedFile[] {
    return this.files.filter((f) => f.profileId === "" || f.error !== "");
  }

  readyFiles(): StagedFile[] {
    return this.files.filter((f) => f.profileId !== "" && f.error === "");
  }

  stagedRows(): SourceRow[] {
    return this.readyFiles().flatMap((f) => f.rows);
  }

  /** How the staged rows would look in the ledger with the project's settings and staged fixes. */
  preview(project: Project): StagedPreview {
    const staged = this.stagedRows();
    if (staged.length === 0) return { rows: [], uncategorized: [], late: [], duplicates: [] };
    const ids = new Set(staged.map((r) => r.txId));
    const existing = project.getSourceRows();
    const { result } = computeLedger(project, {
      rows: [...existing, ...staged],
      draft: { fixes: [...project.getFixes(), ...this.fixes] },
    });
    const lockedThrough = project.getSettings().lockedThrough;
    const decided = new Set(project.getDuplicateDecisions().keys());
    return {
      rows: result.ledger.filter((r) => ids.has(r.txId)),
      uncategorized: result.uncategorized.filter((r) => ids.has(r.txId)),
      late: staged.filter((r) => r.fields.date !== null && isLocked(r.fields.date.slice(0, 7), lockedThrough)),
      duplicates: findPossibleDuplicates(staged, existing, decided),
    };
  }

  /** Adds or replaces a staged korjaus (same id). */
  setFix(fix: Fix): void {
    this.fixes = [...this.fixes.filter((f) => f.id !== fix.id), fix];
  }

  removeFix(id: string): void {
    this.fixes = this.fixes.filter((f) => f.id !== id);
  }

  /**
   * Writes the staged files to the project with the staged korjaukset and decisions, then clears
   * the stage. Returns the number of rows added to the ledger.
   */
  /** Owners chosen for accounts that are new in the staged files (account -> member). */
  accountOwners: Record<string, string> = {};

  commit(project: Project): CommitResult {
    const profiles = new Map(project.getProfiles().map((p) => [p.id, p]));
    const preview = this.preview(project);
    const out: CommitResult = { files: 0, rows: 0, fixes: this.fixes.length, late: 0, duplicatesLeftOut: 0 };
    project.transaction(() => {
      for (const f of this.readyFiles()) {
        const profile = profiles.get(f.profileId) as SourceProfile;
        const s = importFile(project, f.name, f.bytes, profile);
        out.files++;
        // Rows whose date or amount does not read are stored but not in the ledger.
        out.rows += s.added - s.problems.length;
      }
      if (this.fixes.length > 0) project.setFixes([...project.getFixes(), ...this.fixes]);
      // every new account gets an owner: the one chosen in Tarkistukset, else the default owner
      ensureAccountOwners(project, this.accountOwners);
      for (const d of preview.duplicates) {
        if (this.keepDuplicates.has(d.newRow.txId)) {
          for (const e of d.existing) project.setDuplicateDecision(decisionKey(e.txId, d.newRow.txId), "keep");
        } else {
          for (const e of d.existing) project.setDuplicateDecision(decisionKey(e.txId, d.newRow.txId), `drop:${d.newRow.txId}`);
          out.duplicatesLeftOut++;
          out.rows--;
        }
      }
      rebuildLedger(project);
      const late = preview.late.map((r) => r.txId);
      const skip = late.filter((id) => this.skipLate.has(id));
      const accept = new Set(late.filter((id) => !this.skipLate.has(id)));
      if (skip.length > 0) ignoreLate(project, skip);
      if (accept.size > 0) acceptLate(project, accept);
      out.late = accept.size;
    });
    this.files = [];
    this.fixes = [];
    this.keepDuplicates.clear();
    this.skipLate.clear();
    this.accountOwners = {};
    return out;
  }

  clear(): void {
    this.files = [];
    this.fixes = [];
    this.keepDuplicates.clear();
    this.skipLate.clear();
    this.accountOwners = {};
  }
}

export interface CommitResult {
  files: number;
  /** Rows added to the ledger (unreadable rows and duplicates left out are not counted). */
  rows: number;
  fixes: number;
  /** Rows added to locked months. */
  late: number;
  duplicatesLeftOut: number;
}
