// Tuonti › Tarkistukset: the checks of an import (new accounts, duplicates, fixes without a row,
// unreadable rows, rows in locked months), each a section that is green and closed when it is fine.
import type { Fix, SourceRow } from "../../engine/types";
import type { Staging } from "../../project/staging";
import { accountsWithoutOwner, members } from "../../project/service";
import type { Project } from "../../storage/project";
import { formatAmount, formatDate } from "../../ui/format";
import { html, raw } from "../../ui/html";
import { icon } from "../../ui/icons";
import { fmt, plural, t, type TextKey } from "../../ui/texts";

export function task(
  id: string,
  ic: "lock" | "unlink" | "copy" | "fileX" | "user",
  title: string,
  n: number,
  body: string,
  okText: TextKey,
): string {
  if (n === 0) {
    return html`<details class="card task ok" id="${id}">
      <summary>
        ${raw(icon(ic))}<span class="title">${title}</span><span class="pill ok">${raw(icon("check"))}${t("checkOk")}</span>
      </summary>
      <p class="small muted">${t(okText)}</p>
    </details>`;
  }
  return html`<details class="card task" id="${id}" open>
    <summary>
      ${raw(icon(ic))}<span class="title">${title}</span><span class="pill warn">${plural(n, "toDecideOne", "toDecide")}</span>
    </summary>
    ${raw(body)}
  </details>`;
}

/**
 * One source row as every check shows it: date · description · amount, then the file. A value
 * that could not be read shows as the file has it.
 */
export function rowLine(project: Project, r: SourceRow): string {
  const cols = profileFor(project, r.sourceFile)?.columns;
  const date = r.fields.date !== null ? formatDate(r.fields.date) : (cols ? r.columns[cols.date] : "") || "∅";
  const amount = r.fields.amount !== null ? `${formatAmount(r.fields.amount)} €` : (cols ? r.columns[cols.amount] : "") || "∅";
  return html`<div class="small">${date} · ${r.fields.description} · ${amount} <span class="muted mono">${r.sourceFile}</span></div>`;
}

function profileFor(project: Project, fileName: string) {
  const p = project;
  const file = p.getSourceFiles().find((f) => f.name === fileName);
  return file ? p.getProfiles().find((x) => x.id === file.profileId) : undefined;
}

/** The rows of a check: what to decide on the left, its buttons on the right. */
function checkTable(rows: string[]): string {
  return html`<div class="table-wrap">
    <table class="check-table">
      <tbody>
        ${raw(rows.join(""))}
      </tbody>
    </table>
  </div>`;
}

/** Accounts that are new in the staged files: whose money their rows are (default owner suggested). */
export function ownerSection(project: Project, staging: Staging): string {
  const st = staging;
  const accounts = accountsWithoutOwner(project, st.stagedRows());
  if (accounts.length === 0) return task("owners", "user", t("ownerTitle"), 0, "", "ownerOk");
  const ms = members(project);
  const def = project.getSettings().defaultOwner;
  const rows = accounts.map((a) => {
    const cur = st.accountOwners[a] || def;
    const opts = ms.map((m) => html`<option value="${m}" ${raw(m === cur ? "selected" : "")}>${m}</option>`).join("");
    return html`<tr>
      <td>
        <div class="small"><b>${a}</b></div>
      </td>
      <td class="num row-actions">
        <select data-owner-acc="${a}" aria-label="${fmt("ownerOf", { a })}">
          ${raw(opts)}
        </select>
      </td>
    </tr>`;
  });
  const body = html`<div class="note small">
      ${raw(icon("user"))}
      <div>${t("ownerBody")}</div>
    </div>
    ${raw(checkTable(rows))}`;
  return task("owners", "user", t("ownerTitle"), accounts.length, body, "ownerOk");
}

