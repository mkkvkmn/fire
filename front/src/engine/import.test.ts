// Tests for profiles, ids, column keeping, the Nordnet preprocessor and the v2 config importers.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeText } from "./decode";
import { contentHash } from "./ids";
import { cleanString, legacyId, profileFromV2Yaml, rulesFromV2Csv, splitsFromV2Csv, targetsFromV2Csv } from "./legacy/v2";
import { processRows } from "./pipeline";
import { nordnetPortfolio } from "./preprocessors/nordnet_portfolio";
import { defaultProfile, matchProfile, normalizeRow } from "./profiles";
import { hashCounts, readSourceRows } from "./read";
import { parseCsv } from "./tables";
import {
  CONFIG_DIR,
  NORDNET_RAW,
  REPO,
  SOURCE_DIR,
  readBytes,
  readText,
  sampleFiles,
  sampleProfiles,
  sampleSourceRows,
} from "./testing/sampleData";
import type { SourceProfile, Table } from "./types";

const profile: SourceProfile = defaultProfile({
  id: "p",
  name: "bank",
  filePattern: "bank",
  account: "bank",
  delimiter: ",",
  columns: { date: "date", amount: "amount", description: ["payee"], info: ["note"] },
});

const table = (rows: string[][]): Table => ({ headers: ["date", "payee", "note", "amount", "ref"], rows });

describe("profiles", () => {
  it("matches the start of the file name like re.match, skipping temp files", () => {
    const profiles = sampleProfiles();
    expect(matchProfile("s-pankki_2024_01-2024_12.csv", profiles)?.account).toBe("s-pankki");
    expect(matchProfile("osingot-2023-2024.csv", profiles)?.account).toBe("osingot");
    expect(matchProfile("x-s-pankki.csv", profiles)).toBeUndefined();
    expect(matchProfile("~s-pankki.csv", profiles)).toBeUndefined();
  });

  it("concatenates several columns into description and info", () => {
    const p = { ...profile, columns: { ...profile.columns, description: ["payee", "ref"], info: ["note", "ref"] } };
    expect(normalizeRow({ date: "1.2.2024", payee: "Shop", note: "", amount: "-1,5", ref: "R1" }, p)).toEqual({
      date: "2024-02-01",
      account: "bank",
      description: "Shop R1",
      info: "R1",
      amount: -1.5,
    });
  });

  it("flips the sign or combines debit and credit columns", () => {
    expect(normalizeRow({ amount: "12" }, { ...profile, sign: { kind: "flip" } }).amount).toBe(-12);
    const dc = { ...profile, sign: { kind: "debitCredit" as const, debit: "out", credit: "in" } };
    expect(normalizeRow({ out: "12,50", in: "" }, dc).amount).toBe(-12.5);
    expect(normalizeRow({ out: "", in: "3" }, dc).amount).toBe(3);
  });

  it("takes the account from a column when set", () => {
    expect(normalizeRow({ acct: "FI12" }, { ...profile, accountColumn: "acct" }).account).toBe("FI12");
    expect(normalizeRow({ acct: "" }, { ...profile, accountColumn: "acct" }).account).toBe("bank");
  });

  it("reports columns the profile needs but the file lacks", () => {
    expect(() => readSourceRows("bank.csv", { headers: ["date"], rows: [] }, profile)).toThrow(/missing columns/);
  });
});

