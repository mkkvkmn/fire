// The project: one SQLite database (sql.js) holding source files, raw rows with every source
// column, the processed ledger and all settings. Pure data access; no DOM and no file handling.
import type { Database, SqlJsStatic, SqlValue } from "sql.js";
import { sha256Bytes } from "../engine/sha256";
import type { Fix, LedgerRow, Rule, SourceProfile, SourceRow, Split, Target } from "../engine/types";
import { normalizeAmountMatch } from "../engine/categorize";
import { normalizeRow } from "../engine/profiles";
import { APP_ID, MIGRATIONS, SCHEMA_VERSION } from "./schema";

/** A file that cannot be opened as a project; `kind` lets the app say why in the user's language. */
export class ProjectFileError extends Error {
  constructor(
    message: string,
    readonly kind: "notProject" | "tooNew" | "broken" = "broken",
  ) {
    super(message);
  }
}

export interface ProjectSettings {
  /** Last locked month `YYYY-MM`, or "" when nothing is locked. */
  lockedThrough: string;
  defaultOwner: string;
  language: "fi" | "en";
  /** Name the user gave the project; also the suggested file name. */
  projectName: string;
  /** Members added by hand that no split, target or row uses yet. */
  members: string[];
  /** FiRe assumptions; null = the defaults. */
  fire: FireSettings | null;
  /** Owner of each account's rows that no split covers. The default owner is only a suggestion for new accounts. */
  accountOwners: Record<string, string>;
}

export interface FireSettings {
  /** Spending per month; null = the 12-month average from the data. */
  spend: number | null;
  invest: number;
  /** Percent. */
  ret: number;
  /** Percent. */
  tax: number;
}

const DEFAULT_SETTINGS: ProjectSettings = {
  lockedThrough: "",
  defaultOwner: "",
  language: "fi",
  projectName: "",
  members: [],
  fire: null,
  accountOwners: {},
};

export interface SourceFileInfo {
  id: number;
  name: string;
  hash: string;
  size: number;
  profileId: string;
  importedAt: string;
  rowCount: number;
}

export interface ProjectCounts {
  sourceFiles: number;
  rawRows: number;
  ledgerRows: number;
  rules: number;
}

type Row = Record<string, SqlValue>;

