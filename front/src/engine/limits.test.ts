// File limits: an oversized file is refused before it is parsed; a sheet that claims a huge range
// is read only up to its last real cell.
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { decodeText } from "./decode";
import { FileTooLargeError, MAX_FILE_BYTES } from "./limits";
import { parseXlsx } from "./tables";

describe("file limits", () => {
  it("refuses a file over the size limit", () => {
    expect(() => decodeText(new Uint8Array(MAX_FILE_BYTES + 1))).toThrow(FileTooLargeError);
  });

  it("reads a sheet only up to its last real cell, not the range it claims", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["date", "amount"],
      ["2024-01-01", "5"],
    ]);
    // claims 50 columns and 5 000 rows; the writer fills the claimed range with empty cells
    ws["!ref"] = "A1:AX5000";
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "s");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    const t = parseXlsx(bytes);
    expect(t.headers).toEqual(["date", "amount"]);
    expect(t.rows).toEqual([["2024-01-01", "5"]]);
  });

  // synthetic rows; a small limit stands in for MAX_SHEET_ROWS
  const sheetBytes = (dataRows: number): Uint8Array => {
    const aoa = [
      ["date", "amount"],
      ...Array.from({ length: dataRows }, (_, i) => [`2024-01-${String((i % 28) + 1).padStart(2, "0")}`, String(i)]),
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "s");
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  };

  it("reports the kept and dropped rows when a sheet is over the row limit", () => {
    const t = parseXlsx(sheetBytes(12), { maxRows: 10 });
    expect(t.rows).toHaveLength(10);
    expect(t.cut).toEqual({ kept: 10, dropped: 2 });
  });

  it("reports no cut for a sheet at the row limit", () => {
    const t = parseXlsx(sheetBytes(10), { maxRows: 10 });
    expect(t.rows).toHaveLength(10);
    expect(t.cut).toBeUndefined();
  });

  const sheetBytesFrom = (aoa: string[][], ref: string): Uint8Array => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!ref"] = ref;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "s");
    return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  };

  it("counts the cut in absolute sheet rows when the sheet starts below row 1", () => {
    // header in row 3, data in rows 4-15 (12 data rows); the limit keeps sheet rows 1-11
    const aoa: string[][] = [[], [], ["date", "amount"], ...Array.from({ length: 12 }, (_, i) => ["2024-01-01", String(i)])];
    const t = parseXlsx(sheetBytesFrom(aoa, "A3:B15"), { maxRows: 10 });
    expect(t.rows).toHaveLength(8);
    expect(t.cut).toEqual({ kept: 8, dropped: 4 });
  });

  it("reports a cut when the row at the limit is blank and data follows", () => {
    // header row 1, data rows 2-10, blank row 11, data rows 12-13; the limit keeps sheet rows 1-11
    const aoa: string[][] = [
      ["date", "amount"],
      ...Array.from({ length: 9 }, (_, i) => ["2024-01-01", String(i)]),
      [],
      ["2024-02-01", "1"],
      ["2024-02-02", "2"],
    ];
    const t = parseXlsx(sheetBytesFrom(aoa, "A1:B13"), { maxRows: 10 });
    expect(t.rows).toHaveLength(9);
    expect(t.cut).toEqual({ kept: 9, dropped: 2 });
  });
});
