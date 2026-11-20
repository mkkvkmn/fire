# Checklist: correctness

Last reviewed: 2026-11-18
Refresh after: 2027-05-18

Does fire turn a bank or broker export into the right ledger rows and the right report figures?

## Research

When the checklist is stale, read these primary sources and note what changed:

- The export format help pages of the banks and brokers that fire has presets for (`front/src/engine/presets.ts`): column names, delimiter, date format, encoding.
- The WHATWG Encoding Standard: UTF-8, UTF-16 and windows-1252 decoding, BOM handling.
- RFC 4180 (CSV) and the SheetJS docs on how XLSX date cells and number formats are read.
- The ECMAScript spec and MDN on `Date` and time zones: what parsing a date-only string does in a time zone west or east of UTC.
- ISO 4217 minor units, and how binary floating point sums decimal euro amounts.
- v2 behaviour for parity: `git show f515f7b:data_pipeline/...` (the last v2 commit).

## Live checks (run every time)

- `npm run test:run` from the repo root. Record the number of tests and that all pass.
- The parity and reference tests alone, so their result is visible: `cd front && npx vitest run src/engine/parity.test.ts src/analytics/measures.test.ts src/project/migrate.test.ts`.
- The date-sensitive tests in two far time zones: `src/engine src/analytics src/project`, once in `Pacific/Kiritimati` (UTC+14) and once in `America/Los_Angeles`. A date that moves by one day is a finding. In Git Bash on Windows a shell `TZ=` does not reach Node, so set the zone with a preload file. Write `tz.cjs` in the scratchpad with the one line `process.env.TZ = process.env.AUDIT_TZ;`, then (Git Bash, `<tz.cjs>` is its absolute path):

  ```sh
  cd front
  AUDIT_TZ=Pacific/Kiritimati node --require <tz.cjs> -e "console.log(new Date(2024,0,1).toString())"
  AUDIT_TZ=Pacific/Kiritimati NODE_OPTIONS="--require <tz.cjs>" npx vitest run src/engine src/analytics src/project
  ```

  The first line is the proof: it must print `GMT+1400` (and `GMT-0800` for Los Angeles). Without it, the run tested nothing. Write the proof line in the log.
- In the app (`front-test` server): Welcome > guided import with the sample files. Go through Tiedostot, Luokittelu and Tarkistukset to "Tuo rivit" (names: `SKILL.md`, In the browser pane). One sample file is not recognised: give it a file profile in Tiedostot first. Check that the row count per file in the import equals the data rows in the file. Then open Tapahtumat, set the period to one month, and check that its total equals the sum of that month's rows in the files, balance rows included. The overview is not the reference: it shows only tulot and menot.
- Drop the same fixture file twice, for example `front/fixtures/v2/data/source_files/nordea.csv` on `#/import/files` (how: `SKILL.md`, In the browser pane; on `front-test` the page fetches the fixture from `/fixtures/`). The second import adds no rows.

## Areas

### File parsing per format

- Each preset in `front/src/engine/presets.ts` (s-pankki, nordea and the others) reads its fixture in `front/fixtures/v2/data/source_files/` with no lost or extra rows.
- `front/src/engine/tables.ts`: delimiter sniffing (`;`, `,`, tab), header below title lines, duplicate and empty headers, mixed line endings, a trailing empty column, quoted fields with the delimiter or a newline inside.
- XLSX (`front/fixtures/v2/data/source_files/luottokortti.xlsx`, `front/fixtures/v2/data/source_files/penno.xlsx`): the named sheet or the first, date cells, numbers stored as text, a sheet whose claimed range is bigger than its data.
- Preprocessors (`front/src/engine/preprocessors/`, now `front/src/engine/preprocessors/nordnet_portfolio.ts` over `front/fixtures/v2/data/source_files/for_preprocessors/nordnet/nordnet_salkkuraportti.csv`): every value lands in the right column, and a changed report layout fails loud instead of mislabelling lines.
- `front/src/engine/guess.ts`: the wizard's guess for an unknown file picks the right date, amount and description columns, and a wrong guess is visible to the user before import.

### Encodings

- `front/src/engine/decode.ts`: UTF-8 with and without BOM, UTF-16 LE and BE, windows-1252 fallback. Finnish letters (ä, ö, å) and the euro sign survive in descriptions and in category rules that match them.
- A file that is neither (binary, an image renamed to .csv) fails with a clear message, not a table of noise.

### Amounts and money

- `front/src/engine/amounts.ts`: decimal comma and decimal point, thousands separators (space, non-breaking space, dot, comma), Unicode minus, leading plus, sign in a separate column or by profile (`sign` in `front/src/engine/profiles.ts`).
- Text that is not a number is refused or shown for review, never read as 0.
- Sums in `front/src/analytics/measures.ts` and `front/src/analytics/flows.ts`: floating point drift does not show in displayed figures, and rounding happens once, at display (`front/src/ui/format.ts`).
- Split rows (`front/src/engine/split.ts`): the parts add up to the original amount to the cent.
- Currency: fire assumes euros. Check what happens with a file in another currency (broker rows with a `currency` column) and say whether it is converted, refused or summed as euros.

### Dates and time zones

- `front/src/engine/dates.ts`: every format in the presets, unpadded day and month, impossible dates refused, two-digit years.
- No step turns a date into a `Date` in local time and back, so a user west or east of UTC never sees a row move to the previous or next day or month.
- Month boundaries: a row on the last day of a month is in that month in every report and in locked periods (`front/src/engine/lock.ts`).

### Duplicates and ids

- `front/src/engine/ids.ts`: identical rows in one file get distinct tx ids by occurrence, and re-importing the same file gives the same ids.
- Overlapping exports (two files that share some months) do not double the shared rows.
- `front/src/engine/duplicates.ts`: possible duplicates are shown, and a decided pair stays decided after a rebuild.

### Categorisation and fixes

- `front/src/engine/categorize.ts`: rule order, last match wins, case-insensitive, sign check. A rule with an invalid regex fails loud with the rule named.
- Rows no rule matches reach Review and are not dropped from totals silently.
- `front/src/engine/fix.ts`: a fix changes only the fields it sets; a fix that matches no row is shown.
- `front/src/engine/targets.ts`: one target row per month end, the first and last month included.

### Reports reconcile with the input

- For one month and one owner: the sum of ledger amounts per class (`tulot`, `menot`, `varat`, `velat`) equals the figure the report shows.
- The CSV export (`front/src/engine/exportCsv.ts`) row count and sum equal the ledger.
- Locked months (`front/src/engine/lock.ts`) keep their figures after a rebuild; late rows wait in Review.
- The v2 migration (`front/src/project/migrate.ts`) compares with `front/fixtures/v2/data/final/final_data.csv` by month and class, and a difference is shown to the user.

### Regression tests

- Every preset and preprocessor has a fixture and a test beside the source.
- Every bug fixed in the engine since the last audit has a test that fails without the fix.

## Severity guide

- **Critical**: a report total or a ledger amount is wrong for a normal file of a supported format, or rows are lost or doubled without a warning.
- **High**: wrong results for a common variant (another encoding, a decimal point file, a user in another time zone), or a wrong category or owner that the user cannot see.
- **Medium**: wrong results for a rare input, or an error that is caught but explained badly, or a missing regression test for a fixed bug.
- **Low**: a missing test for a case that works, unclear naming of a rule, a Suggestion.
