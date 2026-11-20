---
name: audit
description: Audits fire (the browser-only finance app) against a checklist and writes the findings, with evidence, to a log in work/_current/. Types are correctness, privacy-security, performance, ux-ui and maintainability; "changes" audits only a diff; "recheck" updates the open findings; "release" runs or reuses all audits and gives one go-live verdict.
disable-model-invocation: true
---

# Audit

Arguments: `$ARGUMENTS`

If the arguments are empty, show this table and stop. Run nothing.

| Command                   | What it does                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/audit correctness`      | Full audit: parsing, dates, amounts, duplicates, categorisation, report totals. Checklist `.claude/skills/audit/correctness.md`.                                         |
| `/audit privacy-security` | Full audit: data never leaves the browser, CSP, storage, hostile files, dependencies, deployment. Checklist `.claude/skills/audit/privacy-security.md`.                  |
| `/audit performance`      | Full audit: large imports, main-thread blocking, bundle size, memory. Checklist `.claude/skills/audit/performance.md`.                                                   |
| `/audit ux-ui`            | Full audit: WCAG 2.2 AA, keyboard, zoom, phone and desktop, every state, error text, consistency. Checklist `.claude/skills/audit/ux-ui.md`.                             |
| `/audit maintainability`  | Full audit: structure, tests, types, lint, dead code, docs. Checklist `.claude/skills/audit/maintainability.md`.                                                         |
| `/audit changes [base]`   | Audits only the diff against `base` (default `origin/main`, working tree included) with every checklist that the changed paths touch. `.claude/skills/audit/changes.md`. |
| `/audit recheck [type]`   | Checks the open findings of one log (or of every open log) against the code and updates their status and the score.                                                      |
| `/audit release`          | Answers "can this go live?": runs or reuses the audits and gives one verdict. `.claude/skills/audit/release.md`.                                                         |

Any other argument: say that it is not a known type, show the table and stop.

## Guardrails

- Edit no tracked file: no app code, tests, config, docs or this skill. The only repo files you write are the audit log and its link in `work/log_selected.md` (both in `work/`, which is not in git; in a release run the lead writes the link, see `release.md`). Build output (`npm run build` writes `front/dist`) and files in the scratchpad are fine.
- Scratch scripts and tests live in the scratchpad and write only to absolute paths there. A relative output path from a vitest run lands in `front/`.
- No commit, no push, no tag, no deploy.
- Never read `.env` files or any other secret file.
- Financial data: only synthetic data. That is the fixtures in `front/fixtures/v2/`, the sample project and the guided import sample files (both generated in `front/src/project/demo.ts`), or files you make up in the scratchpad. Never open, import or quote a real bank or broker statement, and never the user's own project file or working copy.
- Use a second dev server origin, so the user's working copy on the normal port is never touched: `front-test` in `.claude/launch.json` (port 5174), which runs `npm run dev --workspace front -- --port 5174 --strictPort`. For the built app with its security policy, use `front-dist` (port 4173): `npm run build`, then `npm run preview:front`. `.claude/launch.json` is not in git, so on a fresh clone run the commands above. Never stop a server you did not start. Release run: `release.md`.
- Start a server with `preview_start` and its name. If `preview_start` does not find the name (it reads the `launch.json` of the folder where the session started), run that configuration's command in the background, then open the address with `preview_start` and `url` (for example `http://localhost:5174`). Use `preview_start` with `url` also to open a second port; `navigate` to a new port can be refused.
- After you stop a server you started, check that its port is free (`netstat -ano | grep ":5174 .*LISTEN"`; the last column is the process id). Stopping the background npm task can leave the `vite` child process on the port. Stop it only when its command line is the one you started (run this one with the PowerShell tool, not bash: `(Get-CimInstance Win32_Process -Filter "ProcessId=<id>").CommandLine`).

## In the browser pane

