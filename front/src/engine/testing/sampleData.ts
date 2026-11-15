// Test helper: runs the engine over the repo's sample data (fixtures/v2: data/source_files + config/) the way
// the Python v2 pipeline does. Node only; never imported by the app.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fixesFromV2Csv, mapFixesToTxIds, profileFromV2Yaml, rulesFromV2Csv, splitsFromV2Csv, targetsFromV2Csv } from "../legacy/v2";
import { processRows, type PipelineResult } from "../pipeline";
import { nordnetPortfolio } from "../preprocessors/nordnet_portfolio";
import { matchProfile } from "../profiles";
import { readSourceRows, readTable } from "../read";
import type { SourceProfile, SourceRow, Table } from "../types";

/** The v2 sample folders (config/ and data/), kept as test input. */
export const REPO = resolve(__dirname, "../../../fixtures/v2");
export const SOURCE_DIR = join(REPO, "data/source_files");
export const CONFIG_DIR = join(REPO, "config");
export const NORDNET_RAW = join(SOURCE_DIR, "for_preprocessors/nordnet/nordnet_salkkuraportti.csv");
export const NORDNET_PREPROCESSED = "nordnet_salkkuraportti_preprocessed.csv";

export function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

export function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

export function sampleProfiles(): SourceProfile[] {
  const dir = join(CONFIG_DIR, "source_file_reader");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml"))
    .sort()
    .map((f) => profileFromV2Yaml(readText(join(dir, f)), f));
}

export interface SampleFile {
  fileName: string;
  profile: SourceProfile;
  table: Table;
}

/** Source files with their profile and table; the Nordnet table comes from the raw report, as Python regenerates it. */
export function sampleFiles(): SampleFile[] {
  const profiles = sampleProfiles();
  return readdirSync(SOURCE_DIR)
    .filter((f) => statSync(join(SOURCE_DIR, f)).isFile())
    .sort()
    .map((fileName) => {
      const profile = matchProfile(fileName, profiles);
      if (!profile) throw new Error(`no profile for ${fileName}`);
      const table =
        fileName === NORDNET_PREPROCESSED
          ? nordnetPortfolio(readBytes(NORDNET_RAW))
          : readTable(fileName, readBytes(join(SOURCE_DIR, fileName)), profile);
      return { fileName, profile, table };
    });
}

export function sampleSourceRows(): SourceRow[] {
  const existing = new Map<string, number>();
  return sampleFiles().flatMap((f) => {
    const res = readSourceRows(f.fileName, f.table, f.profile, existing);
    for (const r of res.rows) existing.set(r.contentHash, Math.max(existing.get(r.contentHash) ?? 0, r.occurrence));
    return res.rows;
  });
}

/** The raw sample input as the browser bundle provides it. */
export function sampleInputFromDisk(): import("./sampleProject").SampleInput {
  const walk = (dir: string, prefix = ""): { path: string; bytes: Uint8Array }[] =>
    readdirSync(dir).flatMap((f) => {
      const full = join(dir, f);
      return statSync(full).isDirectory() ? walk(full, `${prefix}${f}/`) : [{ path: `${prefix}${f}`, bytes: readBytes(full) }];
    });
  const yml = join(CONFIG_DIR, "source_file_reader");
  const dp = join(CONFIG_DIR, "data_processing");
  return {
    sourceFiles: walk(SOURCE_DIR),
    profileYmls: readdirSync(yml)
      .filter((f) => f.endsWith(".yml"))
      .map((name) => ({ name, text: readText(join(yml, name)) })),
    categoriesCsv: readText(join(dp, "categories.csv")),
    splitsCsv: readText(join(dp, "splits.csv")),
    targetsCsv: readText(join(dp, "targets.csv")),
    fixesCsv: readText(join(dp, "fixes.csv")),
  };
}

export function runSample(owner = "mkk"): PipelineResult & { unmatchedFixes: number } {
  const dp = join(CONFIG_DIR, "data_processing");
  const rules = rulesFromV2Csv(readText(join(dp, "categories.csv")));
  const splits = splitsFromV2Csv(readText(join(dp, "splits.csv")));
  const targets = targetsFromV2Csv(readText(join(dp, "targets.csv")));
  const rows = sampleSourceRows();
  const base = { rules, splits, targets: [], fixes: [], defaultOwner: owner };
  const unfixed = processRows(rows, base);
  const mapping = mapFixesToTxIds(fixesFromV2Csv(readText(join(dp, "fixes.csv"))), unfixed.ledger);
  const result = processRows(rows, { ...base, fixes: mapping.fixes, targets });
  return { ...result, unmatchedFixes: mapping.unmatched.length };
}
