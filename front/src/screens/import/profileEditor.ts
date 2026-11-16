// File profile editor (Tuonti > Tiedostot > Muokkaa): the file as is with a role chosen on each
// column, the rows as they will be read (with a check), then the profile's name. The file's format
// (separator, encoding, date and number format) is folded into one line: it is detected, and opens
// by itself only when rows cannot be read. Who owns an account is chosen in Tarkistukset (new
// accounts) and Asetukset › Tilit, not here.
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
import { fmt, plural, t } from "../../ui/texts";
import { infoPop } from "../settings/parts";
import { draftProfile } from "../wizard";
import { drawer } from "../../ui/drawer";

/** Values shown for each column of the file. */
const EXAMPLES = 3;
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
    this.customDate = false;
    this.load();
  }

  guess(): void {
    this.customDate = false;
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
      case "dateFormatPick":
        // an example picked sets the format; "muu" keeps it and shows the code to type
        this.customDate = value === "custom";
        if (!this.customDate) d.dateFormats = value;
        return false;
      case "accountName":
        // the account of every row, when no column of the file has it
        d.account = value;
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

  reload(): void {
    this.load();
  }

  /** Problems that block saving, or "" when the profile can be saved. */
  problem(): string {
    const d = this.draft;
    if (!this.table) return fmt("previewError", { e: this.error });
    const missing = missingColumns(this.table.headers, d);
    if (missing.length) return fmt("colsMissing", { cols: missing.join(", ") });
    if (!d.name.trim()) return t("needProfileName");
    if (!d.columns.date) return t("needDateColumn");
    if (d.sign.kind === "debitCredit" ? !d.sign.debit || !d.sign.credit : !d.columns.amount) return t("needAmountColumn");
    if (d.columns.description.length === 0) return t("needDescriptionColumn");
    return "";
  }

  // ---- markup

  /** `back`: where the editor was opened from (Tuonti › Tiedostot, or Asetukset › Tiedostoprofiilit); back and Peruuta go there. */
  render(
    defaultOwner: string,
    statusPill: string,
    back: { href: string; label: string } = { href: "#/import/files", label: t("backToFiles") },
  ): string {
    return html` <div class="edit-head">
        <a class="btn sm ghost" href="${back.href}">${raw(icon("arrowL"))}${back.label}</a>
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
        ${raw(this.mapCard())}
        <section class="card flush" data-preview>${raw(this.previewCard(defaultOwner))}</section>
        ${raw(this.nameCard())}
      </div>
      <div class="actions flow-next">
        <a class="btn" href="${back.href}">${t("cancel")}</a><span class="grow"></span>
        <span class="small bad-text" data-problem>${this.problem()}</span>
        <button type="button" class="primary" data-imp="saveProfile" ${raw(this.problem() ? "disabled" : "")}>${t("saveProfile")}</button>
      </div>
      ${raw(this.readingOpen ? this.readingDrawer() : "")}`;
  }

  /** What a column is used for in the profile ("" = not used). */
  roleOf(col: string): Role {
    const d = this.draft;
    if (d.columns.date === col) return "date";
    if (d.sign.kind === "debitCredit") {
      if (d.sign.debit === col) return "debit";
      if (d.sign.credit === col) return "credit";
    } else if (d.columns.amount === col) return "amount";
    if (d.accountColumn === col) return "account";
    if (d.columns.description.includes(col)) return "description";
    if (d.columns.info.includes(col)) return "info";
    return "";
  }

  /**
   * Gives a column a role, chosen on the column itself. Date, amount, debit, credit and account
   * belong to one column each (picking one moves it); description and extra info can be several
   * columns, joined in the file's order.
   */
  setRole(col: string, role: Role): void {
    const d = this.draft;
    // the column leaves whatever it was
    if (d.columns.date === col) d.columns.date = "";
    if (d.columns.amount === col) d.columns.amount = "";
    if (d.sign.kind === "debitCredit") {
      if (d.sign.debit === col) d.sign.debit = "";
      if (d.sign.credit === col) d.sign.credit = "";
    }
    if (d.accountColumn === col) delete d.accountColumn;
    d.columns.description = d.columns.description.filter((c) => c !== col);
    d.columns.info = d.columns.info.filter((c) => c !== col);
    const order = this.table?.headers ?? [];
    const inOrder = (cols: string[]) => [...cols, col].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    switch (role) {
      case "date":
        d.columns.date = col;
        break;
      case "amount":
        d.columns.amount = col;
        break;
      case "debit":
        if (d.sign.kind === "debitCredit") d.sign.debit = col;
        break;
      case "credit":
        if (d.sign.kind === "debitCredit") d.sign.credit = col;
        break;
      case "account":
        d.accountColumn = col;
        break;
      case "description":
        d.columns.description = inOrder(d.columns.description);
        break;
      case "info":
        d.columns.info = inOrder(d.columns.info);
        break;
    }
  }

  /**
   * 1. The file as it is, with a choice on every column of what it is: the user recognises
   * "15.11.2024" and "-153,76" more easily than a header name. Under it the two choices that are
   * not columns (the sign, and the account name when no column has it), then the file's format,
   * folded into one line unless the rows cannot be read.
   */
  private mapCard(): string {
    const tb = this.table;
    const d = this.draft;
    const own = this.project.getProfiles();
    // "+ Uusi …" first with a line under it, as in every list that can add (see ui/combo.ts); then
    // the project's own profiles, a line, and the ready-made ones
    const useOpts: [string, string][] = [
      ["", `+ ${t("newFileProfile")}`],
      DIVIDER,
      ...own.map((p) => [p.id, p.name] as [string, string]),
      ...(own.length ? [DIVIDER] : []),
      ...PRESETS.map((p) => [p.id, fmt("readyMadeProfile", { name: p.name })] as [string, string]),
    ];
    // why the columns are chosen: behind an (i), so the card starts with the task, not with text
    const why = infoPop(t("mapWhyTitle"), [
      t("mapWhy"),
      fmt("mapHowWhen", { a: t("fieldDate"), b: t("fieldAmount") }),
      fmt("mapHowWhat", { a: t("fieldDescription"), b: t("fieldInfo") }),
      fmt("mapHowWho", { a: t("colAccount") }),
    ]);
    const head = html`<div class="map-head">
      <h3>${t("mapTitle")}</h3>
      ${raw(why)}
    </div>`;
    // the file profile: a label and its value
    const profile = html`<label class="src-row"
      ><span class="src-label">${t("profileLabel")}</span
      ><span class="src-value">${raw(select("use", useOpts, this.existingId && own.some((p) => p.id === d.id) ? d.id : ""))}</span></label
    >`;
    if (!tb)
      return html`<section class="card flush">
        <div class="map-top">${raw(head)}</div>
        <div class="map-source">${raw(profile)}${raw(this.readingRow())}</div>
        <div class="note err small map-error">${fmt("previewError", { e: this.error })}</div>
      </section>`;
    const roles: [Role, string][] = [
      ["", t("roleNone")],
      ["date", t("fieldDate")],
      ["description", t("fieldDescription")],
      ["info", t("fieldInfo")],
      ...(d.sign.kind === "debitCredit"
        ? ([
            ["debit", t("fieldDebit")],
            ["credit", t("fieldCredit")],
          ] as [Role, string][])
        : ([["amount", t("fieldAmount")]] as [Role, string][])),
      ["account", t("colAccount")],
    ];
    const cols = tb.headers;
    // one line per column of the file: its name, what it is, and a few of its values. The name and
    // the choice sit side by side; the values are there to recognise the column by.
    const examples = (j: number) => {
      const seen: string[] = [];
      for (const r of tb.rows) {
        const v = (r[j] ?? "").trim();
        if (v && !seen.includes(v)) seen.push(v);
        if (seen.length === EXAMPLES) break;
      }
      return seen;
    };
    const line = (c: string, j: number) => {
      const r = this.roleOf(c);
      const ex = examples(j);
      return html`<li class="col-line ${r ? "used" : ""}">
        <span class="col-name mono">${c}</span>
        <span class="col-ex mono small">${ex.length ? ex.join(" · ") : t("colEmpty")}</span>
        <select data-role-col="${c}" aria-label="${fmt("roleOfColumn", { c })}">
          ${raw(roles.map(([v, l]) => html`<option value="${v}" ${raw(v === r ? "selected" : "")}>${l}</option>`).join(""))}
        </select>
      </li>`;
    };
    // the file on the left (its column and what is in it), where it goes in FiRe on the right
    const table = html`<div class="col-head small muted" aria-hidden="true">
        <span class="col-group">${t("colGroupFile")}</span><span class="col-group data">${t("colGroupData")}</span>
        <span>${t("colColumn")}</span><span>${t("colExamples")}</span><span>${t("colUse")}</span>
      </div>
      <ul class="col-list">
        ${raw(cols.map(line).join(""))}
      </ul>`;
    const sign = select(
      "sign",
      [
        ["asis", t("signAsis")],
        ["flip", t("signFlip")],
        ["debitCredit", t("signDebitCredit")],
      ],
      d.sign.kind,
    );
    const account = d.accountColumn
      ? ""
      : html`<label class="field"
          ><span>${t("fixedAccountName")}</span><input data-pf="accountName" value="${d.account}" /><small
            >${t("accountFixedHint")}</small
          ></label
        >`;
    const check = this.columnCheck(cols);
    return html`<section class="card flush">
      <div class="map-top">${raw(head)}</div>
      <!-- the source first: the profile, and the reading settings that decide what the columns are -->
      <div class="map-source">${raw(profile)}${raw(this.readingRow())}</div>
      ${raw(this.statusLine(cols.length, tb.rows.length))} ${raw(check)} ${raw(table)}
      <div class="map-foot">
        <div class="map-fields">
          <label class="field"><span>${t("fieldSign")}</span>${raw(sign)}</label>
          ${raw(account)}
        </div>
      </div>
    </section>`;
  }

  /**
   * One chip per field, so what is done and what is missing shows at a glance: "✓ Selite: Saaja +
   * Viesti" for a field set (several columns are joined, in the file's order), an orange chip for a
   * field every profile needs, a quiet one for an optional field left out.
   */
  private statusLine(columns: number, rows: number): string {
    const d = this.draft;
    const chip = (state: "ok" | "todo" | "off", text: string) =>
      html`<li class="chip-${state}">
        ${raw(state === "ok" ? icon("check") : state === "todo" ? icon("alert") : "")}<span>${text}</span>
      </li>`;
    const field = (label: string, cols: string[], needed: boolean) =>
      cols.length
        ? chip("ok", fmt("statusSet", { f: label, c: cols.join(" + ") }))
        : needed
          ? chip("todo", fmt("statusTodo", { f: label }))
          : chip("off", fmt("statusOff", { f: label }));
    const one = (c: string) => (c ? [c] : []);
    const amount =
      d.sign.kind === "debitCredit"
        ? field(t("fieldDebit"), one(d.sign.debit), true) + field(t("fieldCredit"), one(d.sign.credit), true)
        : field(t("fieldAmount"), one(d.columns.amount), true);
    const account = d.accountColumn
      ? field(t("colAccount"), [d.accountColumn], false)
      : chip(
          d.account.trim() ? "ok" : "todo",
          d.account.trim()
            ? fmt("statusSet", { f: t("fixedAccountName"), c: d.account })
            : fmt("statusNoAccount", { f: t("fixedAccountName") }),
        );
    return html`<div class="map-status">
      <p class="small muted map-status-title">${t("statusTitle")}</p>
      <ul>
        ${raw(field(t("fieldDate"), one(d.columns.date), true))} ${raw(field(t("fieldDescription"), d.columns.description, true))}
        ${raw(amount)} ${raw(field(t("fieldInfo"), d.columns.info, false))} ${raw(account)}
      </ul>
      <span class="small muted">${plural(columns, "colsCountOne", "colsCount")} · ${fmt("rowsCount", { n: rows })}</span>
    </div>`;
  }

  /**
   * What is wrong, said above the columns: columns the profile names that the file does not have
   * (another bank's file, or a wrong separator), a file read as one column (almost always a wrong
   * separator), and rows whose date or amount cannot be read (the date or number format). Each
   * comes with a button to the reading settings. The fields still to choose show in the status line.
   */
  private columnCheck(cols: string[]): string {
    const { errors, rowsOnly } = this.readingProblems(cols);
    if (!errors.length) return "";
    const hint = rowsOnly ? t("rowsUnreadHint") : t("colsCheckReading");
    // columns the file does not have are on no line of the list: this takes them out of the profile
    // (not when the file reads as one column: then the separator is wrong, not the profile)
    const drop =
      cols.length > 1 && missingColumns(cols, this.draft).length
        ? html`<button type="button" class="sm" data-imp="dropMissing">${raw(icon("trash"))}${t("colsDropMissing")}</button>`
        : "";
    return html`<ul class="map-check small">
      ${raw(errors.map((e) => html`<li class="bad-text">${raw(icon("alert"))}<span>${e}</span></li>`).join(""))}
      <li class="muted"><span>${hint}</span></li>
      <li>
        <button type="button" class="sm" data-imp="readingOpen">${raw(icon("pencil"))}${t("readingChange")}</button>
        ${raw(drop)}
      </li>
    </ul>`;
  }

  /**
   * Takes out of the profile every column the file does not have (another bank's file, or a bank
   * that changed its export): such a column has no line to change its role on, and it blocks saving.
   */
  dropMissing(): void {
    const d = this.draft;
    const has = (c: string) => this.table?.headers.includes(c) ?? true;
    if (!has(d.columns.date)) d.columns.date = "";
    if (!has(d.columns.amount)) d.columns.amount = "";
    if (d.sign.kind === "debitCredit") {
      if (!has(d.sign.debit)) d.sign.debit = "";
      if (!has(d.sign.credit)) d.sign.credit = "";
    }
    if (d.accountColumn && !has(d.accountColumn)) delete d.accountColumn;
    d.columns.description = d.columns.description.filter(has);
    d.columns.info = d.columns.info.filter(has);
  }

  /**
   * What the reading settings give that is wrong, the likely cause first: columns the profile
   * names that are not in the file, the file read as one column, then rows whose date or amount
   * cannot be read (asked only when the columns match). `rowsOnly`: only the last kind.
   */
  private readingProblems(cols: string[]): { errors: string[]; rowsOnly: boolean } {
    const errors: string[] = [];
    const missing = missingColumns(cols, this.draft);
    if (missing.length) errors.push(fmt("colsMissing", { cols: missing.join(", ") }));
    const oneColumn = cols.length === 1;
    if (oneColumn) errors.push(t("colsOnlyOne"));
    const bad = missing.length === 0 && !oneColumn ? this.unreadRows() : 0;
    if (bad) errors.push(fmt("rowsUnread", { n: bad }));
    return { errors, rowsOnly: bad > 0 && errors.length === 1 };
  }

  /** The reading settings' editor is open (a drawer, as every editor in the app). */
  readingOpen = false;
  /** The reading settings as they were when the editor opened, for Peruuta. */
  private readingSnap: Partial<SourceProfile> | null = null;
  /** Whether the date format was typed by hand when the editor opened. */
  private readingSnapCustom = false;
  /** The date format is typed by hand (a format the examples do not list). */
  private customDate = false;

  private static readonly READING = [
    "delimiter",
    "encoding",
    "skipRows",
    "sheet",
    "preprocessor",
    "dateFormats",
    "decimalSeparator",
    "thousandsSeparator",
  ] as const;

  openReading(): void {
    const d = this.draft;
    this.readingSnap = Object.fromEntries(ProfileEditor.READING.filter((k) => d[k] !== undefined).map((k) => [k, d[k]]));
    this.readingSnapCustom = this.customDate;
    this.readingOpen = true;
  }

  /** Käytä: the settings stay (they are saved with the profile); the editor closes. */
  applyReading(): void {
    this.readingOpen = false;
    this.readingSnap = null;
  }

  /** Something was changed in the reading settings since their editor opened (Peruuta then asks first). */
  readingChanged(): boolean {
    const snap = this.readingSnap;
    if (!snap) return false;
    const d = this.draft as unknown as Record<string, unknown>;
    return ProfileEditor.READING.some((k) => d[k] !== (snap as Record<string, unknown>)[k]) || this.customDate !== this.readingSnapCustom;
  }

  /** Peruuta: the settings as they were, the file read again with them. */
  cancelReading(): void {
    const snap = this.readingSnap;
    if (snap) {
      const d = this.draft as unknown as Record<string, unknown>;
      for (const k of ProfileEditor.READING) {
        if (k in snap) d[k] = snap[k];
        else delete d[k];
      }
      this.customDate = this.readingSnapCustom;
      this.load();
    }
    this.readingOpen = false;
    this.readingSnap = null;
  }

  /** How many rows cannot be read: their date or amount fails with these settings (0 while those columns are not chosen). */
  private unreadRows(): number {
    if (!this.table) return 0;
    // with the date or amount column not chosen yet, the rows fail for that reason, not the reading
    const d = this.draft;
    const amount = d.sign.kind === "debitCredit" ? d.sign.debit && d.sign.credit : d.columns.amount;
    if (!d.columns.date || !amount) return 0;
    // asked several times per redraw (the panel, the error box, the editor): counted once per draft and file read
    const key = JSON.stringify(d);
    if (this.unreadCache?.table === this.table && this.unreadCache.key === key) return this.unreadCache.n;
    const n = tableRecords(this.table).filter((c) => {
      const r = normalizeRow(c, this.draft);
      return r.date === null || r.amount === null;
    }).length;
    this.unreadCache = { table: this.table, key, n };
    return n;
  }

  private unreadCache: { table: Table; key: string; n: number } | null = null;

  /** The choices of the reading settings, shared by the summary line and the editor. */
  private readingChoices() {
    return {
      delims: [
        ["auto", t("delimiterAuto")],
        [";", t("delimSemicolon")],
        [",", t("delimComma")],
        ["\\t", t("delimiterTab")],
        ["|", "|"],
      ] as [string, string][],
      encodings: [
        ["auto", t("encodingAuto")],
        ["utf-8", "UTF-8"],
        ["utf-16le", "UTF-16 LE"],
        ["utf-16be", "UTF-16 BE"],
        ["windows-1252", "Windows-1252"],
      ] as [string, string][],
      decimals: [
        [",", t("decComma")],
        [".", t("decPoint")],
      ] as [string, string][],
      thousands: [
        ["", t("thousandsNone")],
        [".", "."],
        [",", ","],
        ["'", "'"],
      ] as [string, string][],
    };
  }

  /**
   * The file's reading settings (separator, encoding, rows to skip, date and number format) as one
   * line, with a pen that opens them in the editor. Detected from the file, so usually right.
   */
  private readingRow(): string {
    const d = this.draft;
    const xlsx = isXlsxName(this.fileName);
    const c = this.readingChoices();
    const delim = d.delimiter === "\t" ? "\\t" : d.delimiter;
    const label = (opts: [string, string][], v: string) => opts.find(([x]) => x === v)?.[1] ?? v;
    const pre = d.preprocessor ? PREPROCESSORS.find((x) => x.id === d.preprocessor) : undefined;
    // only what tells this file apart (no "0 rows skipped", no "no thousands separator")
    const summary = [
      xlsx ? `${t("fieldSheet")}: ${d.sheet || (this.sheets[0] ?? "")}` : `${t("fieldDelimiter")}: ${label(c.delims, delim)}`,
      xlsx ? "" : `${t("fieldEncoding")}: ${label(c.encodings, d.encoding)}`,
      d.skipRows ? fmt("skipRowsN", { n: d.skipRows }) : "",
      pre ? `${t("fieldPreprocessor")}: ${pre.name}` : "",
      `${t("fieldDate")}: ${dateExample(d.dateFormats)}`,
      `${t("fieldDecimal")}: ${label(c.decimals, d.decimalSeparator)}`,
      d.thousandsSeparator ? `${t("fieldThousands")}: ${d.thousandsSeparator}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    // a panel: whether the file reads with these settings (check or alert), the settings as its
    // subtitle, and its two actions: guess them (and the columns) from the file, or edit them
    const ok = this.table !== null && this.readingProblems(this.table.headers).errors.length === 0;
    return html`<div class="reading-panel ${ok ? "ok" : "warn"}">
      <span class="reading-icon">${raw(icon(ok ? "check" : "alert"))}</span>
      <div class="reading-text">
        <b>${t("formatTitle")}</b>
        <span class="small muted">${summary}</span>
      </div>
      <div class="reading-actions">
        <button type="button" class="sm" data-imp="guess" title="${t("guessHint")}">${raw(icon("wand"))}${t("guessFromFile")}</button>
        <button type="button" class="sm" data-imp="readingOpen" title="${t("readingChange")}">${raw(icon("pencil"))}${t("edit")}</button>
      </div>
    </div>`;
  }

  /**
   * Under the reading settings' fields: what they give right now (the file's size, or what fails),
   * so a change shows its effect without closing the editor. Redrawn alone while a field is typed in.
   */
  readingResult(): string {
    if (!this.table) return html`<p class="small bad-text">${fmt("previewError", { e: this.error })}</p>`;
    const problems = this.readingProblems(this.table.headers).errors;
    if (problems.length) return html`<p class="small bad-text">${problems.join(" ")}</p>`;
    return html`<p class="small muted">
      ${fmt("readingResult", { c: plural(this.table.headers.length, "colsCountOne", "colsCount"), n: this.table.rows.length })}
    </p>`;
  }

  /** The reading settings' fields in the editor drawer. */
  private readingDrawer(): string {
    const d = this.draft;
    const xlsx = isXlsxName(this.fileName);
    const c = this.readingChoices();
    const delim = d.delimiter === "\t" ? "\\t" : d.delimiter;
    const pre = d.preprocessor ? PREPROCESSORS.find((x) => x.id === d.preprocessor) : undefined;
    const field = (labelText: string, control: string, hint = "") =>
      html`<label class="field"><span>${labelText}</span>${raw(control)}${raw(hint ? html`<small>${hint}</small>` : "")}</label>`;
    const known = DATE_FORMATS.includes(d.dateFormats) && !this.customDate;
    const dateOpts: [string, string][] = [...DATE_FORMATS.map((f) => [f, dateExample(f)] as [string, string]), ["custom", t("dateCustom")]];
    const sample = this.table && d.columns.date ? (tableRecords(this.table)[0]?.[d.columns.date] ?? "") : "";
    const group = (title: string, fields: string[]) =>
      html`<div class="field-group">
        <div class="group-label">${title}</div>
        <div class="field-grid n2">${raw(fields.filter(Boolean).join(""))}</div>
      </div>`;
    const file = group(t("readingFile"), [
      xlsx ? "" : field(t("fieldDelimiter"), select("delimiter", c.delims, delim)),
      xlsx ? "" : field(t("fieldEncoding"), select("encoding", c.encodings, d.encoding)),
      xlsx
        ? field(
            t("fieldSheet"),
            select(
              "sheet",
              this.sheets.map((x) => [x, x] as [string, string]),
              d.sheet || (this.sheets[0] ?? ""),
            ),
            t("sheetHint"),
          )
        : "",
      field(t("fieldSkipRows"), html`<input type="number" min="0" data-pf="skipRows" value="${d.skipRows}" />`, t("skipRowsHint")),
      xlsx
        ? ""
        : field(
            t("fieldPreprocessor"),
            select(
              "preprocessor",
              [["", t("noPreprocessor")], ...PREPROCESSORS.map((p) => [p.id, p.name] as [string, string])],
              d.preprocessor ?? "",
            ),
            t("preprocessorHint"),
          ),
    ]);
    const values = group(t("readingValues"), [
      field(
        t("fieldDateFormats"),
        select("dateFormatPick", dateOpts, known ? d.dateFormats : "custom"),
        sample ? fmt("dateInFile", { v: sample }) : "",
      ),
      known
        ? ""
        : field(t("dateFormatCode"), html`<input class="mono" data-pf="dateFormats" value="${d.dateFormats}" />`, t("dateFormatHint")),
      field(t("fieldDecimal"), select("decimalSeparator", c.decimals, d.decimalSeparator)),
      field(t("fieldThousands"), select("thousandsSeparator", c.thousands, d.thousandsSeparator), t("thousandsHint")),
    ]);
    const preNote =
      !xlsx && pre
        ? html`<p class="small muted">
            ${raw(
              fmt("preprocessorOn", {
                name: html`<b>${pre.name}</b>`,
                what: t(PRE_WHAT[pre.id] ?? "preUnknown"),
                link: html`<a href="#/settings/scripts">${t("tabScripts")}</a>`,
              }),
            )}
          </p>`
        : "";
    // what the settings give right now, so a change shows its effect without closing the editor
    return drawer({
      title: t("formatTitle"),
      body: file + values + preNote + html`<div data-reading-result>${raw(this.readingResult())}</div>`,
      save: 'data-imp="readingApply"',
      cancel: 'data-imp="readingCancel"',
      saveLabel: t("apply"),
    });
  }
  /** 3. The profile's name, and how later files are recognised as this kind. */
  private nameCard(): string {
    const d = this.draft;
    return html`<section class="card">
      <h3>${t("nameTitle")}</h3>
      <div class="name-fields">
        <label class="field"><span>${t("fieldName")}</span><input data-pf="name" value="${d.name}" /></label>
        <label class="field"
          ><span>${t("fieldPattern")}</span><input class="mono" data-pf="filePattern" value="${d.filePattern}" /><small
            >${t("patternHint")}</small
          ></label
        >
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
    // a row with a bad date and a bad amount is one row that cannot be read
    const unread = rows.filter((r) => r.date === null || r.amount === null).length;
    const ok = unread === 0;
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
          >${raw(icon(ok ? "check" : "alert"))}${fmt(ok ? "previewOk" : "previewProblems", { n: rows.length, e: unread })}</span
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

/** What a column of the file is used for ("" = not used). */
export type Role = "" | "date" | "description" | "info" | "amount" | "debit" | "credit" | "account";

/** A line between groups of a select's options (an <hr> in the list; a browser without it skips it). */
const DIVIDER: [string, string] = ["\u0000hr", ""];

/** A select for one profile field (data-pf). */
function select(field: string, options: [string, string][], value: string): string {
  return html`<select data-pf="${field}">
    ${raw(
      options
        .map(([v, l]) => (v === DIVIDER[0] ? "<hr />" : html`<option value="${v}" ${raw(v === value ? "selected" : "")}>${l}</option>`))
        .join(""),
    )}
  </select>`;
}

/**
 * A date format shown as the last day of 2026 written in it ("%d.%m.%Y" is "31.12.2026"): people
 * recognise a date, not a format code. Several formats (a|b) read "a / b".
 */
export function dateExample(formats: string): string {
  const parts: Record<string, string> = { d: "31", m: "12", Y: "2026", y: "26", H: "14", M: "05", S: "09", f: "000" };
  return formats
    .split("|")
    .map((f) => f.replace(/%([dmYyHMSf])/g, (_, k: string) => parts[k] ?? ""))
    .join(" / ");
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
