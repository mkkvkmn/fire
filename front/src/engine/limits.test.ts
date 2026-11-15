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
});
