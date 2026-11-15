// File profile editor (Tuonti > Tiedostot > Muokkaa): the file as is, the profile settings in four
// rows (reading, columns, amounts) and a preview of the rows as imported. Who owns an account is
// chosen in Tarkistukset (new accounts) and Asetukset › Jaot, not here.
import { DATE_FORMATS, guessProfile } from "../../engine/guess";
import { PRESETS } from "../../engine/presets";
import { PREPROCESSORS } from "../../engine/preprocessors";
import { PRE_WHAT } from "../../ui/preprocessors";
import { matchProfile, missingColumns, normalizeRow } from "../../engine/profiles";
import { readTable, tableRecords } from "../../engine/read";
import { splitParts } from "../../engine/split";
import { isXlsxName, sheetNames } from "../../engine/tables";
import type { SourceProfile, Table } from "../../engine/types";
import type { Project } from "../../storage/project";
import { formatAmount, formatDate } from "../../ui/format";
import { html, raw } from "../../ui/html";
import { icon } from "../../ui/icons";
import { fmt, t } from "../../ui/texts";
import { draftProfile } from "../wizard";

const RAW_ROWS = 6;
const PREVIEW_ROWS = 8;

export class ProfileEditor {
  draft: SourceProfile;
  private table: Table | null = null;
  private error = "";
  private readonly sheets: string[];
  /** Profile the editor started from ("" for a new one). */
  readonly existingId: string;

  constructor(
    private readonly project: Project,
    readonly fileName: string,
    private readonly bytes: Uint8Array,
    profileId: string,
  ) {
    this.sheets = isXlsxName(fileName) ? safeSheets(bytes) : [];
    const existing = project.getProfiles().find((p) => p.id === profileId);
    this.existingId = existing?.id ?? "";
    if (existing) {
      this.draft = structuredClone(existing);
    } else {
      // A ready-made profile matched by name is used only when the file has its columns: two banks
      // can name their files alike.
      const preset = matchProfile(fileName, PRESETS);
      const draft = draftProfile(fileName, bytes);
      this.draft = preset && fits(fileName, bytes, preset) ? { ...structuredClone(preset), id: draft.id } : draft;
    }
    this.load();
  }

