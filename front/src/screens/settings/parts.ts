// Pieces of the settings screen that depend only on their arguments: what a fix changes, the
// reserved names box, and the (i) note.
import type { Fix } from "../../engine/types";
import type { FixValues } from "../../project/service";
import type { Project } from "../../storage/project";
import { formatAmount, formatCount, formatDate } from "../../ui/format";
import { html, raw } from "../../ui/html";
import { icon } from "../../ui/icons";
import { RESERVED } from "../../engine/reserved";
import { reservedLabel, reservedWhat } from "../../ui/reserved";
import { fmt, t } from "../../ui/texts";

export /** What a fix changes, as "field: before → after" lines; before is the transaction without fixes. */
function fixChanges(f: Fix, orig: FixValues | null): string {
  // v2 fixes often repeat fields as they were; only real changes are shown
  const line = (label: string, before: string, after: string) =>
    before.toLowerCase() === after.toLowerCase()
      ? ""
      : // label on the left; the value before above the value after, so the two line up
        html`<div class="fix-change">
          <span class="muted k">${label}</span>${raw(before ? html`<s class="muted">${before}</s>` : "")}<b
            >${before ? "→ " : ""}${after}</b
          >
        </div>`;
  const out: string[] = [];
  if (f.parts) {
    out.push(
      line(
        t("fixPartsLabel"),
        "",
        f.parts.map((x) => `${formatAmount(x.amount)} € ${[x.class, x.category, x.subCategory].filter(Boolean).join(" › ")}`).join(" · "),
      ),
    );
  }
  if (f.date) out.push(line(t("colDate"), orig ? formatDate(orig.date) : "", formatDate(f.date)));
  if (f.description) out.push(line(t("colDescription"), orig?.description ?? "", f.description));
  if (f.info) out.push(line(t("colInfo"), orig?.info ?? "", f.info));
  if (f.amount !== undefined && Number.isFinite(f.amount))
    out.push(line(t("colAmount"), orig ? `${formatAmount(orig.amount ?? 0)} €` : "", `${formatAmount(f.amount)} €`));
  if (f.class || f.category || f.subCategory) {
    const was = orig ? [orig.class, orig.category, orig.subCategory] : ["", "", ""];
    const now = [f.class || was[0], f.category || was[1], f.subCategory || was[2]];
    const text = (xs: (string | undefined)[]) => xs.filter(Boolean).join(" › ");
    out.push(line(t("colClassification"), orig ? text(was) || t("uncategorised") : "", text(now)));
  }
  if (f.owner) out.push(html`<div class="fix-change full small muted">${fmt("fixOnlyOwner", { o: f.owner })}</div>`);
  return out.join("") || html`<span class="muted small">${t("fixNoChange")}</span>`;
}

const LEVEL_LABEL = { class: "fieldClass", category: "fieldCategory", subCategory: "fieldSubCategory" } as const;

/** The reserved names, what each drives in the reports, and how many ledger rows use it now. */
export function reservedNames(p: Project): string {
  const ledger = p.getLedger();
  const rows = RESERVED.map((r) => {
    const n = ledger.filter((x) => x[r.level].toLowerCase() === r.name).length;
    return html`<tr>
      <td><span class="mono">${r.name}</span>${raw(reservedLabel(r) ? html`<div class="small muted">${reservedLabel(r)}</div>` : "")}</td>
      <td class="muted">${t(LEVEL_LABEL[r.level])}</td>
      <td>${reservedWhat(r)}</td>
      <td class="num ${n ? "" : "warn-text"}">${n ? fmt("resRows", { n: formatCount(n) }) : t("resUnused")}</td>
    </tr>`;
  }).join("");
  return html`<details class="reserved">
    <summary>${t("resTitle")}</summary>
    <p class="small muted">${t("resBody")}</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("resName")}</th>
            <th>${t("resLevel")}</th>
            <th>${t("resWhat")}</th>
            <th class="num">${t("resUse")}</th>
          </tr>
        </thead>
        <tbody>
          ${raw(rows)}
        </tbody>
      </table>
    </div>
  </details>`;
}

export /** An (i) that explains while hovered (or focused by keyboard): a title line and paragraphs. */
function infoPop(title: string, lines: string[]): string {
  const id = `pop-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return html`<span class="info-pop" tabindex="0" aria-label="${title}" aria-describedby="${id}"
    >${raw(icon("info"))}
    <span class="pop" role="tooltip" id="${id}"
      ><b>${title}</b>${raw(lines.map((l) => html`<span class="p">${l}</span>`).join(""))}</span
    ></span
  >`;
}
