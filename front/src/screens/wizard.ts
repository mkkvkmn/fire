// A first draft of a file profile for an unknown file: columns guessed from the file, name and
// file-name pattern from the file name. Used by the file profile editor.
import { guessProfile, patternFromFileName } from "../engine/guess";
import { decodeText } from "../engine/decode";
import { readTable } from "../engine/read";
import { guessLayout, isXlsxName } from "../engine/tables";
import type { SourceProfile } from "../engine/types";

/** A first draft for an unknown file: guessed columns, name and pattern from the file name. */
export function draftProfile(fileName: string, bytes: Uint8Array): SourceProfile {
  const pattern = patternFromFileName(fileName);
  const name = pattern.replace(/\\(.)/g, "$1");
  const base: SourceProfile = {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    filePattern: pattern,
    account: name,
    encoding: "auto",
    delimiter: "auto",
    skipRows: 0,
    sheet: "",
    dateFormats: "%d.%m.%Y",
    dayFirst: true,
    decimalSeparator: ",",
    thousandsSeparator: "",
    sign: { kind: "asis" },
    columns: { date: "", amount: "", description: [], info: [] },
    concatSeparator: " ",
  };
  try {
    if (!isXlsxName(fileName)) {
      const layout = guessLayout(decodeText(bytes));
      base.delimiter = layout.delimiter === "\t" ? "\\t" : layout.delimiter;
      base.skipRows = layout.skipRows;
    }
    return { ...base, ...guessProfile(readTable(fileName, bytes, base)) };
  } catch {
    return base;
  }
}
