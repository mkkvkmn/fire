# Checklist: ux-ui

Last reviewed: 2026-11-18
Refresh after: 2027-05-18

Can a person, on a phone or a desktop, with a mouse, a keyboard or a screen reader, import their files and read their reports without help?

## Research

When the checklist is stale, read these primary sources and note what changed:

- W3C WCAG 2.2 and its Understanding documents, at least: 1.4.3 Contrast (Minimum), 1.4.11 Non-text Contrast, 1.4.4 Resize Text, 1.4.10 Reflow, 2.1.1 Keyboard, 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured (Minimum), 2.5.8 Target Size (Minimum), 3.3.1 Error Identification, 3.3.3 Error Suggestion, 4.1.2 Name, Role, Value.
- The status of WCAG 3 drafts, only to note what may change.
- WAI-ARIA Authoring Practices: combobox, dialog, disclosure, tabs, table patterns.
- MDN on `prefers-reduced-motion` and forced colors.

## Live checks (run every time)

Use the browser pane on the `front-test` server, with synthetic data only: the sample project, the guided import, or fixtures from `front/fixtures/v2/data/source_files/`.

- Every screen at 375 px and at desktop width: Welcome, Tuonti (Tiedostot, Luokittelu, Tarkistukset), each report page and view on Seurantanäkymä, Tapahtumat, every Asetukset tab, Projekti (routes and English names: `SKILL.md`, In the browser pane). A screenshot of each at both widths, with the measured result in the log (`SKILL.md`, Evidence rules). No horizontal page scroll, no clipped or overlapping text.
- Zoom: 640 px wide is the phone layout (the breakpoint is 820 px), not desktop at 200%. Test the desktop layout in short windows too: 910 by 430 (a laptop at 150%) and 1280 by 600. Every screen still works and every control can be reached.
- Keyboard only, no mouse: open the sample, do the guided import as far as the keyboard reaches (drop the files as in `SKILL.md`, In the browser pane), change a report filter, open and close a dialog and the drawer, use a combo. Focus is always visible, never hidden behind a sticky bar, and the order follows the page.
- Contrast, measured, not guessed: compute the ratio of each text and UI colour token in `front/src/style.css` (`--fg`, `--muted`, `--faint` and others) against the backgrounds it is used on (`--bg`, `--surface`, `--raised`). Blend a translucent background over its parent before you compute. Skip disabled controls (WCAG exempts them). Write the ratios in the log. Include chart colours in `front/src/ui/charts.ts` against their background.
- Read the page as text (accessibility tree) for each screen: every button, input and icon button has a name, headings are in order, tables have headers.
- Switch the language (fi and en) once. Text fits in both.

## Areas

### Every state

- Empty: a new project with no files, a report with no data for the period, a filter that matches nothing. Each says what to do next.
- Loading: opening a large project, importing a large file. A busy state is shown.
- Error: a file no profile matches, a file over the limit (`front/src/engine/limits.ts`), a file with an invalid date or amount, a project file from a newer version, a save that the browser refuses. Each message says what went wrong, in which file, and how to recover.
- Very large data: many accounts, many categories, long descriptions. Tables, legends and combos stay usable.
- Unsaved changes: the user can see there are unsaved changes, and leaving or closing warns them.

### Errors that explain how to recover

- Every error names the file or value and the next step. No raw exception text, no "Error" alone.
- A destructive action (delete a file, a rule, a fix, close without saving) says exactly what it deletes and can be cancelled.

### Language

- Every user-facing string is in `front/src/ui/texts.ts`, in fi and en. Search the screens for hard-coded text.
- Plain words, the same word for the same thing on every screen (for example the names of the Tuonti steps and the classes). Button labels say the action.
- No em dash in any UI text.

### Visual consistency

- The same element looks and behaves the same everywhere: buttons (primary, ghost, small), add buttons, breadcrumbs, dialogs (`front/src/ui/dialog.ts`), toasts (`front/src/ui/toast.ts`), drawers (`front/src/ui/drawer.ts`), date fields (`front/src/ui/dateField.ts`), number fields (`front/src/ui/numberField.ts`).
- Spacing, alignment and number formatting (`front/src/ui/format.ts`) match across report pages.
- Charts: value labels readable, a table view for each chart, colours not the only way to tell series apart.

### Accessibility details

- Target size at least 24 by 24 px for every control, including icon buttons and expand buttons.
- Motion respects `prefers-reduced-motion`.
- Dialogs trap focus and return it on close. The Escape key closes them.
- Status changes (an import finished, a save done) are announced, not only shown.

## Severity guide

- **Critical**: a main task (open, import, save, read the overview) cannot be done at all on a phone or with a keyboard, or the UI hides that data was not saved.
- **High**: a WCAG 2.2 AA failure on a main task (contrast below 4.5:1 for body text, a control with no name, a keyboard trap), or an error that leaves the user with no way to recover.
- **Medium**: a WCAG failure on a secondary screen, a state that is missing or confusing, an inconsistent control on a main screen.
- **Low**: small inconsistencies in wording or spacing, a Suggestion.
