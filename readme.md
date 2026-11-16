# FiRe - Financial Independence, Retire Early

FiRe tracks your household's finances. It runs in your browser, and your data never leaves your computer. Open your bank and broker files, categorise the transactions and make better decisions. It includes a FiRe forecast: when your investments could cover your living costs.

**Use it at [fire.mkkvkmn.com](https://fire.mkkvkmn.com).** Nothing to install. You can try it with sample data first.

## How your data is handled

- **No backend, no accounts.** The site is plain static files, built from this public repo.
- **Data never leaves the browser.** Every file is read and processed in the tab. The page's content security policy has `connect-src 'none'`, so after it has loaded it cannot make network requests. The policy also allows only the site's own scripts (`script-src 'self'`), and the app escapes every value before it becomes markup, so no foreign code runs in the page. How to check this yourself: [ship/README.md](ship/README.md#checking-a-deployed-version).
- **Your data is one file you own.** A project is a single `*.fire.sqlite` file on your own machine. The browser keeps a working copy in its private storage, so you can close the tab and continue later; saving writes the file.

## What you get

- **Clear reports.** Follow your income, spending, savings rate, wealth and investments.
- **Made for a household.** Split account transactions among family members for common accounts.
- **Easy guided import.** Bring in the CSV and Excel files from your bank and broker.
- **Set targets.** Set and track your financial goals. 
- **Your FiRe date.** See when your investments could cover your living costs.
- **Multi language.** Finnish and English available.
- **Easy migration.** From FiRe v2.

## Run it locally

You need Node.js 22.

```shell
npm run setup
npm run dev:front
```

`npm run setup` installs the app and the lint tools exactly as the lockfiles say. The dev server prints the address to open.

Other commands, all from the repo root:

| Command | What |
| --- | --- |
| `npm run check` | Typecheck, lint, format check and every test. Code is done only when this passes. |
| `npm run format` | Format `front/` with Prettier. |
| `npm run build` | Production build into `front/dist`, then checks the output (security policy present, no inline code, no external references). |
| `npm run lint` | ESLint only. |

## Repository layout

| Path | What |
| --- | --- |
| `front/` | The web app (Vite, plain TypeScript, no framework). Conventions and layout: [front/AGENTS.md](front/AGENTS.md). |
| `ship/` | How the site is released, rolled back and checked: [ship/README.md](ship/README.md). |
| `front/fixtures/v2/` | The v2 sample data. Tests check that the web app gives the same ledger as v2 did, and that the move from v2 works. |

[AGENTS.md](AGENTS.md) holds the working rules for anyone (person or AI agent) changing the code.

## Contributing

1. Fork the repository and create a branch for your change.
2. Make the change; `npm run check` must pass. Every pull request is checked by the CI workflow.
3. Commit with a clear message and open a pull request.

New import formats that need preprocessing are welcome as pull requests: see [front/src/engine/preprocessors](front/src/engine/preprocessors/index.ts).

## License

[MIT](LICENSE).
