# Method: release

Answers "can this go live?" with one verdict. It runs or reuses the audits and writes `work/_current/yyyy-mm-dd-audit-release.md`. It has no checklist of its own.

## Which audits

- Always: correctness, privacy-security, performance, ux-ui.
- Maintainability only when the arguments ask for it (`/audit release maintainability`).

## Reuse a log

Reuse the newest log of a type in `work/_current/` and `work/x-archive/audit/` (closed logs move there) when all of these hold:

- It is a full audit (not `changes`), under 30 days old, and its header has no "plus uncommitted changes".
- `git diff --stat <covered commit>..HEAD` shows no file in the type's list below, and the working tree has no such change either.
- Its fixed (`[x]`) and accepted (`[~]`) findings still hold: re-check each against the code and add a dated line to that log. One that no longer holds goes back to `[ ]` (recheck step 4), and the log then has an open finding. If the log came from `work/x-archive/audit/`, move it back to `work/_current/` and link it again in `work/log_selected.md`.

| Type             | A change here makes the log stale                                                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| correctness      | `front/src/engine/`, `front/src/analytics/`, `front/src/project/`, `front/src/storage/`, `front/src/screens/reports/`, `front/src/ui/format.ts`, `front/fixtures/`, `.claude/skills/audit/correctness.md` |
| privacy-security | every file under `front/src/`, `front/csp.ts`, `front/index.html`, `front/vite.config.ts`, `front/eslint.config.mjs`, `front/lint/`, `front/scripts/`, `front/public/`, `front/package.json`, `package.json`, `package-lock.json`, `.github/workflows/`, `ship/`, `.claude/skills/audit/privacy-security.md` |
| performance      | every file under `front/src/`, `front/fixtures/`, `front/vite.config.ts`, `front/scripts/`, `front/package.json`, `package.json`, `package-lock.json`, `.claude/skills/audit/performance.md` |
| ux-ui            | `front/src/screens/`, `front/src/ui/`, `front/src/app/`, `front/src/project/`, `front/src/assets/`, `front/src/style.css`, `front/src/engine/limits.ts`, `front/index.html`, `front/public/`, `front/fixtures/`, `.claude/skills/audit/ux-ui.md` |
| maintainability  | every tracked file, including `.claude/skills/audit/maintainability.md`                                                                                                                                                                                                                                               |

A change to `.claude/skills/audit/SKILL.md` makes every log stale.

## Run the rest

1. Run the baseline once: `npm run check`, then `npm run build`. Record the results (including the build warnings), the test count and the size of each file in `front/dist/assets/`. Pass them to every subagent. The baseline replaces the live checks that run the tests, the lint or the build. It does not replace the live checks that use the browser or a server, nor the two-time-zone engine runs in `correctness.md`: those still run in the correctness audit.
2. If more than one audit remains and the request does not already say how to run them, ask the owner. Do not choose. Options: all now (see rule below), or one per session (rerun `/audit release` later; finished logs are reused).
3. Each audit runs in its own subagent. It follows `.claude/skills/audit/SKILL.md` and its checklist, and writes its own log.

The browser pane is shared and the ports 5174 and 4173 are fixed (`--strictPort`). Servers: correctness, performance and ux-ui use `front-test` (5174); privacy-security uses `front-dist` (4173, after the build); maintainability uses none. Run the audits that use a server one at a time, each in its own subagent. Maintainability may run in parallel. The release lead starts a server before it starts the subagent that needs it. If the port is already in use, the lead uses that server and does not stop it. It stops only servers it started, and checks that the port is free afterwards. How to start, open and stop a server: `SKILL.md`, Guardrails. No subagent starts or stops a server. Pass each subagent the address and the pane tab to use.

Only the lead writes links in `work/log_selected.md`. Each subagent returns its log path, and the lead links it.

## Release log

Path: `work/_current/yyyy-mm-dd-audit-release.md`. Link it from `work/log_selected.md` like any audit log. Sections:

1. **Header**: date, commit, whether the tree was clean, the baseline results, and one table `Type | Log | Score | Reused or new | Commit covered`.
2. **Open Critical and High**: one table `Type | Id | Severity | Title | Owner and date`, linked to the logs. Merge duplicates found by different audits into one row ("same as <type> #n").
3. **Verdict**:
   - Before the verdict the lead fills `Owner:` and `Due:` for every open High, in the audit log and in the table above, or asks the owner.
   - Not ready: any open Critical, or an open High in privacy-security or correctness.
   - Not ready (pending owner): no other blocker, but an open High still has an empty `Owner:` or `Due:` (for example in a run where the owner is not asked). It becomes Ready with conditions when both are filled.
   - Ready with conditions: other open Highs. Each has an owner and a date.
   - Ready: no open Critical or High.
4. **Log**: dated lines, newest last.
