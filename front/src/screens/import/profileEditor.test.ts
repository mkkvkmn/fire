// The file profile editor's column roles and date examples (no DOM).
import { describe, expect, it } from "vitest";
import type { Project } from "../../storage/project";
import { fmt } from "../../ui/texts";
import { dateExample, ProfileEditor } from "./profileEditor";

const FILE = new TextEncoder().encode("Päivä;Summa;Saaja;Viesti;Tili\r\n1.2.2024;-12,50;Prisma;KORTTIOSTO;FI00\r\n");
/** Only what the editor reads from a project. */
const project = { getProfiles: () => [] } as unknown as Project;

describe("profile editor", () => {
  it("writes a date format as the last day of 2026", () => {
    expect(dateExample("%d.%m.%Y")).toBe("31.12.2026");
    expect(dateExample("%Y-%m-%d")).toBe("2026-12-31");
    expect(dateExample("%Y-%m-%d %H:%M:%S.%f|%Y-%m-%d %H:%M:%S")).toBe("2026-12-31 14:05:09.000 / 2026-12-31 14:05:09");
  });

  it("gives each column one role, moving a single role and keeping several descriptions in file order", () => {
    const ed = new ProfileEditor(project, "bank.csv", FILE, "");
    ed.setRole("Päivä", "date");
    ed.setRole("Viesti", "description");
    ed.setRole("Saaja", "description");
    expect(ed.draft.columns.description).toEqual(["Saaja", "Viesti"]);
    // the amount moves from one column to another; the old one is no longer used
    ed.setRole("Summa", "amount");
    ed.setRole("Tili", "amount");
    expect(ed.draft.columns.amount).toBe("Tili");
    expect(ed.roleOf("Summa")).toBe("");
    // a column changes role: it leaves the old one
    ed.setRole("Viesti", "info");
    expect(ed.draft.columns.description).toEqual(["Saaja"]);
    expect(ed.draft.columns.info).toEqual(["Viesti"]);
    // the account column, and back to one account for every row
    ed.setRole("Tili", "account");
    expect(ed.draft.accountColumn).toBe("Tili");
    expect(ed.draft.columns.amount).toBe("");
    ed.setRole("Tili", "");
    expect(ed.draft.accountColumn).toBeUndefined();
  });

  it("puts the reading settings back on Peruuta, keeps them on Käytä, and knows when something changed", () => {
    const ed = new ProfileEditor(project, "bank.csv", FILE, "");
    const before = { delimiter: ed.draft.delimiter, skipRows: ed.draft.skipRows, preprocessor: ed.draft.preprocessor };
    ed.openReading();
    expect(ed.readingChanged()).toBe(false);
    ed.setField("delimiter", ",");
    ed.setField("skipRows", "2");
    ed.setField("preprocessor", "x");
    expect(ed.readingChanged()).toBe(true);
    ed.cancelReading();
    expect(ed.readingOpen).toBe(false);
    expect({ delimiter: ed.draft.delimiter, skipRows: ed.draft.skipRows, preprocessor: ed.draft.preprocessor }).toEqual(before);
    ed.openReading();
    ed.setField("skipRows", "1");
    ed.applyReading();
    expect(ed.readingOpen).toBe(false);
    expect(ed.draft.skipRows).toBe(1);
  });

  it("says under the reading settings what they give: the file's size, or why it reads wrong", () => {
    const ed = new ProfileEditor(project, "bank.csv", FILE, "");
    expect(ed.readingResult()).toContain("5");
    ed.setField("delimiter", ",");
    ed.reload();
    // one column only: the separator is the likely cause
    expect(ed.readingResult()).toContain("bad-text");
  });

  it("will not save a profile that names a column the file does not have", () => {
    const ed = new ProfileEditor(project, "bank.csv", FILE, "");
    ed.draft.name = "Pankki";
    ed.setRole("Päivä", "date");
    ed.setRole("Saaja", "description");
    ed.setRole("Summa", "amount");
    expect(ed.problem()).toBe("");
    // another bank's file: its header is "Kirjauspäivä", not "Päivä"
    ed.draft.columns.date = "Kirjauspäivä";
    expect(ed.problem()).toContain("Kirjauspäivä");
  });

  it("takes columns the file does not have out of the profile, and keeps the ones it has", () => {
    const ed = new ProfileEditor(project, "bank.csv", FILE, "");
    ed.draft.name = "Pankki";
    ed.draft.columns = { date: "Päivä", amount: "Summa", description: ["Vanha", "Saaja"], info: ["Toinen"] };
    ed.draft.accountColumn = "Tilinro";
    expect(ed.problem()).toContain("Vanha");
    ed.dropMissing();
    expect(ed.draft.columns).toEqual({ date: "Päivä", amount: "Summa", description: ["Saaja"], info: [] });
    expect(ed.draft.accountColumn).toBeUndefined();
    expect(ed.problem()).toBe("");
  });

  it("counts a row with a bad date and a bad amount once in the preview", () => {
    const bad = new TextEncoder().encode("Päivä;Summa;Saaja\r\nx;y;Prisma\r\n1.2.2024;-1,00;Lidl\r\n");
    const p = { getProfiles: () => [], getSplits: () => [], getSettings: () => ({ accountOwners: {} }) } as unknown as Project;
    const ed = new ProfileEditor(p, "bank.csv", bad, "");
    ed.setRole("Päivä", "date");
    ed.setRole("Summa", "amount");
    ed.setRole("Saaja", "description");
    expect(ed.previewCard("a")).toContain(fmt("previewProblems", { e: 1 }));
  });

  it("does not count a date format typed by hand earlier as a change", () => {
    const ed = new ProfileEditor(project, "bank.csv", FILE, "");
    ed.openReading();
    ed.setField("dateFormatPick", "custom");
    expect(ed.readingChanged()).toBe(true);
    ed.setField("dateFormats", "%d/%m/%Y");
    ed.applyReading();
    ed.openReading();
    expect(ed.readingChanged()).toBe(false);
    ed.cancelReading();
    expect(ed.draft.dateFormats).toBe("%d/%m/%Y");
  });
});
