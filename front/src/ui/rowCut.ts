// The warning for a spreadsheet cut at the row limit, shared by the file list and the profile editor.
import { formatCount } from "./format";
import { html } from "./html";
import { fmt } from "./texts";

/** The warning line for a cut file; "" when the file was not cut. `dropped` counts blank sheet rows too, hence "up to". */
export function rowCutWarning(cut: { kept: number; dropped: number } | null | undefined): string {
  if (!cut) return "";
  return html`<div class="small warn-text">${fmt("rowLimitCut", { kept: formatCount(cut.kept), dropped: formatCount(cut.dropped) })}</div>`;
}