function str(v: SqlValue | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

function num(v: SqlValue | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

export class Project {
  private constructor(readonly db: Database) {}

  static create(SQL: SqlJsStatic): Project {
    const db = new SQL.Database();
    db.run(`PRAGMA application_id = ${APP_ID}`);
    const p = new Project(db);
    p.migrate(0);
    return p;
  }

  static open(SQL: SqlJsStatic, bytes: Uint8Array): Project {
    let db: Database;
    try {
      db = new SQL.Database(bytes);
      db.exec("SELECT count(*) FROM sqlite_master");
    } catch {
      throw new ProjectFileError("not a fire project file", "notProject");
    }
    const appId = num(db.exec("PRAGMA application_id")[0]?.values[0]?.[0] ?? null);
    const version = num(db.exec("PRAGMA user_version")[0]?.values[0]?.[0] ?? null);
    if (appId !== APP_ID) {
      db.close();
      throw new ProjectFileError("not a fire project file", "notProject");
    }
    if (version > SCHEMA_VERSION) {
      db.close();
      throw new ProjectFileError(`project file version ${version} is newer than this app (${SCHEMA_VERSION})`, "tooNew");
    }
    const p = new Project(db);
    p.migrate(version);
    return p;
  }

  private migrate(from: number): void {
    for (let v = from; v < SCHEMA_VERSION; v++) {
      this.transaction(() => {
        this.db.exec(MIGRATIONS[v]!);
        this.db.run(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  export(): Uint8Array {
    return this.db.export();
  }

  close(): void {
    this.db.close();
  }

  private depth = 0;

  /**
   * The source rows and the ledger, read once and kept until a write changes them: reading and
   * parsing every row costs about 0.1 s for a real project, and many screens need them. The arrays
   * and rows are frozen, so a caller cannot change the shared copy by mistake.
   */
  private cache: { sourceRows?: readonly SourceRow[]; ledger?: readonly LedgerRow[] } = {};

  private forgetRows(): void {
    this.cache.sourceRows = undefined;
  }

  private forgetLedger(): void {
    this.cache.ledger = undefined;
  }

  /** Runs fn atomically. Nested calls use savepoints, so helpers can be combined freely. */
  transaction<T>(fn: () => T): T {
    const name = `sp${this.depth}`;
    this.db.run(`SAVEPOINT ${name}`);
    this.depth++;
    try {
      const out = fn();
      this.depth--;
      this.db.run(`RELEASE ${name}`);
      return out;
    } catch (e) {
      this.depth--;
      this.cache = {};
      this.db.run(`ROLLBACK TO ${name}`);
      this.db.run(`RELEASE ${name}`);
      throw e;
    }
  }

  private all(sql: string, params: SqlValue[] = []): Row[] {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const out: Row[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as Row);
      return out;
    } finally {
      stmt.free();
    }
  }

  private insertMany(sql: string, rows: SqlValue[][]): void {
    const stmt = this.db.prepare(sql);
    try {
      for (const r of rows) stmt.run(r);
    } finally {
      stmt.free();
    }
  }

  // ---- settings

  getSettings(): ProjectSettings {
    const out: ProjectSettings = { ...DEFAULT_SETTINGS };
    for (const r of this.all("SELECT key, value FROM settings")) {
      const key = str(r.key) as keyof ProjectSettings;
      if (Object.hasOwn(DEFAULT_SETTINGS, key)) (out as unknown as Record<string, unknown>)[key] = JSON.parse(str(r.value));
    }
    return out;
  }

  setSettings(patch: Partial<ProjectSettings>): void {
    this.transaction(() => {
      for (const [k, v] of Object.entries(patch)) {
        this.db.run("INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [
          k,
          JSON.stringify(v),
        ]);
      }
    });
  }

  // ---- profiles

  getProfiles(): SourceProfile[] {
    return this.all("SELECT data FROM source_profiles ORDER BY position").map((r) => JSON.parse(str(r.data)) as SourceProfile);
  }

  setProfiles(profiles: SourceProfile[]): void {
    this.forgetRows();
    this.transaction(() => {
      this.db.run("DELETE FROM source_profiles");
      this.insertMany(
        "INSERT INTO source_profiles(id, position, data) VALUES (?, ?, ?)",
        profiles.map((p, i) => [p.id, i, JSON.stringify(p)]),
      );
    });
  }

  // ---- rules, fixes, splits, targets

  getRules(): Rule[] {
    return this.all("SELECT * FROM rules ORDER BY position").map((r) => ({
      id: str(r.id),
      account: str(r.account),
      description: str(r.description),
      info: str(r.info),
      amount: normalizeAmountMatch(str(r.amount)),
      class: str(r.class),
      category: str(r.category),
      subCategory: str(r.sub_category),
    }));
  }

  setRules(rules: Rule[]): void {
    this.transaction(() => {
      this.db.run("DELETE FROM rules");
      this.insertMany(
        "INSERT INTO rules(id, position, account, description, info, amount, class, category, sub_category) VALUES (?,?,?,?,?,?,?,?,?)",
        rules.map((r, i) => [r.id, i, r.account, r.description, r.info, r.amount, r.class, r.category, r.subCategory]),
      );
    });
  }

  getFixes(): Fix[] {
    return this.all("SELECT data FROM fixes ORDER BY rowid").map((r) => JSON.parse(str(r.data)) as Fix);
  }

  setFixes(fixes: Fix[]): void {
    this.transaction(() => {
      this.db.run("DELETE FROM fixes");
      this.insertMany(
        "INSERT INTO fixes(id, tx_id, data) VALUES (?, ?, ?)",
        fixes.map((f) => [f.id, f.txId, JSON.stringify(f)]),
      );
    });
  }

  getSplits(): Split[] {
    return this.all('SELECT start, "end", account, share, owner FROM splits ORDER BY position').map((r) => ({
      start: str(r.start),
      end: str(r.end),
      account: str(r.account),
      share: num(r.share),
      owner: str(r.owner),
    }));
  }

  setSplits(splits: Split[]): void {
    this.transaction(() => {
      this.db.run("DELETE FROM splits");
      this.insertMany(
        'INSERT INTO splits(position, start, "end", account, share, owner) VALUES (?,?,?,?,?,?)',
        splits.map((s, i) => [i, s.start, s.end, s.account, s.share, s.owner]),
      );
    });
  }

  getTargets(): Target[] {
    return this.all("SELECT * FROM targets ORDER BY position").map((r) => ({
      name: str(r.name),
      start: str(r.start),
      end: str(r.end),
      owner: str(r.owner),
      monthlyAmount: num(r.monthly_amount),
      class: str(r.class),
      category: str(r.category),
      subCategory: str(r.sub_category),
    }));
  }

  setTargets(targets: Target[]): void {
    this.transaction(() => {
      this.db.run("DELETE FROM targets");
      this.insertMany(
        'INSERT INTO targets(position, name, start, "end", owner, monthly_amount, class, category, sub_category) VALUES (?,?,?,?,?,?,?,?,?)',
        targets.map((t, i) => [i, t.name, t.start, t.end, t.owner, t.monthlyAmount, t.class, t.category, t.subCategory]),
      );
    });
  }

  // ---- duplicate decisions

  getDuplicateDecisions(): Map<string, string> {
    return new Map(this.all("SELECT pair, decision FROM duplicate_decisions").map((r) => [str(r.pair), str(r.decision)]));
  }

  /** decision: "keep" (distinct rows) or "drop:<txId>" (that row is a duplicate and leaves the ledger). */
  setDuplicateDecision(pair: string, decision: string): void {
    this.db.run(
      "INSERT INTO duplicate_decisions(pair, decision, decided_at) VALUES (?, ?, ?) ON CONFLICT(pair) DO UPDATE SET decision = excluded.decision, decided_at = excluded.decided_at",
      [pair, decision, new Date().toISOString()],
    );
  }

  removeDuplicateDecision(pair: string): void {
    this.db.run("DELETE FROM duplicate_decisions WHERE pair = ?", [pair]);
  }

  // ---- source files and raw rows

  /** Stores a source file; a file with the same content is stored once and its id returned. */
  addSourceFile(name: string, bytes: Uint8Array, profileId: string): { id: number; existed: boolean } {
    const hash = sha256Bytes(bytes);
    const hit = this.all("SELECT id FROM source_files WHERE hash = ?", [hash])[0];
    if (hit) return { id: num(hit.id), existed: true };
    this.forgetRows();
    this.db.run("INSERT INTO source_files(name, hash, size, bytes, profile_id, imported_at) VALUES (?,?,?,?,?,?)", [
      name,
      hash,
      bytes.length,
      bytes,
      profileId,
      new Date().toISOString(),
    ]);
    return { id: num(this.db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] ?? null), existed: false };
  }

  getSourceFiles(): SourceFileInfo[] {
    return this.all(
      `SELECT f.id, f.name, f.hash, f.size, f.profile_id, f.imported_at, count(r.tx_id) AS row_count
       FROM source_files f LEFT JOIN raw_rows r ON r.source_file_id = f.id
       GROUP BY f.id ORDER BY f.id`,
    ).map((r) => ({
      id: num(r.id),
      name: str(r.name),
      hash: str(r.hash),
      size: num(r.size),
      profileId: str(r.profile_id),
      importedAt: str(r.imported_at),
      rowCount: num(r.row_count),
    }));
  }

  getSourceFileBytes(id: number): Uint8Array | null {
    const r = this.all("SELECT bytes FROM source_files WHERE id = ?", [id])[0];
    return r && r.bytes instanceof Uint8Array ? r.bytes : null;
  }

  setSourceFileProfile(id: number, profileId: string): void {
    this.forgetRows();
    this.db.run("UPDATE source_files SET profile_id = ? WHERE id = ?", [profileId, id]);
  }

  addRawRows(sourceFileId: number, rows: SourceRow[]): void {
    this.forgetRows();
    this.transaction(() => {
      const start = num(
        this.db.exec("SELECT coalesce(max(row_index) + 1, 0) FROM raw_rows WHERE source_file_id = ?", [sourceFileId])[0]?.values[0]?.[0] ??
          0,
      );
      this.insertMany(
        "INSERT INTO raw_rows(tx_id, source_file_id, row_index, content_hash, occurrence, columns) VALUES (?,?,?,?,?,?)",
        rows.map((r, i) => [r.txId, sourceFileId, start + i, r.contentHash, r.occurrence, JSON.stringify(r.columns)]),
      );
    });
  }

  deleteRawRows(sourceFileId: number): void {
    this.forgetRows();
    this.db.run("DELETE FROM raw_rows WHERE source_file_id = ?", [sourceFileId]);
  }

  /** Highest occurrence per content hash, the `existing` input of readSourceRows. */
  hashCounts(): Map<string, number> {
    return new Map(
      this.all("SELECT content_hash, max(occurrence) AS n FROM raw_rows GROUP BY content_hash").map((r) => [str(r.content_hash), num(r.n)]),
    );
  }

  /**
   * Every raw row with its fields derived from its file's current profile, so a profile change
   * re-derives description, info and the rest without re-importing anything.
   */
  getSourceRows(): SourceRow[] {
    this.cache.sourceRows ??= freezeRows(this.readSourceRows(), ["columns", "fields"]);
    return this.cache.sourceRows as SourceRow[];
  }

  private readSourceRows(): SourceRow[] {
    const profiles = new Map(this.getProfiles().map((p) => [p.id, p]));
    return this.all(
      `SELECT r.tx_id, r.content_hash, r.occurrence, r.columns, f.name, f.profile_id
       FROM raw_rows r JOIN source_files f ON f.id = r.source_file_id
       ORDER BY r.source_file_id, r.row_index`,
    ).map((r) => {
      const columns = JSON.parse(str(r.columns)) as Record<string, string>;
      const profile = profiles.get(str(r.profile_id));
      if (!profile) throw new ProjectFileError(`profile ${str(r.profile_id)} of ${str(r.name)} is missing`);
      return {
        txId: str(r.tx_id),
        contentHash: str(r.content_hash),
        occurrence: num(r.occurrence),
        sourceFile: str(r.name),
        columns,
        fields: normalizeRow(columns, profile),
      };
    });
  }

  // ---- ledger

  /** The members the ledger's rows belong to (one query, without reading every row). */
  getLedgerOwners(): string[] {
    return this.all("SELECT DISTINCT owner FROM ledger").map((r) => str(r.owner));
  }

  getLedger(): LedgerRow[] {
    this.cache.ledger ??= freezeRows(this.readLedger(), []);
    return this.cache.ledger as LedgerRow[];
  }

  private readLedger(): LedgerRow[] {
    return this.all("SELECT * FROM ledger ORDER BY date DESC, row_id").map((r) => ({
      rowId: str(r.row_id),
      txId: str(r.tx_id),
      date: str(r.date),
      month: str(r.month),
      account: str(r.account),
      description: str(r.description),
      info: str(r.info),
      amountOriginal: num(r.amount_original),
      class: str(r.class),
      category: str(r.category),
      subCategory: str(r.sub_category),
      ruleId: str(r.rule_id),
      sourceFile: str(r.source_file),
      rowType: str(r.row_type) === "Target" ? "Target" : "Actual",
      share: num(r.share),
      amount: num(r.amount),
      owner: str(r.owner),
      split: num(r.split) === 1,
    }));
  }

  /** Replaces the ledger rows of the given months (all months when `months` is undefined). */
  replaceLedger(rows: LedgerRow[], months?: ReadonlySet<string>): void {
    this.forgetLedger();
    this.transaction(() => {
      if (months === undefined) {
        this.db.run("DELETE FROM ledger");
      } else {
        const stmt = this.db.prepare("DELETE FROM ledger WHERE month = ?");
        try {
          for (const m of months) stmt.run([m]);
        } finally {
          stmt.free();
        }
      }
      const keep = months === undefined ? rows : rows.filter((r) => months.has(r.month));
      this.insertMany(
        `INSERT INTO ledger(row_id, tx_id, date, month, account, description, info, amount_original, class, category,
           sub_category, rule_id, source_file, row_type, share, amount, owner, split)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        keep.map((r) => [
          r.rowId,
          r.txId,
          r.date,
          r.month,
          r.account,
          r.description,
          r.info,
          r.amountOriginal,
          r.class,
          r.category,
          r.subCategory,
          r.ruleId,
          r.sourceFile,
          r.rowType,
          r.share,
          r.amount,
          r.owner,
          r.split ? 1 : 0,
        ]),
      );
    });
  }

  counts(): ProjectCounts {
    const one = (sql: string) => num(this.db.exec(sql)[0]?.values[0]?.[0] ?? null);
    return {
      sourceFiles: one("SELECT count(*) FROM source_files"),
      rawRows: one("SELECT count(*) FROM raw_rows"),
      ledgerRows: one("SELECT count(*) FROM ledger"),
      rules: one("SELECT count(*) FROM rules"),
    };
  }
}

/** Freezes an array, its rows and the given nested objects of each row (the cached copies are shared). */
function freezeRows<T extends object>(rows: T[], nested: (keyof T)[]): readonly T[] {
  for (const r of rows) {
    for (const k of nested) Object.freeze(r[k]);
    Object.freeze(r);
  }
  return Object.freeze(rows);
}