- **Start state.** A reload restores the origin's working copy, so the pane can still hold the previous audit's project. Record what the stores hold if your checklist asks for it (privacy-security), then Projekti / Project > Sulje projekti / Close project (confirm) to reach Welcome, then open the sample or the guided import. Leave the pane at Welcome, in English, at the `desktop` preset when you finish.
- **Screen names.** The checklists use the Finnish names. The UI language depends on the browser, so use the route or the name in either language:

  | Route                                    | Finnish                                     | English                           |
  | ---------------------------------------- | ------------------------------------------- | --------------------------------- |
  | `#/welcome`                              | Welcome ("Miten haluat aloittaa?")          | Welcome ("Take charge of ...")    |
  | `#/overview`                             | Raportit: Seurantanäkymä                    | Reports: Dashboard                |
  | `#/rows`                                 | Tapahtumat                                  | Transactions                      |
  | `#/import/files`, `/classify`, `/fixes`  | Tuonti: Tiedostot, Luokittelu, Tarkistukset | Import: Files, Categorise, Checks |
  | `#/settings/<tab>`                       | Asetukset                                   | Settings                          |
  | `#/project`                              | Projekti                                    | Project                           |

  Settings tabs: `rules`, `splits`, `fixes`, `targets`, `profiles`, `scripts`. The import button at the end of Tarkistukset is "Tuo rivit" / "Import rows". `#/welcome` redirects to the overview while a project is open.
- **Hand a file to the page.** An agent cannot drive the file picker. Build the file in the page with `javascript_tool` and drop it on the drop zone, which exists only on `#/import/files` (the handler is in `front/src/screens/import/importScreen.ts`):

  ```js
  const bytes = await (await fetch("/fixtures/v2/data/source_files/nordea.csv")).arrayBuffer();
  const f = new File([bytes], "nordea.csv", { type: "text/csv" });
  const dt = new DataTransfer(); dt.items.add(f);
  document.querySelector(".drop").dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true }));
  ```

  The bytes: on `front-test` the dev server has no security policy (`front/csp.ts` applies to the build only) and serves `front/fixtures/` at `/fixtures/`, so `fetch` works as above. On `front-dist` the policy blocks `fetch`: embed the bytes in the script as base64 (`Uint8Array.from(atob("<base64>"), (c) => c.charCodeAt(0))`, the base64 made in the scratchpad with `base64 -w0 <file>`). Large or hostile content can also be generated in the script as a string. A project file (`*.fire.sqlite`) has no drop target: opening one is an operator check.
- **Page scripts.** `javascript_tool` runs in the page's own origin, under its security policy. It replaces the DevTools console and application panel; say in the log that a check ran this way.

## Method

1. **Scope.** Write down what this audit covers: the commit (`git rev-parse --short HEAD`), whether the working tree is clean, the checklist and its `Last reviewed` date. Write down what could not be determined, for example a browser that is not available or a host header you cannot see. Never assume a result. Something you could not check is an assessment limit, not a pass.
2. **Freshness check.** Each checklist has `Last reviewed` and `Refresh after`. If today is after `Refresh after`, the checklist is stale:
   - Research the primary sources in its **Research** list (standards, official docs, advisory databases), not blog posts.
   - Write what you found under "Research notes" in the log, with the source and its date.
   - Propose the checklist edits as one Low finding. Never edit the skill during an audit.
3. **Run things, do not only read code.** Do every item under **Live checks** in the checklist. Run the tests, run the app and load fixtures. Look at the browser at 375 px and at desktop width where the checklist asks for it; reset the pane to the `desktop` preset after a resize. A finding that a run can show needs the run. In a release run, skip the live checks that the baseline in `release.md` already ran (tests, lint, build, file sizes).
4. **Work through the areas** of the checklist. For each item, find the code, then prove or disprove it with a run, a test or a precise reading.
5. **Write the log** (below) as you go, not at the end.

## Evidence rules

- Report only what the repo or a run shows. Quote `file:line` and the command or the steps that show it.
- Something you think is likely but could not show is a "risk to verify", with the check that would settle it. It is not a finding.
- One cause, many places: one finding that lists every place. Do not file the same issue five times.
- Taste (a name you would choose differently, a layout you like less) is a Suggestion. It is never above Low.
- Report what works well, with the same evidence. The owner needs to know what to keep.
- Screenshots stay in the tool result; the log cannot hold them. Write the measured result instead (for example `scrollWidth` against the window width, the clipped element, the unnamed control).

