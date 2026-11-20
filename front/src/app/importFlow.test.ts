// Tests that the Luokittelu table draws a page of groups while its search covers every group, and
// that a project change re-reads the staged files only when reading depends on it.
import type { SqlJsStatic } from "sql.js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { defaultProfile } from "../engine/profiles";
import { addRule, importFile } from "../project/service";
import { Project } from "../storage/project";
import { loadSqlJs } from "../storage/sqljs";
import { classifiedLines, groupRows, ImportFlow, matchesSearch, type RowGroup, takenOffWaiting, visibleGroups } from "./importFlow";
import type { Rule, SourceRow } from "../engine/types";
import type { Session } from "./session";

function group(i: number, account = "Bank"): RowGroup {
  return {
    key: `g${i}`,
    account,
    description: `Shop ${i}`,
    info: `Info ${i}`,
    infoShared: true,
    rows: [],
    total: -i,
    first: "2024-01-01",
    staged: true,
  };
}

const groups = Array.from({ length: 120 }, (_, i) => group(i));

describe("groupRows info", () => {
  const row = (txId: string, info: string) =>
    ({ txId, fields: { date: "2024-01-01", account: "Bank", description: "Card", info, amount: -1 } }) as unknown as Parameters<
      typeof groupRows
    >[0][number];

  it("keeps the info for a rule only when every row of the group has it", () => {
    const [same] = groupRows([row("1", "Example Oy"), row("2", "Example Oy")], new Set());
    expect(same).toMatchObject({ info: "Example Oy", infoShared: true });
    const [mixed] = groupRows([row("1", "Example Oy"), row("2", "Other Ab")], new Set());
    expect(mixed!.infoShared).toBe(false);
  });
});

describe("visibleGroups", () => {
  it("draws the first page and counts every group", () => {
    const { shown, matching } = visibleGroups(groups, "", 50);
    expect(shown.length).toBe(50);
    expect(shown[0]!.key).toBe("g0");
    expect(shown[49]!.key).toBe("g49");
    expect(matching).toBe(120);
  });

  it("draws every group when the limit reaches the end", () => {
    expect(visibleGroups(groups, "", 120).shown.length).toBe(120);
    expect(visibleGroups(groups, "", 150).shown.length).toBe(120);
  });

  it("finds a group beyond the first page", () => {
    const { shown, matching } = visibleGroups(groups, "shop 117", 50);
    expect(shown.map((g) => g.key)).toEqual(["g117"]);
    expect(matching).toBe(1);
  });

  it("searches description, details and account, ignoring case", () => {
    const list = [group(1), group(2, "Credit card"), group(3)];
    expect(visibleGroups(list, "INFO 3", 50).shown.map((g) => g.key)).toEqual(["g3"]);
    expect(visibleGroups(list, "credit", 50).shown.map((g) => g.key)).toEqual(["g2"]);
  });

  it("limits the search hits to the page and counts them all", () => {
    const { shown, matching } = visibleGroups(groups, "shop 1", 5);
    expect(shown.length).toBe(5);
    expect(matching).toBe(31);
  });

  it("returns no groups when nothing matches", () => {
    expect(visibleGroups(groups, "no such shop", 50)).toEqual({ shown: [], matching: 0 });
  });
});

describe("matchesSearch", () => {
  const row = { description: "Corner Shop", info: "Card purchase", account: "Joint account" };

  it("finds the query in the description, details or account, ignoring case and spaces around it", () => {
    expect(matchesSearch(row, "corner")).toBe(true);
    expect(matchesSearch(row, " CARD ")).toBe(true);
    expect(matchesSearch(row, "joint")).toBe(true);
  });

  it("does not match text that is in none of them", () => {
    expect(matchesSearch(row, "bakery")).toBe(false);
  });
});

describe("ImportFlow.restage", () => {
  let SQL: SqlJsStatic;
  beforeAll(async () => {
    SQL = await loadSqlJs();
  });

  const bank = defaultProfile({
    id: "bank",
    name: "bank",
    filePattern: "bank",
    delimiter: ";",
    columns: { date: "Date", amount: "Amount", description: ["Payee"], info: ["Message"] },
  });
  const file = new TextEncoder().encode(["Date;Amount;Payee;Message", "1.2.2024;-5,00;Corner Shop;food"].join("\n"));

  function stagedFlow(): { flow: ImportFlow; project: Project } {
    const project = Project.create(SQL);
    project.setSettings({ defaultOwner: "a" });
    project.setProfiles([bank]);
    const flow = new ImportFlow({ state: { project, revision: 0 } } as unknown as Session);
    flow.staging.add(project, [{ name: "bank.csv", bytes: file }]);
    return { flow, project };
  }

  it("does not re-read the staged files after a rule change", () => {
    const { flow, project } = stagedFlow();
    const read = vi.spyOn(flow.staging, "read");
    addRule(project, {
      id: "1",
      account: "",
      description: "corner",
      info: "",
      amount: "any",
      class: "menot",
      category: "Food",
      subCategory: "",
    });
    flow.restage();
    expect(read).not.toHaveBeenCalled();
  });

  it("re-reads the staged files after a file profile change", () => {
    const { flow, project } = stagedFlow();
    const read = vi.spyOn(flow.staging, "read");
    project.setProfiles([{ ...bank, columns: { ...bank.columns, info: [] } }]);
    flow.restage();
    expect(read).toHaveBeenCalledTimes(1);
    expect(flow.staging.stagedRows()[0]!.fields.info).toBe("");
  });

  it("re-reads the staged files after rows are imported into the project", () => {
    const { flow, project } = stagedFlow();
    const read = vi.spyOn(flow.staging, "read");
    const before = project.rowsVersion;
    importFile(project, "bank.csv", file, bank);
    expect(project.rowsVersion).toBeGreaterThan(before);
    flow.restage();
    expect(read).toHaveBeenCalledTimes(1);
    expect(flow.staging.stagedRows()).toEqual([]);
    expect(flow.staging.files[0]!.already).toBe(1);
  });

  it("re-reads the staged files after a rolled-back transaction", () => {
    const { flow, project } = stagedFlow();
    const read = vi.spyOn(flow.staging, "read");
    const before = project.rowsVersion;
    expect(() =>
      project.transaction(() => {
        throw new Error("write failed");
      }),
    ).toThrow("write failed");
    expect(project.rowsVersion).toBeGreaterThan(before);
    flow.restage();
    expect(read).toHaveBeenCalledTimes(1);
  });
});

