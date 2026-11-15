// Migration from the Python v2 pipeline: finds the v2 config and source files in a folder the user
// picked, builds a v3 project from them, and compares the result with v2's final_data.csv by month
// and class. Reads files only; never .env (paths come from the folder the user picks). No DOM.
import { fixesFromV2Csv, mapFixesToTxIds, profileFromV2Yaml, rulesFromV2Csv, splitsFromV2Csv, targetsFromV2Csv } from "../engine/legacy/v2";
import { compileRules, ruleMatches } from "../engine/categorize";
import { matchProfile } from "../engine/profiles";
import { readTable } from "../engine/read";
import { decodeText } from "../engine/decode";
import { parseCsv } from "../engine/tables";
import type { LedgerRow, SourceProfile } from "../engine/types";
import type { Project } from "../storage/project";
import { ensureAccountOwners, importFile, processProject, rebuildLedger } from "./service";

export interface PickedFile {
  /** Path inside the picked folder, "/" separated. */
  path: string;
  bytes: Uint8Array;
}

/** What the picked folder holds, by v2 role. */
export interface V2Found {
  profiles: PickedFile[];
  categories: PickedFile | null;
  splits: PickedFile | null;
  targets: PickedFile | null;
  fixes: PickedFile | null;
  /** Files directly in data/source_files (the ones v2 imports). */
  sources: PickedFile[];
  /** data/source_files/for_preprocessors/nordnet/nordnet_salkkuraportti.csv */
  nordnetRaw: PickedFile | null;
  /** data/final/final_data.csv: only compared with, never imported. */
  finalData: PickedFile | null;
  /** Files in the folder that the migration does not read. */
  skipped: number;
}

const NORDNET_PREPROCESSED = "nordnet_salkkuraportti_preprocessed.csv";

const V2_PATHS = [
  /(^|\/)source_file_reader\/[^/]+\.ya?ml$/,
  /(^|\/)data_processing\/(categories|splits|targets|fixes)\.csv$/,
  /(^|\/)source_files\/[^/]+$/,
  /(^|\/)source_files\/for_preprocessors\/nordnet\/nordnet_salkkuraportti\.csv$/,
  /(^|\/)final\/final_data\.csv$/,
];

/** True for a path the migration reads; only those files are opened (never .env or code). */
export function isV2Path(path: string): boolean {
  const p = path.replace(/\\/g, "/").toLowerCase();
  return V2_PATHS.some((re) => re.test(p)) && !p.endsWith("/.gitkeep");
}