## Finding format

Each finding has:

- **Title**: one line, the problem itself.
- **Severity**: Critical, High, Medium or Low (the checklist has a guide for its type).
  - Critical: real harm now. Financial data leaves the browser, data is lost, or report totals are wrong for normal input.
  - High: likely harm for a common case, or a broken main task.
  - Medium: harm in a less common case, or a clear defect with a workaround.
  - Low: small defect, hardening, docs, or a Suggestion.
- **Confidence**: High (shown by a run or test), Medium (shown by reading the code), Low (a reading with open questions).
- **Evidence**: `file:line`, plus the command and its output, or the steps in the app and what they showed.
- **Impact**: one concrete scenario. Who does what, and what goes wrong.
- **Recommendation**: the fix, and the test that would keep it fixed.
- **Owner:** and **Due:** (open High only): who fixes it and by when. Filled by `/audit release`.

## Log file

Path: `work/_current/yyyy-mm-dd-audit-<type>.md` (the date the audit starts; `<type>` is the type or `changes`). It follows the `work/` conventions in `work/README.md`. The log is local: `work/` is not in git.

When you create the log, link it (in a release run the lead links it, see `release.md`) from `work/log_selected.md` under Current Task, as one line: `- [Audit <type>, yyyy-mm-dd](_current/yyyy-mm-dd-audit-<type>.md)`.

Sections, in this order:

1. **Header**: date, commit covered (short hash, and "plus uncommitted changes" if the tree was not clean; `/audit release` reads both to decide whether to reuse the log), checklist version (its `Last reviewed` date), and for `changes` the base.
2. **Status**: the line "Whoever fixes a finding also updates its row here, in the same change." above a table with columns `Status | Id | Severity | Title | Proof or reason`. Status is `[ ]` open, `[x]` fixed with proof (the commit and the test or run), or `[~]` accepted, with the reason.
3. **Findings**: most severe first, in the finding format. Ids are `A1`, `A2` and so on, and stay fixed.
4. **What works well.**
5. **Top priorities**: at most three, in order.
6. **Score**: start at 100. For each open (`[ ]`) finding deduct Critical 25, High 12, Medium 5, Low 1. The floor is 0. Show the sum.
7. **Assessment limits**: what was not checked or could not be determined, and why.
8. **Checks for the operator**: what only the owner can check (for example the live site headers, another browser), each as one step with the result that means done.
9. **Research notes**: only when the freshness check ran.
10. **Log**: dated lines, newest last: audit run, recheck, status changes.

When every finding is `[x]` or `[~]`, move the log to `work/x-archive/audit/` and remove its line from `work/log_selected.md`.

## Changes

`/audit changes [base]` follows `.claude/skills/audit/changes.md`. The range is `base` to the working tree (`git diff <base>`), so uncommitted work is included. The log is `work/_current/yyyy-mm-dd-audit-changes.md`. A finding in code that the diff did not touch is out of range: note it under assessment limits, do not file it.

## Release

`/audit release` follows `.claude/skills/audit/release.md`. It reuses full-audit logs that are still current and writes `work/_current/yyyy-mm-dd-audit-release.md`.

## Recheck

`/audit recheck [type]` works on the open log for that type in `work/_current/`, or on every open audit log when no type is given. If no log is found, say so and stop.

1. For each finding, read the code it names and the history since the covered commit (`git log <covered>..HEAD -- <paths>`, plus the working tree).
2. Fixed and the proof is there (a commit and a test or run that shows it): `[x]`, with the proof.
3. Fixed but the proof is missing: stays `[ ]`. Write which proof is missing.
4. A `[x]` or `[~]` finding that no longer holds (the fix was reverted, the reason no longer applies): back to `[ ]`, with what changed.
5. Run `changes` over the same range (covered commit to the working tree) and add any new findings to the same log.
6. Update the header to the new commit covered, recompute the score, and add a dated line to the log. Archive the log if every finding is closed.
