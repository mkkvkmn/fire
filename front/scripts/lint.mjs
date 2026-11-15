// Runs ESLint (front/eslint.config.mjs). Its packages live in front/lint (see the config for why);
// says how to install them instead of failing with a stack trace.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const front = fileURLToPath(new URL("..", import.meta.url));
const bin = fileURLToPath(new URL("../lint/node_modules/eslint/bin/eslint.js", import.meta.url));
if (!existsSync(bin)) {
  console.error("ESLint is not installed. Run once in the repo root: npm ci --prefix front/lint");
  process.exit(1);
}
const res = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd: front, stdio: "inherit" });
process.exit(res.status ?? 1);
