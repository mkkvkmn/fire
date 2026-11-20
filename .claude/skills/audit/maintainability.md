# Checklist: maintainability

Last reviewed: 2026-11-18
Refresh after: 2027-11-18

Can a new contributor, or the owner a year from now, change fire safely?

## Research

When the checklist is stale, read these primary sources and note what changed:

- TypeScript release notes, and the typescript-eslint docs on which TypeScript versions it supports. `front/lint/` exists only because typescript-eslint needs the TypeScript 5 compiler API.
- Vite, Vitest and Prettier release notes and migration guides for the major versions in `front/package.json`.
- Node.js release schedule, for the version in `.github/workflows/`.

## Live checks (run every time)

- `npm run check` from the repo root (typecheck, ESLint, Prettier check, all tests). Record the result and the test count.
- `npm run build`. Record warnings.
- `npm outdated` in the repo root and in `front/lint/`. List major versions behind.
- Find exports that nothing imports: for each `export` in `front/src`, search for its name in other files. A script in the scratchpad is fine; do not add a tool to the repo.
- Largest source files: `find front/src -name "*.ts" ! -name "*.test.ts" | xargs wc -l | sort -n | tail`. Note files over about 1000 lines and what they mix.
- Source files without a test beside them: list each `<name>.ts` with no `<name>.test.ts` beside it, in `front/src/engine/`, `front/src/project/`, `front/src/storage/` and `front/src/analytics/`.

## Areas

### Structure

- The layers in `front/AGENTS.md` hold: `front/src/engine/` has no DOM, storage or I/O; `front/src/project/` has no DOM; screens do not reach into storage directly.
- One source of truth: one class list (`front/src/ui/classification.ts`), one number parser (`front/src/ui/numberField.ts`), one date parser (`front/src/engine/dates.ts`). Search for copies.
- Large screens (`front/src/screens/settingsScreen.ts`, `front/src/screens/import/importScreen.ts`, `front/src/screens/migrateView.ts`): pure logic split into a model with tests, as `front/src/screens/settings/model.ts` does.

### Tests

- Tests sit beside sources and their names state the behaviour.
- The engine is covered by step tests and by parity over `front/fixtures/v2`.
- Storage migrations (`front/src/storage/schema.ts`) each have a test that opens a file of the old version.
- UI behaviour that matters (unsaved state, import flow counts) is tested in a pure model, not only by hand.

### Types and lint

- `tsc --noEmit` passes with the settings in `front/tsconfig.json` (strict mode on). Count `any`, `as` casts and non-null assertions in `front/src`, and list the ones that hide a real case.
- ESLint (`front/eslint.config.mjs`) runs in `npm run check` and in CI. Disabled rules carry a reason.

### Dead code

- Unused exports, text keys in `front/src/ui/texts.ts` that no code uses, CSS classes in `front/src/style.css` that no markup uses, unused modes or options.

### Docs

- `AGENTS.md` (repo root), `front/AGENTS.md`, `readme.md` (repo root) and `ship/README.md` match the code: commands, paths, limits, the security policy text.
- Every source file starts with the header comment that `front/AGENTS.md` asks for, and it is still true.
- Comments explain why, and none is out of date.

## Severity guide

- **Critical**: `npm run check` or the build fails on a clean checkout, or CI no longer runs a gate it claims to run.
- **High**: a core module (engine, storage, migrations) has no tests for a behaviour that can lose or corrupt data, or a layer rule is broken in a way that blocks testing.
- **Medium**: duplicated logic that has already drifted, a large file that mixes logic and DOM with no tests, docs that give a wrong command or path.
- **Low**: dead code, a stale comment, a dependency a major version behind with no known issue, a Suggestion.
