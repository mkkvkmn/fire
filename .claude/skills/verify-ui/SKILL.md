---
name: verify-ui
description: Checks a fire UI change in the browser pane before it is reported done. Starts a dev server from .claude/launch.json, uses synthetic data only, reads the page, uses the feature and its error case, checks console and network for any request with financial data, and judges screenshots at 375 px and desktop width.
---

# Verify a UI change

A UI change is done only when it has been checked in the browser (`AGENTS.md`, Working rules). Do these steps for every changed screen, then report what was checked and what was not.

## 1. Start a server

- Use `preview_start` with a name from `.claude/launch.json`: `front-test` (port 5174, another origin than the user's 5173) for normal checks, `front-dist` (port 4173, after `npm run build`) when the change touches the security policy, loading or network. Commands, fallback and stopping: `.claude/skills/audit/SKILL.md`, Guardrails.
- If the port is already in use, a server runs there. Use it; never start a second one.
- Never stop a server you did not start. Stop the ones you started when you are done.

## 2. Load synthetic data

- Never real data: no real statement, never the user's own project file.
- Use the sample project or the guided import with sample files (Welcome screen; both are generated in `front/src/project/demo.ts`), or a fixture from `front/fixtures/v2/data/source_files/` (for example `front/fixtures/v2/data/source_files/nordea.csv` or `front/fixtures/v2/data/source_files/luottokortti.xlsx`).
- The file picker cannot be driven. Drop a file built in the page (`.claude/skills/audit/SKILL.md`, In the browser pane), or use the guided import and write under "not checked" which file was not tried.

## 3. Read the page as text

- Read the page (`read_page` or `get_page_text`) on each changed screen. Check that the text is right, every control has a name, and headings and labels match the rest of the app.
- New text comes from `front/src/ui/texts.ts`. Switch the language once (fi and en) and read the screen again.

## 4. Use the feature

- Do the task the change is for, from start to end, as a user would: click, type, open dropdowns and dialogs, hover.
- Do the error case: a wrong or empty input, a file no profile matches, a cancelled dialog. The message says what went wrong and how to recover.
- Check the empty state and a state with a lot of data, if the change can reach them.
- Use the keyboard alone once: focus is visible and reaches every control.

## 5. Console and network

- Read the console (`read_console_messages`). No errors, no warnings from the app, no Content Security Policy violation.
- Read the network requests (`read_network_requests`). Only the site's own files are loaded. No request goes to another host, and no request carries financial data in its address, query or body. Any such request is a failure, whatever the reason.

## 6. Screenshots

- Take one screenshot at 375 px (`resize_window` preset `mobile`) and one at desktop width (preset `desktop`). Reload after the resize.
- Judge them critically, not only that the screen renders: no horizontal scroll, no clipped or overlapping text, aligned columns, readable contrast, the same buttons and spacing as the sibling screens.
- Reset the window to the `desktop` preset when done.

## 7. Report

End with two short lists:

- **Checked**: each screen and state, the server and port, the data used, and the result.
- **Not checked**: each step you could not do, and why (for example "fixture upload not possible in the pane", "Firefox and Safari not tried").