/** Sorts the picked files into v2 roles by their path (the folders may sit anywhere in the pick). */
export function findV2Files(files: PickedFile[]): V2Found {
  const out: V2Found = {
    profiles: [],
    categories: null,
    splits: null,
    targets: null,
    fixes: null,
    sources: [],
    nordnetRaw: null,
    finalData: null,
    skipped: 0,
  };
  for (const f of files) {
    const p = f.path.replace(/\\/g, "/");
    const lower = p.toLowerCase();
    if (/(^|\/)source_file_reader\/[^/]+\.ya?ml$/.test(lower)) out.profiles.push(f);
    else if (/(^|\/)data_processing\/categories\.csv$/.test(lower)) out.categories = f;
    else if (/(^|\/)data_processing\/splits\.csv$/.test(lower)) out.splits = f;
    else if (/(^|\/)data_processing\/targets\.csv$/.test(lower)) out.targets = f;
    else if (/(^|\/)data_processing\/fixes\.csv$/.test(lower)) out.fixes = f;
    else if (/(^|\/)source_files\/for_preprocessors\/nordnet\/nordnet_salkkuraportti\.csv$/.test(lower)) out.nordnetRaw = f;
    else if (/(^|\/)source_files\/[^/]+$/.test(lower) && !lower.endsWith("/.gitkeep")) out.sources.push(f);
    else if (/(^|\/)final\/final_data\.csv$/.test(lower)) out.finalData = f;
    else out.skipped++;
  }
  out.profiles.sort((a, b) => a.path.localeCompare(b.path));
  out.sources.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export interface MigrateOptions {
  projectName: string;
  /** v2's DEFAULT_OWNER (it lives in .env, which is not read). */
  defaultOwner: string;
  /** v2's USE_TARGETS. */
  useTargets: boolean;
  /** v2's USE_NORDNET_PORTFOLIO: read the raw Nordnet report through the built-in preprocessor. */
  useNordnet: boolean;
}

export interface MigratedFile {
  name: string;
  profile: string | null;
  rows: number;
  problems: number;
}

export interface ParityMonth {
  month: string;
  cls: string;
  v2: number;
  v3: number;
}

/** Rows that v2 and v3 handle differently, grouped by the cause. */
export interface ParityCause {
  /**
   * "rule": the same row got another classification; "v2"/"v3": the row is only on that side;
   * "dup": v2 has the row twice (from two files) and v3 once, since v3 imports a row only once.
   */
  kind: "rule" | "v2" | "v3" | "dup";
  /** Rule ids (kind "rule"), or the source file (kind "v2"/"v3"). */
  v2Rule: string;
  v3Rule: string;
  /** "class / category" on each side. */
  v2Class: string;
  v3Class: string;
  rows: number;
  /** Sum of the rows' amounts. */
  amount: number;
  /** One row's date and description, to find it. */
  example: string;
  /** Kind "rule": the v2 rule id is not among v3's rules, so it was not read. */
  v2Missing?: boolean;
  /** Kind "rule": the v2 id is a fix that found no row in v3. */
  v2FixUnmatched?: boolean;
  /** Kind "rule": the fields where the v2 rule does not match the example row in v3. */
  why?: RuleMiss[];
}

/** One field of a v2 rule that does not match a v3 row, with that row's value on both sides. */
export interface RuleMiss {
  field: "account" | "description" | "info" | "amount";
  pattern: string;
  v2: string;
  v3: string;
}

/** The fields a ledger row is matched on, as v2 and v3 have them. */
interface Fields {
  account: string;
  description: string;
  info: string;
  amount: number;
}

/** One total over all months on both sides. */
export interface ParityTotal {
  key: string;
  v2: number;
  v3: number;
}

export interface MigrateResult {
  profiles: number;
  rules: number;
  splits: number;
  targets: number;
  files: MigratedFile[];
  fixesMapped: number;
  fixesUnmatched: number;
  /** Month and class sums that differ from final_data.csv; null without final_data.csv. */
  parity: {
    months: number;
    rowsV2: number;
    rowsV3: number;
    differences: ParityMonth[];
    causes: ParityCause[];
    /** Totals over all months: every source file (v3's file names), and the "class / category" pairs that differ. */
    byFile: ParityTotal[];
    byClass: ParityTotal[];
  } | null;
}

const text = (f: PickedFile | null) => (f ? decodeText(f.bytes) : "");

/** Runs one step on a v2 file; an error names the file. */
function step<T>(file: PickedFile, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`${file.path}: ${msg}`);
  }
}
const base = (path: string) => path.split("/").pop() ?? path;

