# Checklist: performance

Last reviewed: 2026-11-18
Refresh after: 2027-05-18

Every file is parsed on the page's own thread, and the whole project lives in memory. Does fire stay usable with years of real-sized exports?

## Research

When the checklist is stale, read these primary sources and note what changed:

- web.dev and the W3C Long Tasks and Event Timing specs: Interaction to Next Paint (INP), long tasks, the current thresholds.
- Chrome DevTools docs: Performance panel, Memory panel (heap snapshots, detached nodes).
- Vite docs on build output, chunking and `chunkSizeWarningLimit`.
- sql.js and SheetJS release notes: memory use and speed of reading large files.

## Live checks (run every time)

- `npm run build` (in a release run, take the sizes from the baseline instead). Record the size of each file in `front/dist/assets/` (main bundle, `sql-wasm-inline-*.js`, CSS, fonts) and compare with the last performance log; if there is none, record them as the first baseline. `front/vite.config.ts` sets `chunkSizeWarningLimit`; a warning in the build output is a finding.
- Make a large synthetic file in the page (`SKILL.md`, In the browser pane): for example 100 000 rows in the layout of `front/fixtures/v2/data/source_files/nordea.csv`, made-up descriptions and amounts. Never use a real statement.
- In the browser pane on the `front-test` server (desktop width only): drop the large file on Tuonti and time each step (read, Luokittelu, "Tuo rivit"). Then open each report page and switch owner, period and Tulot / Menot. Note any action that blocks the page for more than about 200 ms. Time with `performance.now()` around the action in `javascript_tool`. A hidden pane runs scripts 4 to 5 times slower and throttles `setTimeout`, so:
  - take a screenshot right before each timed call;
  - run the same calibration before and after, for example 20 000 calls of `sha256Hex` from `await import("/src/engine/sha256.ts")` (about 110 ms in an active pane), and discard runs where it was much slower;
  - wait for the next frame with a `MessageChannel` message, not `setTimeout`. A tool call ends after about 45 s.
- Memory and save: the pane has no `gc()`, the sqlite database is outside the JS heap, and the sample project cannot be saved. Run these in Node from the scratchpad (bundle the engine and `front/src/storage/project.ts` with the repo's Vite or rolldown, output in the scratchpad): the heap after `node --expose-gc` and `gc()` over several open and close cycles must stay flat, and time `export` and `open` of a large project. Note under assessment limits that they ran in Node.

## Areas

### Large imports

- `front/src/engine/limits.ts`: `MAX_FILE_BYTES` 50 MB, `MAX_SHEET_ROWS` 200 000, `MAX_SHEET_COLUMNS` 200. Check that a file at each limit imports in a usable time, and that each of these is refused with a message, before parsing where possible: 50 MB plus 1 byte, 200 001 rows as CSV, 200 001 rows as XLSX, 201 columns.
- `front/src/engine/tables.ts` and `front/src/engine/read.ts`: no quadratic work per row (string concatenation in a loop, `indexOf` in a loop, repeated array copies).
- `front/src/engine/ids.ts` and `front/src/engine/sha256.ts`: hashing every row is synchronous. Measure its share of the import time.
- `front/src/project/staging.ts`: the staged import does not re-read files on every step.

### Main-thread blocking

- Long synchronous work on input (typing in a filter, a combo in `front/src/ui/combo.ts`, a date field) runs once per change, not once per key per row.
- The engine is pure (`front/src/engine/`), so it could move to a worker. Note the long tasks that a worker would remove; do not file a worker as a finding unless a measured task blocks the user.
- A long task shows progress or a busy state, so the user knows the tab has not frozen.

### Rendering and caching

- `Project.getSourceRows()` and `getLedger()` (`front/src/storage/project.ts`) are cached until a write. Check that no screen bypasses the cache or rebuilds the ledger on a read.
- Report pages (`front/src/screens/reports/`, `front/src/analytics/flows.ts`) build children only when they are read. Large tables render only what is visible, or the row count is capped with a clear note.
- Charts (`front/src/ui/charts.ts`): the number of SVG nodes with 24 months and many categories.

### Bundle and load

- First load downloads the main bundle only; the SQLite engine loads when a project is first opened (`front/src/storage/sqljs.ts`). The dev server loads sql.js at start, so check the build: `front/dist/index.html` names only the main script and the CSS, and the main bundle loads `sql-wasm-inline-*.js` with a dynamic `import(`. Use the `front-dist` network list only if that server is running.
- No unused large dependency in `front/package.json`.
- Fonts: only the subsets that are used.

### Memory

- Closing a project frees its database and rows (no reference kept in a module-level variable or a listener).
- Re-opening a project several times does not grow the heap each time.

## Severity guide

- **Critical**: a normal-sized real export (a few years of one account) freezes or crashes the tab, or a file within the limits (up to 200 000 rows and 50 MB) loses data. A file over a limit that loses data without a message is High.
- **High**: a common action (import, switching a report) blocks the page for several seconds with no progress shown, or memory grows on each open until the tab dies.
- **Medium**: a measurable long task on a less common action, a bundle that grew a lot without reason, a cache that is bypassed.
- **Low**: small gains, a Suggestion such as moving work to a worker before it is needed.
