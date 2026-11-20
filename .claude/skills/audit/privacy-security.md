# Checklist: privacy-security

Last reviewed: 2026-11-18
Refresh after: 2027-02-18

fire's promise is that financial data never leaves the browser. Does the code keep that promise, and can a hostile file, script or host break it?

## Research

When the checklist is stale, read these primary sources and note what changed:

- W3C Content Security Policy Level 3: `connect-src`, `wasm-unsafe-eval`, what a meta tag policy cannot do (`frame-ancestors`, reporting), and navigation, which no directive blocks.
- OWASP: CSV Injection, and the Secure Headers project.
- WHATWG Storage and File System standards, and MDN on OPFS, IndexedDB and localStorage: what is kept per origin, storage partitioning, how site data is cleared.
- GitHub Advisory Database for every package in `front/package.json` and `front/lint/package.json`.
- The SheetJS advisories page (`https://cdn.sheetjs.com/advisories/`): `xlsx` comes from the SheetJS CDN, so `npm audit` does not see it. The index lists only CVE ids; open each CVE page (`https://cdn.sheetjs.com/advisories/<CVE id>`) for the fixed version.
- GitHub Pages docs: custom domains, HTTPS enforcement, which response headers a site can set.
- GitHub Actions security hardening docs (pinned actions, token permissions), for `.github/workflows/`.

## Live checks (run every time)

- `npm audit --audit-level=high` from the repo root, and `npm audit` in `front/lint/`. Record each advisory.
- The `xlsx` version in `front/package.json` against each SheetJS CVE page (see Research).
- `npm run build`. It runs `front/scripts/check-dist.mjs`: the policy is present and strict, no inline code, no external references. Record the result.
- `cd front && npx vitest run src/csp.test.ts`.
- Network in the built app: start the `front-dist` server (port 4173, after the build; the policy exists only in the build). In the browser pane, load the sample project, do the guided import, open Asetukset. The sample cannot be saved: check that Save is disabled, and leave saving a real project to the operator. Read the network requests (`read_network_requests` shows method, address and status, not bodies, and not blocked calls), and list what the page loaded: `performance.getEntriesByType("resource").map((e) => e.name)`. Only the site's own files, with no query string. Read the console (`read_console_messages`): no Content Security Policy violation from the app's own code.
- In the built app, run this with `javascript_tool`. It must give a `TypeError` and the violated directive `connect-src`:

  ```js
  const v = [];
  document.addEventListener("securitypolicyviolation", (e) => v.push(e.violatedDirective));
  const r = await fetch(location.href).then(() => "loaded", (e) => String(e));
  await new Promise((ok) => setTimeout(ok, 100));
  [r, v];
  ```

- Search the app source for network and code-loading calls: `grep -rnE "fetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\(|new Worker|eval\(|new Function" front/src --include=*.ts --exclude=*.test.ts`. Explain each hit. A type-only `import(` in `front/src/testing/` is not app code.

## Areas

### Data leaves the browser

- `front/csp.ts`: `connect-src 'none'`, `default-src 'none'`, `script-src 'self' 'wasm-unsafe-eval'` and nothing looser. The policy is in the built `index.html` (`front/scripts/check-dist.mjs` checks it).
- ESLint refuses network APIs in app code (`front/eslint.config.mjs`). Check that the rule still covers every file under `front/src`.
- Navigation: the policy does not stop a link or `location` change. No code builds a URL from user data (descriptions, amounts, file names). External links (`front/src/ui/shell.ts`, `front/src/screens/welcome.ts`, `front/src/screens/migrateView.ts`, `front/src/screens/settingsScreen.ts`) are fixed addresses with `rel="noopener noreferrer"`.
- Images: `img-src 'self' data:`. No markup can load an image from another host.
- Error messages, toasts and the console never print row data in a way that a browser extension or crash report would pick up more than the page itself shows.

### Third-party code

- Every dependency is bundled; no CDN script or font (`front/index.html`, `front/src/style.css`).
- `front/public/THIRD-PARTY-NOTICES.txt` lists what is bundled.
- sql.js is the inline-wasm build (`front/src/storage/sqljs.ts`), so it loads nothing.

### Hostile and malformed files

