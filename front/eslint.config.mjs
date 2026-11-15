// ESLint for the fire web app. Syntax-level rules only: type checking is `tsc` (TypeScript 7). The
// ESLint packages live in ./lint with their own TypeScript 5, because typescript-eslint needs the
// compiler API that TypeScript 7 no longer ships; they are loaded from there.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const fromLint = createRequire(new URL("./lint/package.json", import.meta.url));
const load = async (name) => (await import(pathToFileURL(fromLint.resolve(name)).href)).default;
const js = await load("@eslint/js");
const globals = await load("globals");
const tseslint = await load("typescript-eslint");

const noNetwork = "fire makes no network requests (connect-src 'none').";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "lint/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // the product promise: the page makes no network requests after load
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: noNetwork },
        { name: "XMLHttpRequest", message: noNetwork },
        { name: "WebSocket", message: noNetwork },
        { name: "EventSource", message: noNetwork },
      ],
      "no-restricted-properties": ["error", { object: "navigator", property: "sendBeacon", message: noNetwork }],
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // tests and build files run in Node and may read files freely
    files: ["**/*.test.ts", "scripts/**", "*.ts", "*.mjs"],
    rules: { "no-restricted-globals": "off" },
  },
);
