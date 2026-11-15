// Tests for decoding, tables, dates, amounts and hashing (mirrors test_s_02_reader and the
// type conversion in test_s_03_loader).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAmount } from "./amounts";
import { parseConfigDate, parseDate } from "./dates";
import { decodeText, detectEncoding } from "./decode";
import { sha256Hex } from "./sha256";
import { dedupeHeaders, excelSerialToText, guessLayout, parseCsv, parseXlsx, sniffDelimiter } from "./tables";
import { SOURCE_DIR, readBytes } from "./testing/sampleData";

describe("parseDate", () => {
  it("parses Python strptime formats, unpadded day and month", () => {
    expect(parseDate("1.6.2023", "%d.%m.%Y")).toBe("2023-06-01");
    expect(parseDate("2024/01/24", "%Y/%m/%d")).toBe("2024-01-24");
    expect(parseDate("2023-12-01 00:00:00", "%Y-%m-%d %H:%M:%S")).toBe("2023-12-01");
  });
  it("tries formats in order", () => {
    const f = "%Y-%m-%d %H:%M:%S.%f|%Y-%m-%d %H:%M:%S";
    expect(parseDate("2023-03-31 22:28:30.234000", f)).toBe("2023-03-31");
    expect(parseDate("2023-03-31 22:28:30", f)).toBe("2023-03-31");
  });
  it("is strict like pandas and rejects impossible dates", () => {
    expect(parseDate("2023-12-01 00:00:00", "%Y-%m-%d")).toBeNull();
    expect(parseDate("40.4.2024", "%d.%m.%Y")).toBeNull();
    expect(parseDate("29.2.2023", "%d.%m.%Y")).toBeNull();
    expect(parseDate("", "%d.%m.%Y")).toBeNull();
  });
  it("parses the v2 config date forms", () => {
    expect(parseConfigDate("1/31/2023")).toBe("2023-01-31");
    expect(parseConfigDate("2023-06-01")).toBe("2023-06-01");
  });
});

describe("parseAmount", () => {
  it("cleans what the Python loader cleaned", () => {
    expect(parseAmount("8 552,46")).toBe(8552.46);
    expect(parseAmount("−40,32")).toBe(-40.32);
    expect(parseAmount("+0,36")).toBe(0.36);
    expect(parseAmount("-500")).toBe(-500);
  });
  it("also strips ordinary spaces, which the Python missed", () => {
    expect(parseAmount("-12 072,49")).toBe(-12072.49);
  });
  it("supports dot decimal with a thousands separator", () => {
    expect(parseAmount("1,234.50", { decimalSeparator: ".", thousandsSeparator: "," })).toBe(1234.5);
  });
  it("returns null for text that is not a number", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("decoding", () => {
  it("detects UTF-8 with BOM, UTF-16 LE and plain UTF-8", () => {
    expect(detectEncoding(readBytes(join(SOURCE_DIR, "s-pankki_2024_01-2024_12.csv")))).toBe("utf-8");
    expect(detectEncoding(readBytes(join(SOURCE_DIR, "osingot-2023-2024.csv")))).toBe("utf-16le");
    expect(detectEncoding(readBytes(join(SOURCE_DIR, "nordea.csv")))).toBe("utf-8");
  });
  it("falls back to windows-1252", () => {
    expect(decodeText(new Uint8Array([0x4d, 0xe4, 0xe4, 0x72, 0xe4]))).toBe("Määrä");
  });
  it("strips the BOM", () => {
    expect(decodeText(readBytes(join(SOURCE_DIR, "tulot.csv"))).startsWith("date,")).toBe(true);
  });
});

describe("tables", () => {
  it("names headers like pandas", () => {
    expect(dedupeHeaders(["Valuutta", "Summa", "Valuutta", "", "Valuutta"])).toEqual([
      "Valuutta",
      "Summa",
      "Valuutta.1",
      "Unnamed: 3",
      "Valuutta.2",
    ]);
  });
  it("sniffs delimiters", () => {
    expect(sniffDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(sniffDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(sniffDelimiter("a,b\n1,2")).toBe(",");
  });
  it("finds the header below title lines", () => {
    expect(guessLayout("Report generated 2025-02-01\nDate,Text,Debit\n1,2,3\n4,5,6")).toEqual({ delimiter: ",", skipRows: 1 });
    expect(guessLayout("a;b;c\n1;2;3")).toEqual({ delimiter: ";", skipRows: 0 });
  });

  it("reads a UTF-16 tab file with repeated headers", () => {
    const t = parseCsv(decodeText(readBytes(join(SOURCE_DIR, "osingot-2023-2024.csv"))), { delimiter: "\\t" });
    expect(t.headers).toContain("Valuutta.3");
    expect(t.headers[1]).toBe("Kirjauspäivä");
    expect(t.rows).toHaveLength(26);
  });
  it("reads every row when a file mixes line endings, as pandas does", () => {
    const t = parseCsv("id,name\r\n1,a\n2,b\r\n3,c\r4,d\n", { delimiter: "," });
    expect(t.rows).toEqual([
      ["1", "a"],
      ["2", "b"],
      ["3", "c"],
      ["4", "d"],
    ]);
  });
  it("keeps a trailing empty column as Unnamed", () => {
    const t = parseCsv(decodeText(readBytes(join(SOURCE_DIR, "nordea.csv"))), { delimiter: ";" });
    expect(t.headers.at(-1)).toBe("Unnamed: 8");
    expect(t.rows[0]?.[1]).toBe("-22,04");
  });
  it("skips rows before the header", () => {
    expect(parseCsv("title\n\na,b\n1,2", { delimiter: ",", skipRows: 1 })).toEqual({ headers: ["a", "b"], rows: [["1", "2"]] });
  });
  it("reads XLSX dates as pandas timestamp text", () => {
    const t = parseXlsx(readBytes(join(SOURCE_DIR, "luottokortti.xlsx")));
    expect(t.headers[0]).toBe("TransactionDate");
    expect(t.rows[0]?.[0]).toBe("2023-12-01 00:00:00");
    expect(t.rows[0]?.[6]).toBe("-11.65");
    expect(excelSerialToText(45016.5)).toBe("2023-03-31 12:00:00");
  });
  it("picks the named sheet or the first", () => {
    expect(parseXlsx(readBytes(join(SOURCE_DIR, "penno.xlsx")), { sheet: "missing" }).headers[0]).toBe("Päivämäärä");
  });
});

describe("sha256", () => {
  it("matches known digests", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("ä".repeat(100))).toHaveLength(64);
  });
});
