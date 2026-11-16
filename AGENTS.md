# fire: agent guide

fire (FiRe, Financial Independence, Retire Early) is a personal finance tracker. Version 3 is a static web app: bank and broker exports go in, a categorised ledger and reports come out.

## Product rules

- **No backend, no accounts.** The site is plain static files.
- **Data never leaves the browser.** All processing happens in the tab. The page's content security policy has `connect-src 'none'`, so it cannot make network requests after load. Never add code that fetches, posts or beacons anything.
- **Storage is one portable project file** (`*.fire.sqlite`, SQLite through sql.js) on the user's own machine, plus a working copy in the browser's private origin storage.
- The repo is public. Every file must be fit to publish: no personal data, no secrets.

## Layout

| Path | What |
| --- | --- |
| `front/` | The web app (Vite, plain TypeScript, no framework). See `front/AGENTS.md`. |
| `front/src/engine/` | Pure data functions: read, normalise, categorise, split, fix, targets, ids, diff. |
| `front/fixtures/v2/` | The v2 sample folders (`config/`, `data/`): test input for parity with v2 and for the v2 migration. Do not modify. |
| `ship/` | How fire is deployed. |

## Commands (repo root)

- `npm run setup`: install the app and the lint tools exactly as the lockfiles say (once, and after a pull that changes them).
- `npm run dev:front`: dev server.
- `npm run check`: typecheck, lint, format check and all tests.
- `npm run format`: format `front/` with Prettier.
- `npm run lint`: ESLint only.
- `npm run test:run`: tests only.
- `npm run build`: production build into `front/dist`, then checks the output.

CI (`.github/workflows/ci.yml`) runs setup, check, audit and build on every push and pull request; publishing is `deploy.yml`, from a version tag only.

## Working rules

- Commit only when the user asks. Ask before every push.
- Never read `.env` files.
- Code is done only when `npm run check` passes.
- A UI change is done only when it has been checked in the browser. Look at every state a user can reach (open dropdowns, hover, empty and error states) at desktop and phone width, and judge it critically, not just that it renders. Test on a second dev server port (another origin), so the user's working copy is never touched.
- No em dash in any writing (code comments, docs, UI text). Use a colon, comma or parentheses.
- The v2 Python pipeline is no longer in the tree. Where v2 behaviour matters, read it from git history (`git show f515f7b:data_pipeline/...`, the last v2 commit on `main`). The parity tests over `front/fixtures/v2` must keep passing.
- `work/` (plans, logs, reviews) is local and not in git.
