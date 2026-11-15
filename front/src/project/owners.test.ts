// Account owners: every account gets an explicit owner, so the default owner is only a suggestion
// and changing it moves no rows. Giving owners to existing accounts changes nothing in the ledger.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { defaultProfile } from "../engine/profiles";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { accountsWithoutOwner, ensureAccountOwners, importFile, rebuildLedger, saveDraft } from "./service";

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await loadSqlJs();
});

const profile = (account: string) =>
  defaultProfile({
    id: account,
    name: account,
    filePattern: account,
    account,
    delimiter: ";",
    columns: { date: "Päivä", amount: "Summa", description: ["Saaja"], info: [] },
  });
const enc = (lines: string[]) => new TextEncoder().encode(lines.join("\n"));

function setup(): Project {
  const p = Project.create(SQL);
  p.setSettings({ defaultOwner: "a" });
  importFile(p, "pankki.csv", enc(["Päivä;Summa;Saaja", "10.1.2024;-5,00;Prisma"]), profile("pankki"));
  importFile(p, "kortti.csv", enc(["Päivä;Summa;Saaja", "11.1.2024;-7,00;Lidl"]), profile("kortti"));
  rebuildLedger(p);
  return p;
}

const owners = (p: Project) => Object.fromEntries(p.getLedger().map((r) => [r.account, r.owner]));

describe("account owners", () => {
  it("writes down today's owner of every account, changing no row", () => {
    const p = setup();
    const before = p.getLedger();
    expect(ensureAccountOwners(p).sort()).toEqual(["kortti", "pankki"]);
    expect(p.getSettings().accountOwners).toEqual({ kortti: "a", pankki: "a" });
    rebuildLedger(p);
    expect(p.getLedger()).toEqual(before);
    expect(ensureAccountOwners(p)).toEqual([]);
  });

  it("makes the default owner a suggestion: changing it moves no rows", () => {
    const p = setup();
    ensureAccountOwners(p);
    saveDraft(p, { defaultOwner: "b" });
    expect(owners(p)).toEqual({ kortti: "a", pankki: "a" });
  });

  it("gives a new account the owner chosen for it", () => {
    const p = setup();
    ensureAccountOwners(p);
    importFile(p, "sijoitus.csv", enc(["Päivä;Summa;Saaja", "12.1.2024;100,00;Osinko"]), profile("sijoitus"));
    expect(accountsWithoutOwner(p, p.getSourceRows())).toEqual(["sijoitus"]);
    ensureAccountOwners(p, { sijoitus: "b" });
    rebuildLedger(p);
    expect(owners(p)).toEqual({ kortti: "a", pankki: "a", sijoitus: "b" });
  });
});
