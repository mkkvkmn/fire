// Test helper: builds a project from the v2 sample data (fixtures/v2: data/source_files and config/),
// read from disk by sampleData.ts. Never imported by the app.
import { fixesFromV2Csv, mapFixesToTxIds, profileFromV2Yaml, rulesFromV2Csv, splitsFromV2Csv, targetsFromV2Csv } from "../legacy/v2";
import { matchProfile } from "../profiles";
import type { SourceProfile } from "../types";
import type { Project } from "../../storage/project";
import { importFile, processProject, rebuildLedger, type ImportSummary } from "../../project/service";

export interface SampleInput {
  /** Files under data/source_files, path relative to it (e.g. "for_preprocessors/nordnet/x.csv"). */
  sourceFiles: { path: string; bytes: Uint8Array }[];
  /** config/source_file_reader/*.yml */
  profileYmls: { name: string; text: string }[];
  categoriesCsv: string;
  splitsCsv: string;
  targetsCsv: string;
  fixesCsv: string;
}

export const SAMPLE_OWNER = "mkk";
const NORDNET_RAW = "for_preprocessors/nordnet/nordnet_salkkuraportti.csv";
const NORDNET_PREPROCESSED = "nordnet_salkkuraportti_preprocessed.csv";

/** The sample profiles; the Nordnet one reads the raw report through the built-in preprocessor. */
export function sampleProfiles(input: SampleInput): SourceProfile[] {
  const profiles = [...input.profileYmls].sort((a, b) => a.name.localeCompare(b.name)).map((y) => profileFromV2Yaml(y.text, y.name));
  return profiles.map((p) =>
    p.filePattern === NORDNET_PREPROCESSED
      ? { ...p, name: "nordnet_salkkuraportti", filePattern: "nordnet_salkkuraportti\\.csv", preprocessor: "nordnet-portfolio" }
      : p,
  );
}

export interface SampleResult {
  imports: ImportSummary[];
  unmatchedFixes: number;
}

export function loadSample(project: Project, input: SampleInput): SampleResult {
  const profiles = sampleProfiles(input);
  project.setProfiles(profiles);
  project.setRules(rulesFromV2Csv(input.categoriesCsv));
  project.setSplits(splitsFromV2Csv(input.splitsCsv));
  project.setTargets(targetsFromV2Csv(input.targetsCsv));
  project.setSettings({ defaultOwner: SAMPLE_OWNER });

  const imports: ImportSummary[] = [];
  const files = input.sourceFiles
    .filter((f) => f.path === NORDNET_RAW || (!f.path.includes("/") && f.path !== NORDNET_PREPROCESSED))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const f of files) {
    const name = f.path.split("/").pop() ?? f.path;
    const profile = matchProfile(name, profiles);
    if (!profile) throw new Error(`no sample profile for ${name}`);
    imports.push(importFile(project, name, f.bytes, profile));
  }

  // v2 fixes point at old ids; find their rows in the unfixed ledger.
  const mapping = mapFixesToTxIds(fixesFromV2Csv(input.fixesCsv), processProject(project).ledger);
  project.setFixes(mapping.fixes);
  rebuildLedger(project);
  return { imports, unmatchedFixes: mapping.unmatched.length };
}
