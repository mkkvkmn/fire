// Tests the use text of the category manager: the counts show only the actual rows, and a node only
// the target rows of locked months use gets its own text.
import { describe, expect, it } from "vitest";
import { fmt } from "../../ui/texts";
import { inUseBody, useMessage, useText } from "./categories";

describe("useText", () => {
  it("shows the actual row count and leaves the target rows out", () => {
    expect(useText({ rows: 2, targetRows: 3, rules: 1, fixes: 0, targets: 1 })).toBe("2 riviä, 1 sääntö, 1 tavoite");
  });

  it("shows nothing for a node only target rows use", () => {
    expect(useText({ rows: 0, targetRows: 3, rules: 0, fixes: 0, targets: 0 })).toBe("");
  });

  it("names the target rows in the delete warning and the rename note when nothing else uses the node", () => {
    const use = { rows: 0, targetRows: 3, rules: 0, fixes: 0, targets: 0 };
    expect(fmt("catInUseBody", { use: useMessage(use) })).toBe(
      "Sitä käyttävät lukittujen kuukausien tavoiterivit. Siirrä ne ensin toiseen kategoriaan.",
    );
    expect(fmt("catRenameNote", { use: useMessage(use) })).toBe("Muuttuu: lukittujen kuukausien tavoiterivit. Summat eivät muutu.");
  });

  it("says to unlock or rename, not to move, when only target rows of locked months use the node", () => {
    const use = { rows: 0, targetRows: 3, rules: 0, fixes: 0, targets: 0 };
    expect(inUseBody(use)).toBe(
      "Sitä käyttävät vain lukittujen kuukausien tavoiterivit. Avaa kuukausien lukitus tai nimeä kategoria uudelleen.",
    );
    expect(inUseBody({ ...use, rules: 1 })).toBe(fmt("catInUseBody", { use: "1 sääntö" }));
  });

  it("keeps the actual use text when something else uses the node", () => {
    expect(useMessage({ rows: 2, targetRows: 3, rules: 0, fixes: 0, targets: 0 })).toBe("2 riviä");
  });
});
