# front: conventions

The fire web app. Vite and plain TypeScript with DOM APIs, no framework.

- **File header comment.** Every source file starts with a one or two line comment saying what it is for.
- **HTML through `escapeHtml`.** Markup is built with the `html` tagged template in `src/ui/html.ts`, which escapes every value. `raw()` only for markup the code itself produced.
- **Text catalog.** Every user-facing string is a key in `src/ui/texts.ts`, in fi and en. The en catalog is typed against fi, so a missing translation fails `tsc`.
- **Tests beside sources.** `foo.ts` has `foo.test.ts` next to it (Vitest). The engine's step tests are grouped by stage (`basics`, `steps`, `import`, `wizard`), as v2's pytest files were.
- **Lint and format.** `npm run check` runs ESLint (`eslint.config.mjs`) and a Prettier check (`.prettierrc.json`, width 140). ESLint and its TypeScript 5 parser live in `lint/` with their own lockfile, because typescript-eslint needs the compiler API that TypeScript 7 no longer ships; type checking stays `tsc`. ESLint also refuses `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` in app code.
- **File limits.** A source file is refused over 50 MB, and a sheet is read only up to its last real cell (`src/engine/limits.ts`): every file is parsed on the page's own thread.
- **Cached reads.** `Project.getSourceRows()` and `getLedger()` return shared, frozen arrays kept until a write changes them. Copy before changing; never mutate a returned row.
- **Engine is pure.** `src/engine/` has no DOM, no storage and no I/O: values in, values out. That keeps it testable in Node and reusable in a worker.
- **No network.** No `fetch`, no CDN imports, nothing loaded from elsewhere. Everything is bundled: sql.js is the inline-wasm build, and the demo data is generated in code (`src/project/demo.ts`). The only external URLs are plain links the user may click (the source code on GitHub), opened with `rel="noopener noreferrer"`.
- Internal class keys stay `tulot`, `menot`, `varat`, `velat`, `pois`.

## Layout

| Path                         | What                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csp.ts`                     | The content security policy, added to the built `index.html` only.                                                                                                                                                          |
| `scripts/check-dist.mjs`     | Build gate: policy present, no inline code, no external references in `dist`.                                                                                                                                               |
| `src/engine/`                | Read, normalise, categorise, split, fix, targets, ids, diff.                                                                                                                                                                |
| `src/engine/preprocessors/`  | Built-in `file bytes -> table` functions for exports that are not tables. One file per source, named `<source>_<report>.ts` in English, e.g. `nordnet_portfolio.ts`.                                                        |
| `src/storage/`               | Project file (sql.js, schema with `PRAGMA user_version` migrations), open and save, working copy.                                                                                                                           |
| `src/project/`               | Operations combining storage and engine: import a file, rebuild the ledger, migrate from v2. No DOM.                                                                                                                        |
| `src/app/`                   | The session (open project, linked file, unsaved state, working copy) and the report filter state.                                                                                                                           |
| `src/analytics/`             | Report measures (`measures.ts`, one function per DAX measure of the v2 Power BI report), periods, flow-page data. Pure.                                                                                                     |
| `src/screens/`               | Screens of the app. `reports/` holds the report pages; `import/` the Tuonti steps (`checks.ts`: the Tarkistukset sections); `settings/` the Asetukset model (`model.ts`: tabs, columns, draft, checks) and stateless parts. |
| `src/ui/`                    | Shared UI helpers: `html.ts`, `texts.ts`, `charts.ts` (SVG charts, value labels, tooltips, table view), `combo.ts` (searchable list), `dateField.ts` (dates in the user's format), `periodPicker.ts`, `diffView.ts`.        |
| `eslint.config.mjs`, `lint/` | ESLint config, and its packages with their own lockfile (`npm ci --prefix front/lint`, or `npm run setup` at the root).                                                                                                     |
| `fixtures/v2/`               | The v2 sample folders, read by the parity and migration tests through `src/engine/testing/`. Do not modify.                                                                                                                 |
| `fixtures/projects/`         | Old project files as SQL with made-up data, for the tests that open an older project file (`no-category-list.sql`: before the category list).                                                                               |
| `scripts/lint.mjs`           | Runs ESLint, or says how to install it.                                                                                                                                                                                     |
