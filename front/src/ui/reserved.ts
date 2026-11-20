// The reserved names' texts (Asetukset › Varatut nimet and Luokat): what each drives in the reports
// and its meaning in the UI language. The names themselves are in engine/reserved.ts. Also the
// category combos' options: the project's category list, the reserved names marked.
import type { CategoryEntry, CategoryPath } from "../engine/categories";
import { RESERVED, reservedNode, type Reserved } from "../engine/reserved";
import type { ComboOption } from "./combo";
import { fmt, t, type TextKey } from "./texts";

/** Per reserved name: what it drives in the reports, and its meaning in the UI language (the name itself in Finnish). */
const TEXTS: Record<string, { what: TextKey; label: TextKey }> = {
  tulot: { what: "resTulot", label: "classTulot" },
  menot: { what: "resMenot", label: "classMenot" },
  varat: { what: "resVarat", label: "classVarat" },
  velat: { what: "resVelat", label: "classVelat" },
  pois: { what: "resPois", label: "classPois" },
  ansiotulot: { what: "resAnsiotulot", label: "resLabelAnsiotulot" },
  pääomatulot: { what: "resPaaomatulot", label: "resLabelPaaomatulot" },
  sijoitusvarallisuus: { what: "resSijoitusvarallisuus", label: "resLabelSijoitusvarallisuus" },
  sijoitusvelat: { what: "resSijoitusvelat", label: "resLabelSijoitusvelat" },
  osinkotulot: { what: "resOsinkotulot", label: "resLabelOsinkotulot" },
};

/** What a reserved name drives in the reports. */
export function reservedWhat(r: Reserved): string {
  return t(TEXTS[r.name]!.what);
}

/** A reserved name's meaning, when the UI language words it differently ("earned income"); else "". */
export function reservedLabel(r: Reserved): string {
  const label = t(TEXTS[r.name]!.label);
  return label.toLowerCase() === r.name ? "" : label;
}

function option(node: CategoryPath): ComboOption {
  const r = reservedNode(node);
  if (!r) return { value: node.subCategory || node.category };
  const label = reservedLabel(r);
  return { value: r.name, hint: label ? fmt("resHintLabel", { label }) : t("resHint") };
}

/**
 * A category combo's options from the category list: the categories of class `cls` (of every class
 * when ""), or the subcategories of `category` in that class. The reserved subcategories come in
 * every category, as the reports find them anywhere. Reserved names first, marked; each name once.
 */
export function categoryOptions(list: readonly CategoryEntry[], level: "category" | "subCategory", cls = "", category = ""): ComboOption[] {
  const c = cls.trim().toLowerCase();
  const cat = category.trim().toLowerCase();
  const entries = list.filter((e) => !c || e.class === c);
  const nodes: CategoryPath[] =
    level === "category"
      ? entries.map((e) => ({ class: e.class, category: e.category, subCategory: "" }))
      : [
          ...RESERVED.filter((r) => r.level === "subCategory").map((r) => ({ class: c, category: cat, subCategory: r.name })),
          ...entries
            .filter((e) => !cat || e.category.toLowerCase() === cat)
            .flatMap((e) => e.subCategories.map((s) => ({ class: e.class, category: e.category, subCategory: s }))),
        ];
  const options = nodes.map(option);
  const seen = new Set<string>();
  const once = options.filter((o) => !seen.has(o.value.toLowerCase()) && seen.add(o.value.toLowerCase()));
  const byName = (a: ComboOption, b: ComboOption) => a.value.localeCompare(b.value, "fi");
  return [...once.filter((o) => o.hint).sort(byName), ...once.filter((o) => !o.hint).sort(byName)];
}