  private load(): void {
    try {
      this.table = readTable(this.fileName, this.bytes, this.draft);
      this.error = "";
    } catch (e) {
      this.table = null;
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  /** Starts from another profile: an existing one, a ready-made one, or a fresh guess. */
  use(choice: string): void {
    const id = this.draft.id;
    const own = this.project.getProfiles().find((p) => p.id === choice);
    const preset = PRESETS.find((p) => p.id === choice);
    if (own) this.draft = structuredClone(own);
    else if (preset) this.draft = { ...structuredClone(preset), id };
    else this.draft = { ...draftProfile(this.fileName, this.bytes), id };
    this.load();
  }

  guess(): void {
    this.load();
    if (this.table) this.draft = { ...this.draft, ...guessProfile(this.table) };
    this.load();
  }

  /** Applies one form field; returns true when the file must be read again (read options). */
  setField(field: string, value: string): boolean {
    const d = this.draft;
    switch (field) {
      case "name":
        d.name = value;
        return false;
      case "filePattern":
        d.filePattern = value;
        return false;
      case "delimiter":
        d.delimiter = value;
        return true;
      case "encoding":
        d.encoding = value as SourceProfile["encoding"];
        return true;
      case "skipRows":
        d.skipRows = Math.max(0, Number(value) || 0);
        return true;
      case "sheet":
        d.sheet = value;
        return true;
      case "preprocessor":
        if (value) d.preprocessor = value;
        else delete d.preprocessor;
        return true;
      case "dateFormats":
        d.dateFormats = value;
        return false;
      case "date":
        d.columns.date = value;
        return false;
      case "accountType": {
        // fixed: one name for every row; column: each row's account is in the file
        if (value === "fixed") delete d.accountColumn;
        else if (!d.accountColumn) {
          const cols = this.table?.headers ?? [];
          d.accountColumn = cols.find((c) => /account|tili/i.test(c)) ?? cols[0] ?? "";
        }
        // the account only changes how rows already read are shown: no need to read the file again
        return false;
      }
      case "account":
        d.accountColumn = value;
        return false;
      case "accountName":
        d.account = value;
        return false;
      case "amount":
        d.columns.amount = value;
        return false;
      case "debit":
        if (d.sign.kind === "debitCredit") d.sign.debit = value;
        return false;
      case "credit":
        if (d.sign.kind === "debitCredit") d.sign.credit = value;
        return false;
      case "sign":
        d.sign = value === "debitCredit" ? { kind: "debitCredit", debit: "", credit: "" } : { kind: value === "flip" ? "flip" : "asis" };
        return false;
      case "decimalSeparator":
        d.decimalSeparator = value === "." ? "." : ",";
        return false;
      case "thousandsSeparator":
        d.thousandsSeparator = value;
        return false;
    }
    return false;
  }

  setColumns(field: "description" | "info", cols: string[]): void {
    this.draft.columns[field] = cols;
  }

  reload(): void {
    this.load();
  }

  /** Problems that block saving, or "" when the profile can be saved. */
  problem(): string {
    const d = this.draft;
    if (!this.table) return fmt("previewError", { e: this.error });
    if (!d.name.trim()) return t("needProfileName");
    if (!d.columns.date) return t("needDateColumn");
    if (d.sign.kind === "debitCredit" ? !d.sign.debit || !d.sign.credit : !d.columns.amount) return t("needAmountColumn");
    if (d.columns.description.length === 0) return t("needDescriptionColumn");
    return "";
  }

  // ---- markup

  render(defaultOwner: string, statusPill: string): string {
    return html` <div class="edit-head">
        <a class="btn sm ghost" href="#/import/files">${raw(icon("arrowL"))}${t("backToFiles")}</a>
        <span class="mono">${this.fileName}</span>${raw(statusPill)}
      </div>
      <section class="infobox">
        ${raw(icon("columns"))}
        <div>
          <b>${t("profileInfoTitle")}</b>
          <div class="muted small">
            ${raw(fmt("profileInfoBody", { link: html`<a href="#/settings/profiles">${t("settingsLinkWord")}</a>` }))}
          </div>
        </div>
      </section>
      <div class="edit-stack">
        ${raw(this.rawCard())} ${raw(this.settingsCard())}
        <section class="card flush" data-preview>${raw(this.previewCard(defaultOwner))}</section>
      </div>
      <div class="actions flow-next">
        <a class="btn" href="#/import/files">${t("cancel")}</a><span class="grow"></span>
        <span class="small bad-text" data-problem>${this.problem()}</span>
        <button type="button" class="primary" data-imp="saveProfile" ${raw(this.problem() ? "disabled" : "")}>${t("saveProfile")}</button>
      </div>`;
  }

  private rawCard(): string {
    const tb = this.table;
    const head = tb ? tb.headers : [];
    const rows = tb ? tb.rows.slice(0, RAW_ROWS) : [];
    return html`<section class="card flush">
      <div class="preview-head">
        <h3>${t("rawTitle")}</h3>
        <span class="small muted">${this.fileName}${tb ? ` · ${fmt("rowsCount", { n: tb.rows.length })}` : ""}</span>
      </div>
      <div class="small muted preview-sub">${t("rawSub")}</div>
      ${raw(
        tb
          ? html`<div class="table-wrap">
                <table class="raw">
                  <thead>
                    <tr>
                      <th class="rown">#</th>
                      ${raw(head.map((h) => html`<th>${h}</th>`).join(""))}
                    </tr>
                  </thead>
                  <tbody>
                    ${raw(
                      rows
                        .map(
                          (r, i) =>
                            html`<tr>
                              <td class="rown">${i + 1}</td>
                              ${raw(head.map((_, j) => html`<td>${r[j] ?? ""}</td>`).join(""))}
                            </tr>`,
                        )
                        .join(""),
                    )}
                  </tbody>
                </table>
              </div>
              <div class="small muted preview-sub">${fmt("showingNofM", { a: rows.length, n: tb.rows.length })}</div>`
          : html`<div class="note err small">${fmt("previewError", { e: this.error })}</div>`,
      )}
    </section>`;
  }

  private settingsCard(): string {
    const d = this.draft;
    const cols = this.table?.headers ?? [];
    const opt = (v: string, label: string, sel: boolean) => html`<option value="${v}" ${raw(sel ? "selected" : "")}>${label}</option>`;
    const sel = (field: string, options: [string, string][], value: string, label: string, hint = "", disabled = false) =>
      html`<label class="field"
        >${label}<select data-pf="${field}" ${raw(disabled ? "disabled" : "")}>
          ${raw(options.map(([v, l]) => opt(v, l, v === value)).join(""))}</select
        >${raw(hint ? html`<small>${hint}</small>` : "")}</label
      >`;
    const colOpts = (empty: boolean): [string, string][] => [
      ...(empty ? [["", t("chooseColumn")] as [string, string]] : []),
      ...cols.map((c) => [c, c] as [string, string]),
    ];
    const multi = (field: "description" | "info", label: string, hint: string) => {
      const chosen = d.columns[field];
      return html`<div class="field">
        ${label}
        <details class="multi">
          <summary>${chosen.length ? chosen.join(" + ") : t("chooseColumns")}</summary>
          <div class="multi-list" data-multi="${field}">
            ${raw(cols.map((c) => html`<label><input type="checkbox" value="${c}" ${raw(chosen.includes(c) ? "checked" : "")} /> ${c}</label>`).join(""))}
          </div>
        </details>
        <small>${hint}</small>
      </div>`;
    };
    const xlsx = isXlsxName(this.fileName);
    const own = this.project.getProfiles();
    const useOpts: [string, string][] = [
      ["", t("newFileProfile")],
      ...own.map((p) => [p.id, p.name] as [string, string]),
      ...PRESETS.map((p) => [p.id, fmt("readyMadeProfile", { name: p.name })] as [string, string]),
    ];
    const sign = d.sign;
    const amountField =
      sign.kind === "debitCredit"
        ? sel("debit", colOpts(true), sign.debit, t("fieldDebit")) + sel("credit", colOpts(true), sign.credit, t("fieldCredit"))
        : sel("amount", colOpts(true), d.columns.amount, t("fieldAmount"));
    const pre = d.preprocessor ? PREPROCESSORS.find((x) => x.id === d.preprocessor) : undefined;
    return html`<section class="card">
      <div class="card-head">
        <h3>${t("profileSettingsTitle")}</h3>
        <button type="button" class="sm ghost" data-imp="guess">${raw(icon("wand"))}${t("guessFromFile")}</button>
      </div>
      <div class="profile-pick">
        ${raw(sel("use", useOpts, this.existingId && own.some((p) => p.id === d.id) ? d.id : "", t("useProfile")))}
        <label class="field">${t("fieldName")}<input data-pf="name" value="${d.name}" /></label>
        <label class="field"
          >${t("fieldPattern")}<input class="mono" data-pf="filePattern" value="${d.filePattern}" /><small
            >${t("patternHint")}</small
          ></label
        >
      </div>
      <div class="prof-row">
        <div class="prof-label">${t("rowReading")}</div>
        ${raw(
          xlsx
            ? ""
            : sel(
                "delimiter",
                [
                  ["auto", t("delimiterAuto")],
                  [";", t("delimSemicolon")],
                  [",", t("delimComma")],
                  ["\\t", t("delimiterTab")],
                  ["|", "|"],
                ],
                d.delimiter === "\t" ? "\\t" : d.delimiter,
                t("fieldDelimiter"),
              ),
        )}
        ${raw(
          xlsx
            ? ""
            : sel(
                "encoding",
                [
                  ["auto", t("encodingAuto")],
                  ["utf-8", "UTF-8"],
                  ["utf-16le", "UTF-16 LE"],
                  ["utf-16be", "UTF-16 BE"],
                  ["windows-1252", "Windows-1252"],
                ],
                d.encoding,
                t("fieldEncoding"),
              ),
        )}
        <label class="field"
          >${t("fieldSkipRows")}<input type="number" min="0" data-pf="skipRows" value="${d.skipRows}" /><small
            >${t("skipRowsHint")}</small
          ></label
        >
        ${raw(
          xlsx
            ? sel(
                "sheet",
                this.sheets.map((x) => [x, x] as [string, string]),
                d.sheet || (this.sheets[0] ?? ""),
                t("fieldSheet"),
                t("sheetHint"),
              )
            : sel(
                "preprocessor",
                [["", t("noPreprocessor")], ...PREPROCESSORS.map((p) => [p.id, p.name] as [string, string])],
                d.preprocessor ?? "",
                t("fieldPreprocessor"),
                t("preprocessorHint"),
              ),
        )}
        <label class="field"
          >${t("fieldDateFormats")}<input class="mono" data-pf="dateFormats" list="pf-date-formats" value="${d.dateFormats}" /><small
            >${t("dateFormatHint")}</small
          >
          <datalist id="pf-date-formats">${raw(DATE_FORMATS.map((f) => html`<option value="${f}"></option>`).join(""))}</datalist></label
        >
        ${raw(xlsx ? "<span></span><span></span>" : "")}
        ${raw(
          !xlsx && pre
            ? html`<div class="prof-note small muted">
                ${raw(icon("table"))}<span
                  >${raw(fmt("preprocessorOn", { name: html`<b>${pre.name}</b>`, what: t(PRE_WHAT[pre.id] ?? "preUnknown"), link: html`<a href="#/settings/scripts">${t("tabScripts")}</a>` }))}</span
                >
              </div>`
            : "",
        )}
      </div>
      <div class="prof-row">
        <div class="prof-label">${t("rowColumns")}</div>
        ${raw(sel("date", colOpts(true), d.columns.date, t("fieldDate")))}
        ${raw(multi("description", t("fieldDescription"), t("oneOrMoreColumns")))}
        ${raw(multi("info", t("fieldInfo"), t("oneOrMoreColumns")))}
        ${raw(
          sel(
            "accountType",
            [
              ["fixed", t("accountTypeFixed")],
              ["column", t("accountTypeColumn")],
            ],
            d.accountColumn ? "column" : "fixed",
            t("fieldAccountType"),
            d.accountColumn ? t("accountColumnHint") : t("accountFixedHint"),
          ),
        )}
        ${raw(
          d.accountColumn
            ? sel(
                "account",
                cols.map((c) => [c, c] as [string, string]),
                d.accountColumn,
                t("fieldAccountColumn"),
              )
            : html`<label class="field">${t("fixedAccountName")}<input data-pf="accountName" value="${d.account}" /></label>`,
        )}
        <div class="prof-note small muted">${raw(icon("rule"))}${t("columnsNote")}</div>
      </div>
      <div class="prof-row">
        <div class="prof-label">${t("rowAmounts")}</div>
        ${raw(
          sel(
            "sign",
            [
              ["asis", t("signAsis")],
              ["flip", t("signFlip")],
              ["debitCredit", t("signDebitCredit")],
            ],
            sign.kind,
            t("fieldSign"),
          ),
        )}
        ${raw(amountField)}
        ${raw(
          sel(
            "decimalSeparator",
            [
              [",", t("decComma")],
              [".", t("decPoint")],
            ],
            d.decimalSeparator,
            t("fieldDecimal"),
          ),
        )}
        ${raw(
          sel(
            "thousandsSeparator",
            [
              ["", t("thousandsNone")],
              [".", "."],
              [",", ","],
              ["'", "'"],
            ],
            d.thousandsSeparator,
            t("fieldThousands"),
            t("thousandsHint"),
          ),
        )}
        ${raw(sign.kind === "debitCredit" ? "" : "<span></span>")}
      </div>
    </section>`;
  }

  previewCard(defaultOwner: string): string {
    if (!this.table)
      return html`<div class="preview-head"><h3>${t("previewTitle3")}</h3></div>
        <div class="note err small">${fmt("previewError", { e: this.error })}</div>`;
    const records = tableRecords(this.table);
    const rows = records.map((c) => normalizeRow(c, this.draft));
    const dateErrors = rows.filter((r) => r.date === null).length;
    const amountErrors = rows.filter((r) => r.amount === null).length;
    const ok = dateErrors + amountErrors === 0;
    const splits = this.project.getSplits();
    const owners = this.project.getSettings().accountOwners;
    const owner = (account: string, date: string | null) =>
      date
        ? splitParts(account, date, splits, defaultOwner, owners)
            .map((p) => (p.split && p.share < 1 ? `${p.owner} ${Math.round(p.share * 100)} %` : p.owner))
            .join(" · ")
        : "";
    const body = rows
      .slice(0, PREVIEW_ROWS)
      .map(
        (r, i) =>
          html`<tr>
            <td class="num ${r.date === null ? "bad-text" : ""}">
              ${r.date === null ? (records[i]?.[this.draft.columns.date] ?? "?") : formatDate(r.date)}
            </td>
            <td>${r.description}</td>
            <td class="muted">${r.info}</td>
            <td>${r.account}</td>
            <td class="muted">${owner(r.account, r.date)}</td>
            <td class="num ${r.amount === null ? "bad-text" : ""}">${r.amount === null ? "?" : `${formatAmount(r.amount)} €`}</td>
          </tr>`,
      )
      .join("");
    return html`<div class="preview-head">
        <h3>${t("previewTitle3")}</h3>
        <span class="pill ${ok ? "ok" : "warn"}"
          >${raw(icon(ok ? "check" : "alert"))}${fmt(ok ? "previewOk" : "previewProblems", { n: rows.length, e: dateErrors + amountErrors })}</span
        >
      </div>
      <div class="small muted preview-sub">${fmt("previewSub", { d: dateErrors, a: amountErrors })}</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${t("colDate")}</th>
              <th>${t("colDescription")}</th>
              <th>${t("colInfo")}</th>
              <th>${t("colAccount")}</th>
              <th>${t("colOwner")}</th>
              <th class="num">${t("colAmount")}</th>
            </tr>
          </thead>
          <tbody>
            ${raw(body)}
          </tbody>
        </table>
      </div>
      <div class="small muted preview-sub">${fmt("showingNofM", { a: Math.min(PREVIEW_ROWS, rows.length), n: rows.length })}</div>`;
  }
}

function safeSheets(bytes: Uint8Array): string[] {
  try {
    return sheetNames(bytes);
  } catch {
    return [];
  }
}

/** True when the profile reads the file and finds every column it maps. */
function fits(fileName: string, bytes: Uint8Array, profile: SourceProfile): boolean {
  try {
    return missingColumns(readTable(fileName, bytes, profile).headers, profile).length === 0;
  } catch {
    return false;
  }
}