/** Builds the project from the v2 files. The project should be empty. */
export function migrateV2(project: Project, found: V2Found, opts: MigrateOptions): MigrateResult {
  let profiles: SourceProfile[] = found.profiles.map((f) => profileFromV2Yaml(text(f), base(f.path).replace(/\.ya?ml$/i, "")));
  const nordnet = opts.useNordnet && found.nordnetRaw !== null;
  if (nordnet) {
    profiles = profiles.map((p) =>
      p.filePattern === NORDNET_PREPROCESSED
        ? { ...p, name: "nordnet_salkkuraportti", filePattern: "nordnet_salkkuraportti\\.csv", preprocessor: "nordnet-portfolio" }
        : p,
    );
  }
  const rules = found.categories ? step(found.categories, () => rulesFromV2Csv(text(found.categories))) : [];
  if (found.categories) step(found.categories, () => compileRules(rules));
  const splits = found.splits ? step(found.splits, () => splitsFromV2Csv(text(found.splits))) : [];
  const targets = opts.useTargets && found.targets ? step(found.targets, () => targetsFromV2Csv(text(found.targets))) : [];
  project.setProfiles(profiles);
  project.setRules(rules);
  project.setSplits(splits);
  project.setTargets(targets);
  project.setSettings({ defaultOwner: opts.defaultOwner, projectName: opts.projectName });

  const files: MigratedFile[] = [];
  const sources = [
    ...found.sources.filter((f) => !(nordnet && base(f.path) === NORDNET_PREPROCESSED)),
    ...(nordnet ? [found.nordnetRaw!] : []),
  ].sort((a, b) => base(a.path).localeCompare(base(b.path)));
  profiles = withFileAccounts(profiles, sources);
  project.setProfiles(profiles);
  for (const f of sources) {
    const name = base(f.path);
    const profile = matchProfile(name, profiles);
    if (!profile) {
      files.push({ name, profile: null, rows: 0, problems: 0 });
      continue;
    }
    try {
      const s = importFile(project, name, f.bytes, profile);
      files.push({ name, profile: profile.name, rows: s.added, problems: s.problems.length });
    } catch {
      files.push({ name, profile: profile.name, rows: 0, problems: -1 });
    }
  }
  const v2fixes = found.fixes ? step(found.fixes, () => fixesFromV2Csv(text(found.fixes))) : [];
  const mapping = found.fixes
    ? step(found.fixes, () => mapFixesToTxIds(v2fixes, processProject(project).ledger))
    : { fixes: [], unmatched: [] };
  project.setFixes(mapping.fixes);
  // v2 gives an unsplit account's rows to the default owner; write that down as each account's owner
  ensureAccountOwners(project);
  rebuildLedger(project);

  return {
    profiles: profiles.length,
    rules: rules.length,
    splits: splits.length,
    targets: targets.length,
    files,
    fixesMapped: mapping.fixes.length,
    fixesUnmatched: mapping.unmatched.length,
    parity: found.finalData
      ? markMissing(
          compareWithFinalData(
            project.getLedger(),
            text(found.finalData),
            nordnet ? { [NORDNET_PREPROCESSED]: base(found.nordnetRaw!.path) } : {},
          ),
          project,
          mapping.unmatched.map((f) => f.id),
        )
      : null,
  };
}

/**
 * v2 sets the profile's account only on files without an "account" column (s_03_loader), so a file
 * that has one keeps its own accounts. A profile whose files all have that column reads it.
 */
function withFileAccounts(profiles: SourceProfile[], sources: PickedFile[]): SourceProfile[] {
  return profiles.map((p) => {
    if (p.accountColumn) return p;
    // a column mapped to another field is renamed in v2, so "account" no longer exists there
    const used = [p.columns.date, p.columns.amount, ...p.columns.description, ...p.columns.info];
    if (used.includes("account")) return p;
    const mine = sources.filter((f) => matchProfile(base(f.path), profiles) === p);
    if (mine.length === 0) return p;
    const all = mine.every((f) => {
      try {
        return readTable(base(f.path), f.bytes, p).headers.includes("account");
      } catch {
        return false;
      }
    });
    return all ? { ...p, accountColumn: "account" } : p;
  });
}

/** Marks the causes whose v2 rule or fix did not make it into the project, and says where a v2 rule fails on v3's row. */
function markMissing(
  parity: NonNullable<MigrateResult["parity"]>,
  project: Project,
  unmatchedFixes: string[],
): NonNullable<MigrateResult["parity"]> {
  const rules = new Map(project.getRules().map((r) => [r.id, r]));
  const fixes = new Set(project.getFixes().map((f) => f.id));
  for (const c of parity.causes) {
    if (c.kind !== "rule" || !c.v2Rule) continue;
    const rule = rules.get(c.v2Rule);
    if (!rule) {
      if (unmatchedFixes.includes(c.v2Rule)) c.v2FixUnmatched = true;
      else if (!fixes.has(c.v2Rule)) c.v2Missing = true;
      continue;
    }
    const pair = samples.get(c);
    if (!pair) continue;
    const [compiled] = compileRules([rule]);
    const why: RuleMiss[] = [];
    for (const field of ["account", "description", "info"] as const) {
      const re = compiled![field];
      if (re && !re.test(pair.v3[field])) why.push({ field, pattern: rule[field], v2: pair.v2[field], v3: pair.v3[field] });
    }
    const one = { ...pair.v3, account: "", description: "", info: "" };
    if (!ruleMatches({ ...compiled!, account: null, description: null, info: null }, one)) {
      why.push({ field: "amount", pattern: rule.amount, v2: String(pair.v2.amount), v3: String(pair.v3.amount) });
    }
    c.why = why;
  }
  return parity;
}