describe("transaction ids", () => {
  const rows = [
    ["1.2.2024", "Shop", "", "-5", "A"],
    ["1.2.2024", "Shop", "", "-5", "A"],
    ["2.2.2024", "Cafe", "", "-3", "B"],
  ];

  it("gives fully identical rows distinct ids", () => {
    const ids = readSourceRows("bank.csv", table(rows), profile).rows.map((r) => r.txId);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]?.endsWith("-1")).toBe(true);
    expect(ids[1]?.endsWith("-2")).toBe(true);
    expect(ids[0]?.slice(0, -2)).toBe(ids[1]?.slice(0, -2));
  });

  it("adds nothing when the same file is imported twice", () => {
    const first = readSourceRows("bank.csv", table(rows), profile);
    const second = readSourceRows("bank.csv", table(rows), profile, hashCounts(first.rows));
    expect(second.rows).toEqual([]);
    expect(second.alreadyImported).toHaveLength(3);
  });

  it("adds only the new rows of an overlapping export", () => {
    const first = readSourceRows("bank.csv", table(rows.slice(0, 1)), profile);
    const second = readSourceRows("bank-later.csv", table(rows), profile, hashCounts(first.rows));
    expect(second.alreadyImported).toHaveLength(1);
    expect(second.rows.map((r) => r.txId)).toEqual(
      readSourceRows("x", table(rows), profile)
        .rows.slice(1)
        .map((r) => r.txId),
    );
  });

  it("can force-add rows recognised as imported", () => {
    const first = readSourceRows("bank.csv", table(rows), profile);
    const forced = readSourceRows("bank.csv", table(rows), profile, hashCounts(first.rows), { forceAdd: true });
    expect(forced.rows).toHaveLength(3);
    const all = [...first.rows, ...forced.rows].map((r) => r.txId);
    expect(new Set(all).size).toBe(6);
  });

  it("does not change when the file is renamed or the mapping is edited", () => {
    const a = readSourceRows("bank.csv", table(rows), profile).rows.map((r) => r.txId);
    const remapped = { ...profile, columns: { ...profile.columns, description: ["payee", "ref"] } };
    const b = readSourceRows("renamed.csv", table(rows), remapped);
    expect(b.rows.map((r) => r.txId)).toEqual(a);
    expect(b.rows[0]?.fields.description).toBe("Shop A");
  });

  it("depends on the account and every source column, not their order", () => {
    expect(contentHash("a", { x: "1", y: "2" })).toBe(contentHash("a", { y: "2", x: "1" }));
    expect(contentHash("a", { x: "1" })).not.toBe(contentHash("b", { x: "1" }));
    expect(contentHash("a", { x: "1", y: "" })).not.toBe(contentHash("a", { x: "1" }));
  });
});

describe("source columns", () => {
  it("keeps every column of every sample file", () => {
    for (const f of sampleFiles()) {
      const res = readSourceRows(f.fileName, f.table, f.profile);
      for (const r of res.rows) expect(Object.keys(r.columns)).toEqual(f.table.headers);
    }
  });

  it("re-derives fields from stored columns without re-reading the file", () => {
    const r = readSourceRows("bank.csv", table([["1.2.2024", "Shop", "n", "-5", "A"]]), profile).rows[0]!;
    const remapped = { ...profile, columns: { ...profile.columns, description: ["ref", "payee"] } };
    expect(normalizeRow(r.columns, remapped).description).toBe("A Shop");
  });

  it("gives every sample row a unique id", () => {
    const ids = sampleSourceRows().map((r) => r.txId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("Nordnet preprocessor", () => {
  it("reproduces the committed preprocessed file", () => {
    const actual = nordnetPortfolio(readBytes(NORDNET_RAW));
    const expected = parseCsv(decodeText(readBytes(join(SOURCE_DIR, "nordnet_salkkuraportti_preprocessed.csv"))), { delimiter: "," });
    const asSet = (t: Table) => t.rows.map((r) => JSON.stringify(Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ""])))).sort();
    expect([...actual.headers].sort()).toEqual([...expected.headers].sort());
    expect(asSet(actual)).toEqual(asSet(expected));
  });

  it("splits price and currency and labels cash rows", () => {
    const text = [
      "AOT",
      "Salkku 9",
      "1.1.2024",
      "ACME",
      '"1,50 USD"',
      '"1,00"',
      "10",
      '"15,00"',
      '"+5,00"',
      '"50%"',
      "Likvidit varat",
      '"15,00"',
      '"50%"',
    ].join("\n");
    const t = nordnetPortfolio(new TextEncoder().encode(text));
    const rec = t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r[i]])));
    expect(rec).toEqual([
      {
        date: "1.1.2024",
        account: "Salkku 9",
        stock: "ACME",
        change: "+5,00",
        market_value: "15,00",
        price: "1,50",
        purchase_price: "1,00",
        qty: "10",
        share: "50%",
        currency: "USD",
      },
      {
        date: "1.1.2024",
        account: "Salkku 9",
        stock: "Likvidit varat",
        change: "",
        market_value: "15,00",
        price: "",
        purchase_price: "",
        qty: "",
        share: "50%",
        currency: "",
      },
    ]);
  });
});