- Markup: every value goes through the `html` template in `front/src/ui/html.ts`. `raw()` is used only for markup the code produced. Search `raw(` and check each call does not wrap a value from a file.
- Prototype pollution: settings and profiles from a project file read only known keys (`__proto__`, `constructor` in a crafted file).
- Size: `front/src/engine/limits.ts` refuses a file over 50 MB and reads a sheet only to its last real cell. Try a crafted XLSX with a huge claimed range and a CSV with one very long line. Writing a huge range with SheetJS hangs; instead patch the claimed range of the fixture `front/fixtures/v2/data/source_files/luottokortti.xlsx` into a copy in the scratchpad (`<fixture>` is its path, `<scratch>` the scratchpad folder; never write the copy inside the repo). The second command is the proof: it must print `['xl/worksheets/sheet1.xml']`.

  ```sh
  python -c "import zipfile,re,sys; a=zipfile.ZipFile(sys.argv[1]); b=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED); [b.writestr(i, re.sub(rb'<dimension ref=\"[^\"]*\"', b'<dimension ref=\"A1:XFD1048576\"', a.read(i)) if i.filename.startswith('xl/worksheets/') else a.read(i)) for i in a.infolist()]; b.close()" <fixture> <scratch>/huge-range.xlsx
  python -c "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); print([n for n in z.namelist() if n.startswith('xl/worksheets/') and b'A1:XFD1048576' in z.read(n)])" <scratch>/huge-range.xlsx
  ```

  Then drop `<scratch>/huge-range.xlsx` as in `SKILL.md`, In the browser pane. On `front-dist` its bytes go into the script as base64.
- Encodings: a file with mixed or invalid bytes does not crash the import.
- A crafted project file (`*.fire.sqlite`): a newer `user_version` is refused (`front/src/storage/schema.ts`), triggers and views in the file are not run, and an oversized file is refused. An agent cannot open a project file (no drop target), so prove these by reading the code and the tests, and list opening a crafted file under "Checks for the operator".
- CSV export (`front/src/engine/exportCsv.ts`): a description that starts with `=`, `+`, `-`, an at sign, tab or CR gets a leading quote, so it does not run as a formula in a spreadsheet. Check `front/src/engine/exportCsv.test.ts` covers each.

### Storage

- What is kept: the project file on the user's disk; the working copy in OPFS or IndexedDB (`front/src/storage/workingCopy.ts`, `front/src/storage/idb.ts`); small values in localStorage (`front/src/app/session.ts`, `front/src/app/reportState.ts`, `front/src/main.ts`, `front/src/screens/reports/overview.ts`, `front/src/storage/projectFile.ts`). Confirm the list with `grep -rnE "localStorage|sessionStorage|indexedDB" front/src --include=*.ts`. List every key and say whether it holds financial or personal data.
- Clearing: closing a project clears the working copy (`clearWorkingCopy`) and the remembered names. Record each store at the start of the audit, before the first Close project (an earlier run on the same origin may have left data), and again after close, with `javascript_tool`. The script opens the `fire` database only if it exists: opening a missing one without a version would create an empty one that the app's `indexedDB.open("fire", 1)` (`front/src/storage/idb.ts`) never upgrades.

  ```js
  const opfs = []; for await (const [n] of (await navigator.storage.getDirectory()).entries()) opfs.push(n);
  const hasDb = (await indexedDB.databases()).some((d) => d.name === "fire");
  const kv = !hasDb ? "no database" : await new Promise((ok, no) => { const q = indexedDB.open("fire"); q.onerror = () => no(q.error); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains("kv")) { db.close(); return ok([]); } const k = db.transaction("kv").objectStore("kv").getAllKeys(); k.onsuccess = () => { db.close(); ok(k.result); }; }; });
  ({ local: Object.keys(localStorage), opfs, kv });
  ```
- The sample project can never overwrite the user's project or working copy.
- Shared origin risk: `ship/README.md` (Own origin). That the live site runs on its own origin is a check for the operator.

### Deployment

- `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`: actions pinned to a commit (a full 40-character SHA; the version comment beside it is optional to verify), `permissions` minimal, `persist-credentials: false`, deploy only from a version tag, the same gates as CI.
- Headers on the live host (HTTPS only, HSTS) are a check for the operator. GitHub Pages cannot set `frame-ancestors` or other response headers; check that `ship/README.md` still states this accurately.

## Severity guide

- **Critical**: financial data can leave the browser (a request, a navigation with data in it, a foreign script), or another origin can read the stored project.
- **High**: script injection through a file or a project file, the policy weakened in the build, a known high advisory in a bundled package, or financial or personal data left in storage after the user closes the project.
- **Medium**: a crafted file freezes or crashes the tab, a formula runs from an export, a gate in CI or deploy is missing, a moderate advisory in a bundled package, a user-typed label (a name of an account or target) left in storage after close.
- **Low**: hardening with little real gain for a one-owner static app, docs out of date, an advisory in a dev-only tool (`front/lint/`), a Suggestion.