/** The first v2 and v3 row of each cause, to explain it. */
const samples = new WeakMap<ParityCause, { v2: Fields; v3: Fields }>();

/** Sums by month and class in v3's ledger and in final_data.csv; the pairs that differ by a cent or more. */
export function compareWithFinalData(
  ledger: LedgerRow[],
  finalCsv: string,
  /** v2 file name to v3's, for a file v2 read through its own preprocessor. */
  fileAlias: Record<string, string> = {},
): NonNullable<MigrateResult["parity"]> {
  const t = parseCsv(finalCsv, { delimiter: "," });
  const col = (name: string) => t.headers.indexOf(name);
  const [iDate, iClass, iAmount] = [col("date"), col("class"), col("amount")];
  const sums = new Map<string, { v2: number; v3: number }>();
  const add = (key: string, side: "v2" | "v3", v: number) => {
    const s = sums.get(key) ?? { v2: 0, v3: 0 };
    s[side] += v;
    sums.set(key, s);
  };
  const [iDesc, iCat, iRule, iOwner, iFile, iAcc, iInfo] = [
    col("description"),
    col("category"),
    col("rule_id"),
    col("owner"),
    col("source_file"),
    col("account"),
    col("info"),
  ];
  const v2rows: Side[] = [];
  for (const r of t.rows) {
    const date = r[iDate] ?? "";
    if (!/^\d{4}-\d{2}/.test(date)) continue;
    const amount = Number(r[iAmount]) || 0;
    v2rows.push({
      date: date.slice(0, 10),
      account: r[iAcc] ?? "",
      description: r[iDesc] ?? "",
      info: r[iInfo] ?? "",
      owner: r[iOwner] ?? "",
      amount,
      cls: r[iClass] ?? "",
      category: r[iCat] ?? "",
      rule: r[iRule] ?? "",
      file: r[iFile] ?? "",
    });
    add(`${date.slice(0, 7)}|${(r[iClass] ?? "").toLowerCase()}`, "v2", amount);
  }
  for (const r of ledger) add(`${r.month}|${r.class.toLowerCase()}`, "v3", r.amount);
  const rowsV2 = v2rows.length;
  const differences: ParityMonth[] = [];
  for (const [key, s] of sums) {
    if (Math.abs(s.v2 - s.v3) >= 0.01) {
      const [month, cls] = key.split("|") as [string, string];
      differences.push({ month, cls, v2: s.v2, v3: s.v3 });
    }
  }
  differences.sort((a, b) => a.month.localeCompare(b.month) || a.cls.localeCompare(b.cls));
  const causes = differences.length === 0 ? [] : parityCauses(v2rows, ledger);
  const v2totals = v2rows.map((r) => ({ ...r, file: fileAlias[r.file] ?? r.file }));
  const v3rows = ledger.map((l) => ({ file: l.sourceFile, cls: l.class, category: l.category, amount: l.amount }));
  const classKey = (r: { cls: string; category: string }) => `${r.cls || "-"} / ${r.category || "-"}`.toLowerCase();
  return {
    months: new Set([...sums.keys()].map((k) => k.slice(0, 7))).size,
    rowsV2,
    rowsV3: ledger.length,
    differences,
    causes,
    byFile: totalsBy(v2totals, v3rows, (r) => r.file, true),
    byClass: differences.length === 0 ? [] : totalsBy(v2totals, v3rows, classKey, false),
  };
}

/** Sums both sides by a key, largest difference first; without `all`, only the keys that differ by a cent or more. */
function totalsBy<R extends { amount: number }>(v2rows: R[], v3rows: R[], keyOf: (r: R) => string, all: boolean): ParityTotal[] {
  const m = new Map<string, ParityTotal>();
  const add = (r: R, side: "v2" | "v3") => {
    const key = keyOf(r);
    const s = m.get(key) ?? { key, v2: 0, v3: 0 };
    s[side] += r.amount;
    m.set(key, s);
  };
  for (const r of v2rows) add(r, "v2");
  for (const r of v3rows) add(r, "v3");
  return [...m.values()].filter((s) => all || Math.abs(s.v3 - s.v2) >= 0.01).sort((a, b) => Math.abs(b.v3 - b.v2) - Math.abs(a.v3 - a.v2));
}

