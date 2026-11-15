// Tests for the demo data: every file reads, every row has a category, and the figures look like a
// real household (savings rate, spending, wealth).
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { kassaVuosina, menot, Model, nettovarallisuus, saastoPct, sijoitusvarallisuus, tulot } from "../analytics/measures";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { demoData, type DemoLang } from "./demo";
import { importFile, rebuildLedger, reviewData } from "./service";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

function load(lang: DemoLang): Project {
  const d = demoData(lang, "2026-10");
  const p = Project.create(SQL);
  p.setProfiles(d.profiles);
  p.setRules(d.rules);
  p.setSplits(d.splits);
  p.setTargets(d.targets);
  p.setSettings({ defaultOwner: d.members[0] });
  for (const f of d.files) {
    const profile = d.profiles.find((x) => new RegExp(`^(?:${x.filePattern})`).test(f.name))!;
    const s = importFile(p, f.name, f.bytes, profile);
    expect(s.problems, f.name).toEqual([]);
  }
  rebuildLedger(p);
  return p;
}

describe.each(["fi", "en"] as DemoLang[])("demo data (%s)", (lang) => {
  it("reads every file and categorises every row", () => {
    const p = load(lang);
    const r = reviewData(p);
    expect(r.invalid).toEqual([]);
    expect(r.uncategorized.map((x) => x.fields.description)).toEqual([]);
    expect(p.getLedger().length).toBeGreaterThan(800);
  });

  it("looks like a real household over the last 24 months", () => {
    const m = new Model(load(lang).getLedger());
    expect(m.firstMonth).toBe("2024-11");
    expect(m.lastMonth).toBe("2026-10");
    const year = { from: "2025-11", to: "2026-10" };
    expect(tulot(m, year)).toBeGreaterThan(75000);
    expect(tulot(m, year)).toBeLessThan(90000);
    expect(menot(m, year) / 12).toBeGreaterThan(2800);
    expect(menot(m, year) / 12).toBeLessThan(4200);
    const rate = saastoPct(m, year)!;
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.65);
    expect(nettovarallisuus(m, "2026-10")).toBeGreaterThan(150000);
    expect(sijoitusvarallisuus(m, "2026-10")).toBeGreaterThan(50000);
    expect(kassaVuosina(m, "2026-10")!).toBeGreaterThan(1);
  });
});
