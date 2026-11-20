// Tests the "Show more" footer of the paged tables: hidden without matches, a count and a button
// while rows are left, the count alone on the last page.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { showMoreFoot } from "./showMore";
import { setLang } from "./texts";

beforeAll(() => setLang("en"));
afterAll(() => setLang("fi"));

describe("showMoreFoot", () => {
  it("draws nothing when no row matches", () => {
    expect(showMoreFoot(0, 0, "showingRows", ["rowact", "more"])).toBe("");
  });

  it("shows the formatted count and a Show more button while rows are left", () => {
    const foot = showMoreFoot(200, 1408, "showingRows", ["rowact", "more"]);
    expect(foot).toContain("Showing 200 of 1,408");
    expect(foot).toContain('<button type="button" class="sm" data-rowact="more">Show more</button>');
  });

  it("shows the count without a button on the last page", () => {
    const foot = showMoreFoot(1408, 1408, "showingGroups", ["imp", "moreGroups"]);
    expect(foot).toContain("Showing 1,408 of 1,408 groups.");
    expect(foot).not.toContain("<button");
  });
});
