// Guards the built site's content security policy: app code must not write markup the policy blocks.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = import.meta.dirname;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sources(path);
    return e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [path] : [];
  });
}

describe("markup and the content security policy", () => {
  it("has no style attribute in markup (style-src 'self' blocks it; set styles through the CSSOM)", () => {
    const hits = sources(SRC).filter((f) => /style\s*=\s*["'`$]/.test(readFileSync(f, "utf8")));
    expect(hits.map((f) => relative(SRC, f))).toEqual([]);
  });
});