export function lateSection(project: Project, staging: Staging, staged: SourceRow[], stored: SourceRow[]): string {
  if (staged.length + stored.length === 0) return task("late", "lock", t("lateTitle"), 0, "", "lateOk");
  const skip = staging.skipLate;
  const row = (r: SourceRow, kind: "s" | "p") =>
    html`<tr>
      <td>
        <label class="check-row"
          ><input
            type="checkbox"
            data-late="${kind}:${r.txId}"
            ${raw(kind === "s" && skip.has(r.txId) ? "" : "checked")}
            aria-label="${t("addThisRow")}"
          />${raw(rowLine(project, r))}</label
        >
      </td>
      <td></td>
    </tr>`;
  const body = html`<div class="note small">
      ${raw(icon("lock"))}
      <div>${t("lateBody")}</div>
    </div>
    ${raw(checkTable([...staged.map((r) => row(r, "s")), ...stored.map((r) => row(r, "p"))]))}
    <div class="actions">
      <button type="button" class="primary" data-imp="lateAdd">${t("addSelected")}</button
      ><button type="button" class="ghost" data-imp="lateSkip">${t("leaveOut")}</button>
    </div>`;
  return task("late", "lock", t("lateTitle"), staged.length + stored.length, body, "lateOk");
}

export function orphanSection(fixes: Fix[]): string {
  if (fixes.length === 0) return task("orphans", "unlink", t("orphanTitle"), 0, "", "orphanOk");
  const rows = fixes.map((f) => {
    const what = [f.class, f.category, f.subCategory].filter(Boolean).join(" › ") || (f.parts ? t("splitFix") : "-");
    return html`<tr>
      <td>
        <div class="small">${fmt("orphanLine", { id: f.id, what })}</div>
        <div class="small muted mono">${f.txId}</div>
      </td>
      <td class="num row-actions">
        <a class="btn sm" href="#/settings/fixes">${t("retarget")}</a
        ><button type="button" class="sm ghost danger" data-imp="delFix" data-id="${f.id}">${t("remove")}</button>
      </td>
    </tr>`;
  });
  const body = html`<div class="note small">
      ${raw(icon("unlink"))}
      <div>${t("orphanBody")}</div>
    </div>
    ${raw(checkTable(rows))}`;
  return task("orphans", "unlink", t("orphanTitle"), fixes.length, body, "orphanOk");
}

export function dupSection(project: Project, groups: SourceRow[][]): string {
  if (groups.length === 0) return task("dups", "copy", t("dupTitle"), 0, "", "dupOk");
  const rows = groups.map(
    (g, i) =>
      html`<tr>
        <td>${raw(g.map((r) => rowLine(project, r)).join(""))}</td>
        <td class="num row-actions">
          <button type="button" class="sm" data-imp="dupKeep" data-i="${i}">${t("dupKeepAll")}</button>
          <button type="button" class="sm ghost" data-imp="dupDrop" data-i="${i}">${t("dupDropNewer")}</button>
        </td>
      </tr>`,
  );
  const body = html`<div class="note small">
      ${raw(icon("copy"))}
      <div>${t("dupBody")}</div>
    </div>
    ${raw(checkTable(rows))}`;
  return task("dups", "copy", t("dupTitle"), groups.length, body, "dupOk");
}

export function invalidSection(project: Project, rows: SourceRow[]): string {
  if (rows.length === 0) return task("invalid", "fileX", t("invalidTitle"), 0, "", "invalidOk");
  // the value that failed, as the file has it
  const why = (r: SourceRow) => {
    const cols = profileFor(project, r.sourceFile)?.columns;
    const parts: string[] = [];
    if (r.fields.date === null) parts.push(fmt("invalidDate", { v: (cols ? r.columns[cols.date] : "") || "∅" }));
    if (r.fields.amount === null) parts.push(fmt("invalidAmount", { v: (cols ? r.columns[cols.amount] : "") || "∅" }));
    return parts.join(" · ");
  };
  const list = rows.slice(0, 20).map(
    (r) =>
      html`<tr>
        <td>
          ${raw(rowLine(project, r))}
          <div class="small bad-text">${why(r)}</div>
        </td>
        <td class="num row-actions">
          <button type="button" class="sm ghost" data-imp="dropInvalid" data-tx="${r.txId}">${t("leaveOut")}</button>
        </td>
      </tr>`,
  );
  const body = html`<div class="note small">
      ${raw(icon("fileX"))}
      <div>${t("invalidBody")}</div>
    </div>
    ${raw(checkTable(list))}`;
  return task("invalid", "fileX", t("invalidTitle"), rows.length, body, "invalidOk");
}