interface Side extends Fields {
  date: string;
  owner: string;
  cls: string;
  category: string;
  rule: string;
  file: string;
}

/** Pairs v2 and v3 rows by date, amount, description and owner, and groups the rows that differ. */
function parityCauses(v2rows: Side[], ledger: LedgerRow[]): ParityCause[] {
  const key = (r: Side) => `${r.date}|${Math.round(r.amount * 100)}|${r.description.trim().toLowerCase()}|${r.owner.trim().toLowerCase()}`;
  const label = (r: Side) => `${r.cls || "-"} / ${r.category || "-"}`;
  const pool = new Map<string, Side[]>();
  for (const r of v2rows) {
    const k = key(r);
    pool.set(k, [...(pool.get(k) ?? []), r]);
  }
  const groups = new Map<string, ParityCause>();
  const count = (c: Omit<ParityCause, "rows" | "amount" | "example">, r: Side, other?: Side) => {
    const k = [c.kind, c.v2Rule, c.v3Rule, c.v2Class, c.v3Class].join("|");
    let g = groups.get(k);
    if (!g) {
      g = { ...c, rows: 0, amount: 0, example: `${r.date} ${r.description}` };
      if (other) samples.set(g, { v2: other, v3: r });
    }
    g.rows++;
    g.amount += r.amount;
    groups.set(k, g);
  };
  for (const l of ledger) {
    const v3: Side = {
      date: l.date,
      account: l.account,
      description: l.description,
      info: l.info,
      owner: l.owner,
      amount: l.amount,
      cls: l.class,
      category: l.category,
      rule: l.ruleId,
      file: l.sourceFile,
    };
    const list = pool.get(key(v3));
    const v2 = list?.shift();
    if (!v2) {
      count({ kind: "v3", v2Rule: "", v3Rule: v3.file, v2Class: "", v3Class: label(v3) }, v3);
      continue;
    }
    if (v2.cls.toLowerCase() !== v3.cls.toLowerCase() || v2.category.toLowerCase() !== v3.category.toLowerCase()) {
      count({ kind: "rule", v2Rule: v2.rule, v3Rule: v3.rule, v2Class: label(v2), v3Class: label(v3) }, v3, v2);
    }
  }
  const inV3 = new Set(ledger.map((l) => key({ date: l.date, description: l.description, owner: l.owner, amount: l.amount } as Side)));
  for (const list of pool.values()) {
    for (const v2 of list)
      count({ kind: inV3.has(key(v2)) ? "dup" : "v2", v2Rule: v2.file, v3Rule: "", v2Class: label(v2), v3Class: "" }, v2);
  }
  return [...groups.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || b.rows - a.rows);
}

/** The folder a v2 file belongs to: its config folder (above source_file_reader or data_processing) or its data folder (above source_files or final). */
export function v2Root(path: string): { kind: "config" | "data"; root: string } | null {
  const p = path.replace(/\\/g, "/");
  const c = /^(.*?)\/?(?:source_file_reader|data_processing)\/[^/]+$/i.exec(p);
  if (c) return { kind: "config", root: c[1] ?? "" };
  const d = /^(.*?)\/?(?:source_files\/.+|final\/final_data\.csv)$/i.exec(p);
  return d ? { kind: "data", root: d[1] ?? "" } : null;
}

/** Every config and data folder in the pick; more than one of either means several v2 copies. */
export function v2Roots(files: PickedFile[]): { configs: string[]; datas: string[] } {
  const configs = new Set<string>();
  const datas = new Set<string>();
  for (const f of files) {
    const r = v2Root(f.path);
    if (r?.kind === "config") configs.add(r.root);
    else if (r?.kind === "data") datas.add(r.root);
  }
  return { configs: [...configs].sort(), datas: [...datas].sort() };
}

/** Keeps the files of one config folder and one data folder. */
export function pickRoots(files: PickedFile[], config: string, data: string): PickedFile[] {
  return files.filter((f) => {
    const r = v2Root(f.path);
    return r !== null && r.root === (r.kind === "config" ? config : data);
  });
}
