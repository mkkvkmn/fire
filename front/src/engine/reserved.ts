// The names the reports look for in the classification (analytics/measures.ts keys on them). The
// stored name is always this Finnish one, in either language: a project reads the same in both.
// Asetukset > Luokat keeps them locked (project/categories.ts); their texts are in ui/reserved.ts.
import type { CategoryPath } from "./categories";

export type ReservedLevel = "class" | "category" | "subCategory";

export interface Reserved {
  name: string;
  level: ReservedLevel;
  /** For a category: the class it belongs under. */
  cls?: string;
}

/** Matched without case; any other name is free. */
export const RESERVED: Reserved[] = [
  { name: "tulot", level: "class" },
  { name: "menot", level: "class" },
  { name: "varat", level: "class" },
  { name: "velat", level: "class" },
  { name: "pois", level: "class" },
  { name: "ansiotulot", level: "category", cls: "tulot" },
  { name: "pääomatulot", level: "category", cls: "tulot" },
  { name: "sijoitusvarallisuus", level: "category", cls: "varat" },
  { name: "sijoitusvelat", level: "category", cls: "velat" },
  { name: "osinkotulot", level: "subCategory" },
];

/**
 * Where the reserved names stand in a new project's category list. The reports find osinkotulot in
 * any category; it starts under pääomatulot, where dividends belong.
 */
export const RESERVED_PATHS: CategoryPath[] = [
  ...RESERVED.filter((r) => r.level === "category").map((r) => ({ class: r.cls!, category: r.name, subCategory: "" })),
  { class: "tulot", category: "pääomatulot", subCategory: "osinkotulot" },
];

/** The reserved name a node of the category list is, if any: a class, a category of its own class, or a subcategory anywhere. */
export function reservedNode(node: CategoryPath): Reserved | undefined {
  const name = (node.subCategory || node.category || node.class).toLowerCase();
  const level: ReservedLevel = node.subCategory ? "subCategory" : node.category ? "category" : "class";
  return RESERVED.find((r) => r.name === name && r.level === level && (level !== "category" || r.cls === node.class.toLowerCase()));
}
