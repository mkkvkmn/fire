// Tests for the v2 migration, run on the v2 sample folders (fixtures/v2: config/ and data/), which is the
// layout a v2 user has.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { findV2Files, migrateV2, pickRoots, v2Roots, type PickedFile } from "./migrate";

const REPO = join(import.meta.dirname, "../../fixtures/v2");

function pick(dirs: string[]): PickedFile[] {
  const out: PickedFile[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push({ path: relative(REPO, full).replace(/\\/g, "/"), bytes: new Uint8Array(readFileSync(full)) });
    }
  };
  for (const d of dirs) walk(join(REPO, d));
  return out;
}

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

describe("v2 migration", () => {
  it("finds every v2 file by its role and skips the rest", () => {
    const f = findV2Files(pick(["config", "data"]));
    expect(f.profiles.length).toBe(10);
    expect([f.categories, f.splits, f.targets, f.fixes, f.nordnetRaw, f.finalData].every(Boolean)).toBe(true);
    expect(f.sources.map((x) => x.path.split("/").pop())).toContain("s-pankki_2024_01-2024_12.csv");
    expect(f.skipped).toBeGreaterThan(0); // files.csv: not a v2 input
  });

  it("rebuilds the v2 sample project and matches final_data.csv month by month", () => {
    const p = Project.create(SQL);
    const r = migrateV2(p, findV2Files(pick(["config", "data"])), {
      projectName: "v2",
      defaultOwner: "mkk",
      useTargets: true,
      useNordnet: true,
    });
    expect(r.files.filter((x) => x.profile === null)).toEqual([]);
    expect(r.fixesUnmatched).toBe(0);
    expect(r.parity?.differences).toEqual([]);
    expect(r.parity?.months).toBeGreaterThan(20);
    // every account has an explicit owner, so the default owner is only a suggestion afterwards
    const owners = p.getSettings().accountOwners;
    expect([...new Set(p.getSourceRows().map((x) => x.fields.account))].filter((a) => a && !owners[a])).toEqual([]);
  });

  it("traces a difference to the rule that classified the rows", () => {
    const files = pick(["config", "data"]).map((f) => {
      if (!f.path.endsWith("data_processing/categories.csv")) return f;
      const text = new TextDecoder().decode(f.bytes).replace(/^1,,Asunto,,pos,varat,asunto,/m, "1,,Asunto,,pos,menot,asunto,");
      return { ...f, bytes: new TextEncoder().encode(text) };
    });
    const p = Project.create(SQL);
    const r = migrateV2(p, findV2Files(files), { projectName: "v2", defaultOwner: "mkk", useTargets: true, useNordnet: true });
    expect(r.parity?.differences.length).toBeGreaterThan(0);
    const causes = r.parity?.causes ?? [];
    // every row pairs up (no "v2"/"v3" kinds); a fixed row carries its fix id as the rule
    expect(causes.map((c) => [c.kind, c.v2Rule, c.v3Rule, c.v2Class, c.v3Class]).sort()).toEqual([
      ["rule", "1", "1", "varat / asunto", "menot / asunto"],
      ["rule", "f1", "f1", "varat / asunto", "menot / asunto"],
    ]);
    // by class: the amount moved from one class to the other; by file: nothing moved between files
    expect(r.parity?.byClass.map((x) => x.key).sort()).toEqual(["menot / asunto", "varat / asunto"]);
    expect(r.parity?.byFile.filter((x) => Math.abs(x.v3 - x.v2) >= 0.01)).toEqual([]);
    expect(r.parity?.byFile.map((x) => x.key)).toContain("nordnet_salkkuraportti.csv"); // v2's preprocessed name maps to v3's
  });

  it("names the field where a v2 rule fails on v3's row", () => {
    const files = pick(["config", "data"]).map((f) => {
      if (!f.path.endsWith("data_processing/categories.csv")) return f;
      const text = new TextDecoder().decode(f.bytes).replace(/^1,,Asunto,,pos,/m, "1,,Asunto X,,pos,");
      return { ...f, bytes: new TextEncoder().encode(text) };
    });
    const r = migrateV2(Project.create(SQL), findV2Files(files), {
      projectName: "v2",
      defaultOwner: "mkk",
      useTargets: true,
      useNordnet: true,
    });
    const c = (r.parity?.causes ?? []).find((x) => x.v2Rule === "1");
    expect(c?.why?.map((w) => [w.field, w.pattern, w.v3])).toEqual([["description", "Asunto X", "Asunto"]]);
  });

  it("keeps a source file's own account column, as v2 does", () => {
    const files = pick(["config", "data"]).map((f) => {
      if (!f.path.endsWith("source_files/varat.csv")) return f;
      const lines = new TextDecoder().decode(f.bytes).trimEnd().split(/\r?\n/);
      const text = lines.map((l, i) => `${l},${i === 0 ? "account" : "va"}`).join("\n");
      return { ...f, bytes: new TextEncoder().encode(text) };
    });
    const p = Project.create(SQL);
    migrateV2(p, findV2Files(files), { projectName: "v2", defaultOwner: "mkk", useTargets: true, useNordnet: true });
    const accounts = new Set(
      p
        .getLedger()
        .filter((r) => r.sourceFile === "varat.csv")
        .map((r) => r.account),
    );
    expect([...accounts]).toEqual(["va"]);
  });

  it("tells a row that v2 counted twice from a row v3 lost", () => {
    const files = pick(["config", "data"]).map((f) => {
      if (!f.path.endsWith("final/final_data.csv")) return f;
      const lines = new TextDecoder().decode(f.bytes).trimEnd().split(/\r?\n/);
      const twice = lines.find((l) => l.includes(",menot.csv,"))!.replace(",menot.csv,", ",menot_copy.csv,");
      return { ...f, bytes: new TextEncoder().encode([...lines, twice].join("\n")) };
    });
    const r = migrateV2(Project.create(SQL), findV2Files(files), {
      projectName: "v2",
      defaultOwner: "mkk",
      useTargets: true,
      useNordnet: true,
    });
    expect(r.parity?.causes.map((c) => [c.kind, c.rows])).toEqual([["dup", 1]]);
  });

  it("finds a fix's row when v2 had it from another file", () => {
    const files = pick(["config", "data"]).map((f) => {
      if (!f.path.endsWith("data_processing/fixes.csv")) return f;
      const text = new TextDecoder().decode(f.bytes).replace("__varatcsv__", "__vanhatvaratcsv__");
      return { ...f, bytes: new TextEncoder().encode(text) };
    });
    const r = migrateV2(Project.create(SQL), findV2Files(files), {
      projectName: "v2",
      defaultOwner: "mkk",
      useTargets: true,
      useNordnet: true,
    });
    expect([r.fixesMapped, r.fixesUnmatched]).toEqual([1, 0]);
  });

  it("marks a v2 rule that did not make it into v3", () => {
    const files = pick(["config", "data"]).map((f) => {
      if (!f.path.endsWith("data_processing/categories.csv")) return f;
      const text = new TextDecoder().decode(f.bytes).replace(/^1,,Asunto,,pos,varat,asunto,\r?\n/m, "");
      return { ...f, bytes: new TextEncoder().encode(text) };
    });
    const r = migrateV2(Project.create(SQL), findV2Files(files), {
      projectName: "v2",
      defaultOwner: "mkk",
      useTargets: true,
      useNordnet: true,
    });
    const missing = (r.parity?.causes ?? []).filter((c) => c.v2Missing).map((c) => c.v2Rule);
    expect(missing).toEqual(["1"]);
  });

  it("keeps every v2 fix when fix ids are empty or repeat", () => {
    const files = pick(["config", "data"]).map((f) => {
      if (!f.path.endsWith("data_processing/fixes.csv")) return f;
      const text = new TextDecoder().decode(f.bytes).trimEnd().replace(/\r\n/g, "\n");
      const row = text.split(/\r?\n/)[1]!;
      const blank = row.replace(/^f1,/, ",");
      return { ...f, bytes: new TextEncoder().encode([text, row, blank, blank, ""].join("\n")) };
    });
    const p = Project.create(SQL);
    const r = migrateV2(p, findV2Files(files), { projectName: "v2", defaultOwner: "mkk", useTargets: true, useNordnet: true });
    expect([r.fixesMapped, r.fixesUnmatched]).toEqual([4, 0]);
    expect(p.getFixes().map((f) => f.id)).toEqual(["f1", "f1-2", "v2fix-1", "v2fix-2"]);
    expect(r.parity?.differences).toEqual([]);
  });

  it("finds two v2 copies in one pick and keeps only the chosen one", () => {
    const one = pick(["config", "data"]);
    const copy = one.map((f) => ({ ...f, path: `backup/${f.path}` }));
    const roots = v2Roots([...one, ...copy]);
    expect(roots).toEqual({ configs: ["backup/config", "config"], datas: ["backup/data", "data"] });
    const kept = pickRoots([...one, ...copy], "config", "data");
    expect(findV2Files(kept).profiles.length).toBe(10);
    expect(kept.every((f) => !f.path.startsWith("backup/"))).toBe(true);
    expect(v2Roots(pick(["config", "data"]))).toEqual({ configs: ["config"], datas: ["data"] });
  });
});
