// A row's classification in tables: a colour-coded class tag, the category, and the subcategory
// under it in smaller text, so long names never wrap mid-line.
import { html, raw } from "./html";
import { t, type TextKey } from "./texts";

/** The classes in display order, with the text key of each. Internal keys stay Finnish. */
export const CLASSES = ["menot", "tulot", "varat", "velat", "pois"] as const;
export const CLASS_LABEL: Record<string, TextKey> = {
  menot: "classMenot",
  tulot: "classTulot",
  varat: "classVarat",
  velat: "classVelat",
  pois: "classPois",
};

export function classification(cls: string, category: string, subCategory: string): string {
  if (!cls) return html`<span class="pill warn">${t("uncategorised")}</span>`;
  const c = cls.toLowerCase();
  return html`<div class="classif">
    <span class="cls cls-${c}">${c}</span>
    <div class="cat"><span>${category || t("unnamed")}</span>${raw(subCategory ? html`<small>${subCategory}</small>` : "")}</div>
  </div>`;
}
