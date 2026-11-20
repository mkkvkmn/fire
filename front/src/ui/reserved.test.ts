// Tests the category combos' options from the category list: the class's own categories, the
// reserved names marked and first, each name once.
import { afterAll, describe, expect, it } from "vitest";
import { withPaths } from "../engine/categories";
import { RESERVED, RESERVED_PATHS } from "../engine/reserved";
import { categoryOptions, reservedLabel, reservedWhat } from "./reserved";
import { setLang } from "./texts";

afterAll(() => setLang("fi"));

const list = withPaths(
  [],
  [
    ...RESERVED_PATHS,
    { class: "tulot", category: "palkka", subCategory: "" },
    { class: "tulot", category: "Ansiotulot", subCategory: "bonus" },
    { class: "menot", category: "ruoka", subCategory: "kauppa" },
  ],
);

describe("category combo options", () => {
  it("offers a class's own categories, the reserved ones first and marked", () => {
    setLang("fi");
    expect(categoryOptions(list, "category", "tulot")).toEqual([
      { value: "ansiotulot", hint: "varattu" },
      { value: "pääomatulot", hint: "varattu" },
      { value: "palkka" },
    ]);
    expect(categoryOptions(list, "category", "Varat").map((o) => o.value)).toEqual(["sijoitusvarallisuus"]);
    expect(categoryOptions(list, "category", "menot")).toEqual([{ value: "ruoka" }]);
  });

  it("offers every class's categories when no class is chosen, each name once", () => {
    setLang("fi");
    expect(categoryOptions(list, "category").map((o) => o.value)).toEqual([
      "ansiotulot",
      "pääomatulot",
      "sijoitusvarallisuus",
      "sijoitusvelat",
      "palkka",
      "ruoka",
    ]);
  });

  it("offers the category's subcategories, and osinkotulot in every category with its English meaning", () => {
    setLang("en");
    expect(categoryOptions(list, "subCategory", "menot", "ruoka")).toEqual([
      { value: "osinkotulot", hint: "reserved: dividend income" },
      { value: "kauppa" },
    ]);
    expect(categoryOptions(list, "subCategory", "tulot", "ansiotulot").map((o) => o.value)).toEqual(["osinkotulot", "bonus"]);
  });

  it("has the texts of every reserved name in both languages", () => {
    for (const lang of ["fi", "en"] as const) {
      setLang(lang);
      for (const r of RESERVED) {
        expect(reservedWhat(r), r.name).not.toBe("");
        expect(typeof reservedLabel(r), r.name).toBe("string");
      }
    }
    setLang("en");
    expect(reservedLabel(RESERVED.find((r) => r.name === "ansiotulot")!)).toBe("earned income");
  });
});
