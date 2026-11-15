// Renders a ledger diff: totals, a per-month summary and the first changed rows.
import type { LedgerDiff } from "../engine/diff";
import type { LedgerRow } from "../engine/types";
import { formatAmount, formatCount, formatDate } from "./format";
import { html, raw } from "./html";
import { fmt, t, type TextKey } from "./texts";

const MAX_ROWS = 100;

function label(r: LedgerRow): string {
  return [r.class, r.category, r.subCategory].filter(Boolean).join(" / ") || "-";
}

export function renderDiff(d: LedgerDiff): string {
  if (d.added.length + d.removed.length + d.changed.length === 0) return html`<p class="ok-text">${t("diffNone")}</p>`;
  const months = d.months
    .map(
      (m) =>
        html`<tr>
          <td>${m.month}</td>
          <td class="num">${formatCount(m.added)}</td>
          <td class="num">${formatCount(m.removed)}</td>
          <td class="num">${formatCount(m.changed)}</td>
          <td class="num">${formatAmount(m.amountDelta)}</td>
        </tr>`,
    )
    .join("");
  const line = (kind: TextKey, r: LedgerRow, change: string) =>
    html`<tr>
      <td>${t(kind)}</td>
      <td>${formatDate(r.date)}</td>
      <td>${r.owner}</td>
      <td>${r.description}</td>
      <td>${raw(change)}</td>
    </tr>`;
  const rows = [
    ...d.changed.map((c) => {
      const parts: string[] = [];
      if (c.fields.some((f) => f === "class" || f === "category" || f === "subCategory"))
        parts.push(`${label(c.before)} → ${label(c.after)}`);
      if (c.fields.includes("amount")) parts.push(`${formatAmount(c.before.amount)} → ${formatAmount(c.after.amount)}`);
      if (c.fields.includes("date")) parts.push(`${formatDate(c.before.date)} → ${formatDate(c.after.date)}`);
      if (c.fields.includes("owner")) parts.push(`${c.before.owner} → ${c.after.owner}`);
      return line("diffChanged", c.after, html`${parts.join(", ")}`);
    }),
    ...d.added.map((r) => line("diffAdded", r, html`${formatAmount(r.amount)}, ${label(r)}`)),
    ...d.removed.map((r) => line("diffRemoved", r, html`${formatAmount(r.amount)}, ${label(r)}`)),
  ];
  return html`
    <p>${fmt("diffTotals", { a: d.added.length, r: d.removed.length, c: d.changed.length })}</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("colMonth")}</th>
            <th class="num">${t("diffAdded")}</th>
            <th class="num">${t("diffRemoved")}</th>
            <th class="num">${t("diffChanged")}</th>
            <th class="num">${t("diffAmountDelta")}</th>
          </tr>
        </thead>
        <tbody>
          ${raw(months)}
        </tbody>
      </table>
    </div>
    <details class="diff-rows">
      <summary>${t("diffShowRows")}</summary>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>${t("colDate")}</th>
              <th>${t("colOwner")}</th>
              <th>${t("colDescription")}</th>
              <th>${t("diffWhat")}</th>
            </tr>
          </thead>
          <tbody>
            ${raw(rows.slice(0, MAX_ROWS).join(""))}
          </tbody>
        </table>
      </div>
      ${raw(rows.length > MAX_ROWS ? html`<p class="muted">${fmt("diffMoreRows", { n: rows.length - MAX_ROWS })}</p>` : "")}
    </details>
  `;
}
