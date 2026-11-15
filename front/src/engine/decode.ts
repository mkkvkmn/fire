// Text decoding for source files: BOM detection, UTF-16 without BOM, UTF-8 with a windows-1252 fallback.
import { checkFileSize } from "./limits";
import type { SourceProfile } from "./types";

export type Encoding = Exclude<SourceProfile["encoding"], "auto">;

export function detectEncoding(bytes: Uint8Array): Encoding {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  // UTF-16 without BOM: ASCII text leaves every other byte zero.
  const sample = Math.min(bytes.length, 4000);
  let zeroEven = 0;
  let zeroOdd = 0;
  for (let i = 0; i < sample; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) zeroEven++;
      else zeroOdd++;
    }
  }
  if (sample > 1 && zeroOdd > sample / 4 && zeroEven < sample / 50) return "utf-16le";
  if (sample > 1 && zeroEven > sample / 4 && zeroOdd < sample / 50) return "utf-16be";
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return "utf-8";
  } catch {
    return "windows-1252";
  }
}

/** Decodes bytes to text; a BOM is removed. */
export function decodeText(bytes: Uint8Array, encoding: SourceProfile["encoding"] = "auto"): string {
  checkFileSize(bytes);
  const enc = encoding === "auto" ? detectEncoding(bytes) : encoding;
  return new TextDecoder(enc).decode(bytes);
}
