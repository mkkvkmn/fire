// Limits on what one source file may hold, so a broken or crafted file cannot freeze the tab: every
// file is read on the page's own thread. Bank and broker exports are far below them.

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_SHEET_ROWS = 200_000;
export const MAX_SHEET_COLUMNS = 200;

export class FileTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`file too large: ${Math.round(bytes / 1024 / 1024)} MB, the limit is ${MAX_FILE_BYTES / 1024 / 1024} MB`);
  }
}

/** Throws FileTooLargeError for a file over the size limit. */
export function checkFileSize(bytes: Uint8Array): void {
  if (bytes.length > MAX_FILE_BYTES) throw new FileTooLargeError(bytes.length);
}