describe("v2 config importers", () => {
  it("reads the sample profiles", () => {
    const p = profileFromV2Yaml(readText(join(CONFIG_DIR, "source_file_reader/osingot.yml")), "osingot.yml");
    expect(p).toMatchObject({ filePattern: "osingot", account: "osingot", delimiter: "\\t", dateFormats: "%Y-%m-%d", dayFirst: false });
    expect(p.columns).toEqual({ date: "Kirjauspäivä", amount: "Summa", description: ["Arvopaperi"], info: ["Tapahtumatyyppi"] });
    expect(sampleProfiles()).toHaveLength(10);
    expect(p.accountColumn).toBeUndefined();
  });

  it("takes the account from the file when a v2 profile maps an account column", () => {
    const yml =
      '"pattern": "saldot"\n"account": "saldot"\n"columns":\n  "date": "pvm"\n  "amount": "saldo"\n  "description": "kohde"\n  "account": "tili"\n';
    const p = profileFromV2Yaml(yml, "saldot.yml");
    expect(p.accountColumn).toBe("tili");
    const row = normalizeRow({ pvm: "31.12.2022", saldo: "10,5", kohde: "SP", tili: "Säästötili" }, p);
    expect(row.account).toBe("Säästötili");
  });

  it("reads rules, splits and targets", () => {
    const dp = join(CONFIG_DIR, "data_processing");
    const rules = rulesFromV2Csv(readText(join(dp, "categories.csv")));
    expect(rules).toHaveLength(26);
    expect(rules[0]).toEqual({
      id: "0",
      account: "",
      description: "",
      info: "",
      amount: "zero",
      class: "pois",
      category: "nollasummainen",
      subCategory: "",
    });
    expect(rules[18]).toMatchObject({ id: "18", amount: "any", class: "menot", category: "asuminen", subCategory: "" });
    expect(splitsFromV2Csv(readText(join(dp, "splits.csv")))[1]).toEqual({
      start: "2023-01-01",
      end: "2024-12-31",
      account: "op-yhteinen",
      share: 0.5,
      owner: "mrs. mkk",
    });
    expect(targetsFromV2Csv(readText(join(dp, "targets.csv")))[1]).toMatchObject({
      monthlyAmount: -500,
      class: "menot",
      start: "2023-01-01",
    });
  });

  it("cleans strings like helpers.clean_string", () => {
    expect(cleanString("20230131__varat__asunto____100000.0__actual__varat.csv__mkk")).toBe(
      "20230131__varat__asunto____1000000__actual__varatcsv__mkk",
    );
    expect(cleanString("member organizations - def")).toBe("memberorganizationsdef");
    expect(cleanString("a_b__c")).toBe("ab__c");
  });

  it("rebuilds the v2 not_unique_id of every sample row", () => {
    const final = parseCsv(readText(join(REPO, "data/final/final_data.csv")), { delimiter: "," });
    const idCol = final.headers.indexOf("not_unique_id");
    const rowType = final.headers.indexOf("row_type");
    const expected = final.rows.filter((r) => r[rowType] === "Actual" && r[0] !== "").map((r) => r[idCol]);
    const dp = join(CONFIG_DIR, "data_processing");
    const ledger = processRows(sampleSourceRows(), {
      rules: rulesFromV2Csv(readText(join(dp, "categories.csv"))),
      splits: [],
      fixes: [],
      targets: [],
      defaultOwner: "mkk",
    }).ledger;
    expect(ledger.map(legacyId).sort()).toEqual(expected.sort());
  });
});
