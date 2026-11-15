import { describe, expect, it } from "vitest";
import { escapeHtml, html, raw } from "./html";

describe("escapeHtml", () => {
  it("escapes markup characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
  it("handles null and numbers", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(12)).toBe("12");
  });
});

describe("html", () => {
  it("escapes interpolations but not raw()", () => {
    expect(html`<p>${"<b>"}${raw("<i>x</i>")}</p>`).toBe("<p>&lt;b&gt;<i>x</i></p>");
  });
});