describe("Luokittelu group order", () => {
  const sized = (key: string, n: number) => ({ ...group(0), key, rows: new Array(n).fill(null) }) as unknown as RowGroup;

  it("keeps each group's first place when a rule takes some of its rows", () => {
    const flow = new ImportFlow({} as Session);
    expect(flow.ordered([sized("a", 47), sized("b", 36), sized("c", 20)]).map((g) => g.key)).toEqual(["a", "b", "c"]);
    // a rule took 32 of a's rows: it is the smallest now, but stays first
    expect(flow.ordered([sized("b", 36), sized("c", 20), sized("a", 15)]).map((g) => g.key)).toEqual(["a", "b", "c"]);
  });

  it("puts groups new since then after the others, and starts afresh when cleared", () => {
    const flow = new ImportFlow({} as Session);
    flow.ordered([sized("a", 5)]);
    expect(flow.ordered([sized("z", 99), sized("a", 5)]).map((g) => g.key)).toEqual(["a", "z"]);
    flow.clearClassified();
    expect(flow.ordered([sized("z", 99), sized("a", 5)]).map((g) => g.key)).toEqual(["z", "a"]);
  });
});

describe("classified lines", () => {
  const src = (txId: string, description: string, info = "", amount = -5) =>
    ({ txId, fields: { date: "2024-01-01", account: "Bank", description, info, amount } }) as unknown as SourceRow;
  const rule = (id: string, description: string): Rule => ({
    id,
    account: "",
    description,
    info: "",
    amount: "any",
    class: "menot",
    category: "Food",
    subCategory: "",
  });
  const base = {
    waiting: [] as RowGroup[],
    staged: [] as SourceRow[],
    ruleOfTx: new Map<string, string>(),
    fixed: new Set<string>(),
    rules: [rule("1", "shop"), rule("2", "cafe")],
    stored: new Map<string, SourceRow>(),
    orderOf: () => 0,
  };

  it("lists staged rows under the rule the preview names, one line per group and rule", () => {
    const a = src("a", "Shop"),
      b = src("b", "Shop"),
      c = src("c", "Cafe");
    const lines = classifiedLines({
      ...base,
      staged: [a, b, c],
      ruleOfTx: new Map([
        ["a", "1"],
        ["b", "1"],
        ["c", "2"],
      ]),
    });
    expect(lines.map((l) => [l.rule.id, l.group.rows.length])).toEqual([
      ["1", 2],
      ["2", 1],
    ]);
  });

  it("leaves out rows a korjaus decides, rows still waiting and rows named by no saved rule", () => {
    const a = src("a", "Shop"),
      b = src("b", "Shop"),
      c = src("c", "Shop"),
      d = src("d", "Shop");
    const waiting = groupRows([c], new Set(["c"]));
    const lines = classifiedLines({
      ...base,
      staged: [a, b, c, d],
      waiting,
      fixed: new Set(["b"]),
      ruleOfTx: new Map([
        ["a", "1"],
        ["b", "1"],
        ["c", "1"],
        ["d", "9"],
      ]),
    });
    expect(lines.map((l) => l.group.rows.map((r) => r.txId))).toEqual([["a"]]);
  });

  it("gives a stored row the last rule that matches it, and drops it when it is back on the waiting list", () => {
    const stored = src("s", "Shop and Cafe");
    const input = { ...base, stored: new Map([["s", stored]]) };
    expect(classifiedLines(input).map((l) => l.rule.id)).toEqual(["2"]);
    expect(classifiedLines({ ...input, waiting: groupRows([stored], new Set()) })).toEqual([]);
  });

  it("counts the rows a saved rule took off the waiting list, and from how many groups", () => {
    const g1 = groupRows([src("a", "Shop"), src("b", "Shop")], new Set());
    const g2 = groupRows([src("c", "Cafe")], new Set());
    const taken = takenOffWaiting([...g1, ...g2], new Set(["b", "c"]));
    expect(taken.rows.map((r) => r.txId)).toEqual(["a"]);
    expect(taken.groups).toBe(1);
  });

  it("forgets the classified rows when the import is done", () => {
    const flow = new ImportFlow({ state: { project: null, revision: 1 } } as unknown as Session);
    flow.classified.set("a", src("a", "Shop"));
    flow.clearClassified();
    expect(flow.classified.size).toBe(0);
  });
});
