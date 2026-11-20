# Checklist: changes

Last reviewed: 2026-11-18
Refresh after: 2027-05-18

Audits only a diff: what changed since `base` (default `origin/main`), the working tree included. It reuses the five type checklists for the paths the diff touches.

## Research

When the checklist is stale, check that the path map below still matches the layout in `AGENTS.md` and `front/AGENTS.md`, and run the freshness check of each type checklist it points to.

## Live checks (run every time)

- Use the local `base`, without a fetch. Record `git rev-parse --short <base>` and `HEAD`.
- `git diff --stat <base>` and `git status --short`. Every changed and untracked file is in range.
- `npm run check` from the repo root. Record the result and the test count.
- If any file under `front/` changed: `npm run build` (it runs `front/scripts/check-dist.mjs`).
- If `front/package.json`, `package-lock.json` or `front/lint/` changed: `npm audit --audit-level=high`.
- If a screen, `front/src/ui/` or `front/src/style.css` changed: follow the verify-ui skill (`.claude/skills/verify-ui/SKILL.md`) for each changed screen.
- If `front/src/engine/`, `front/src/project/` or `front/src/analytics/` changed: the parity and reference tests alone, `cd front && npx vitest run src/engine/parity.test.ts src/analytics/measures.test.ts src/project/migrate.test.ts`.

## Path map

Apply the areas of each checklist that a changed path touches.

| Changed path                                                                                                          | Checklists                                    |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `front/src/engine/`, `front/src/analytics/`, `front/fixtures/`                                                        | correctness, performance                      |
| `front/src/project/`, `front/src/storage/`                                                                            | correctness, privacy-security                 |
| `front/csp.ts`, `front/scripts/check-dist.mjs`, `front/vite.config.ts`, `front/eslint.config.mjs`, `front/index.html` | privacy-security                              |
| `front/package.json`, `package-lock.json`, `front/lint/`, `.github/workflows/`, `ship/`                               | privacy-security, maintainability             |
| `front/src/screens/`, `front/src/ui/`, `front/src/style.css`, `front/src/app/`                                        | ux-ui, privacy-security (markup and escaping) |
| Docs (`*.md`)                                                                                                         | maintainability (docs match the code)         |

## Areas

- **Every change** (maintainability): the change has a test for its behaviour; names, layout and wording match the siblings; the header comment and docs are still true; no em dash; nothing private in a public file (names, real amounts, paths of a machine, secrets).
- **New network or code loading** (privacy-security): any new `fetch`, `import()`, worker, external URL, `raw()` call or storage key. Each one is a finding unless the diff shows why it is safe.
- **Engine and data** (correctness): a changed parser, date, amount, id or rule step keeps parity and has a fixture test; a changed schema has a migration and a test.
- **UI** (ux-ui): every new string is in `front/src/ui/texts.ts` in fi and en; the changed screen works at 375 px and desktop, with the keyboard, in its empty and error states.
- **Out of range**: an issue in code that the diff did not touch goes under assessment limits, not into findings.

## Severity guide

Use the severity guide of the checklist the finding belongs to. A change that breaks the "data never leaves the browser" promise is Critical, however small the diff.
