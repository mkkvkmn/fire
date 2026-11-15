// Deploy gate: checks the built site before it is published. Fails when the content security
// policy is missing or weakened, when index.html has inline scripts or styles, or when the build
// references anything outside the site itself.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(import.meta.dirname, "..", "dist");
const problems = [];
const html = readFileSync(join(dist, "index.html"), "utf8");

const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
if (!meta) problems.push("index.html has no Content-Security-Policy meta tag");
else {
  const policy = meta[1];
  for (const must of ["default-src 'none'", "connect-src 'none'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self'"]) {
    if (!policy.includes(must)) problems.push(`policy lacks ${must}`);
  }
  if (/unsafe-inline|unsafe-eval'|\*/.test(policy.replace("'wasm-unsafe-eval'", "")))
    problems.push("policy allows inline code, eval or wildcards");
}
// The policy must come before anything that loads code.
if (meta && html.indexOf(meta[0]) > html.search(/<script|<link/)) problems.push("policy meta tag is not before the first script or link");
for (const tag of html.match(/<script\b[^>]*>/g) ?? []) if (!/\ssrc=/.test(tag)) problems.push(`inline script: ${tag}`);
if (/<style\b/.test(html) || /\sstyle="/.test(html)) problems.push("inline style in index.html");
for (const url of html.match(/(?:src|href)="([^"]+)"/g) ?? [])
  if (/="(?:https?:)?\/\//.test(url)) problems.push(`external reference: ${url}`);

const files = readdirSync(join(dist, "assets"));
const size = files.reduce((s, f) => s + readFileSync(join(dist, "assets", f)).length, 0);

if (problems.length > 0) {
  console.error("check-dist failed:\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(
  `check-dist ok: policy present, no inline code, no external references (${files.length} assets, ${(size / 1024).toFixed(0)} kB)`,
);
