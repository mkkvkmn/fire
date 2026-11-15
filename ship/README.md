# Shipping fire

fire is a static site: plain HTML, CSS and JavaScript built from `front/` into `front/dist`. It has no backend and stores nothing on any server. It is hosted on GitHub Pages and deployed by the workflow `.github/workflows/deploy.yml`, from this public repo only, so anyone can check that the site they use is built from this source.

## How a release works

1. Make sure `npm run check` and `npm run build` pass locally and the work is committed. Check https://cdn.sheetjs.com/advisories/ for advisories on the `xlsx` version in `front/package.json`: it comes from the SheetJS CDN, so `npm audit` does not see it.
2. Test the built site by hand. The security policy exists only in the build, so the dev server and the unit tests cannot catch what it blocks.
   - Run `npm run build`, then `npm run preview:front`, and open http://localhost:4173.
   - Load the sample project. Open every screen and every Asetukset tab. Close the sample (it cannot be saved).
   - Create a new project. Import one CSV and one Excel file, for example `nordea.csv` and `luottokortti.xlsx` from `front/fixtures/v2/data/source_files/`. Go through the import steps to the last one and press "Tuo rivit" (Import rows): files that are only added are not in the project yet. Save, close the project, and open the saved file again. The files and their rows are there.
   - The console shows no error and no "Content Security Policy" message.
   - Repeat in Firefox and Safari. They have no File System Access API, so open and save go through the fallback (file picker and download).
3. Set the version in `front/package.json` (for example `3.0.0`), commit it, and tag the commit with the same version: `git tag v3.0.0`.
4. Push the branch and the tag: `git push origin main` and `git push origin v3.0.0`.
5. The tag starts the **Deploy** workflow. It runs these gates in order and publishes nothing if any of them fails:
   - `npm ci`: installs exactly what `package-lock.json` says.
   - `git diff --exit-code`: the tree is still clean, so the lockfile did not change.
   - `npm run check`: typecheck and every test, including sample-data parity and the report reference values.
   - `npm audit --audit-level=high`: no high or critical advisories.
   - `npm run build`: builds the site, then `front/scripts/check-dist.mjs` checks the output: the security policy is present and strict, `index.html` has no inline scripts or styles, and nothing points outside the site.
6. The built `front/dist` is published to GitHub Pages.
7. Write the release notes on the GitHub release of the tag: what changed.

The About card on the Project screen shows the version and the commit the site was built from, with a link to that commit.

## Rolling back

Open **Actions > Deploy > Run workflow**, choose the earlier tag under "Use workflow from", and run it. The same gates run, then that version is published. Note the rollback in the notes of the GitHub release.

## Security policy

The policy is a `<meta http-equiv="Content-Security-Policy">` tag that the build adds to `index.html` (`front/csp.ts`). The dev server does not get it, because live reload needs a websocket. It travels inside the HTML, so it applies on any host:

```
default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; manifest-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'
```

- `connect-src 'none'` is the core promise: after load the page cannot make any network request (fetch, XHR, websocket, beacon). The policy does not stop a navigation to another address, so the other half of the promise is that no foreign code runs in the page: `script-src 'self'` allows only the site's own files, and every value is escaped before it becomes markup.
- `'wasm-unsafe-eval'` lets sql.js compile its WebAssembly, which is bundled inside the JavaScript. No other eval is allowed.
- The only requests the page ever makes are its own code files (`script-src 'self'`): the main bundle on load, then the SQLite engine when a project is first opened, and the sample data when it is loaded.
- `frame-ancestors` cannot be set in a meta tag, and GitHub Pages does not let a site set response headers, so another site could show fire in a frame. The risk is small: there is no login, and a tricked click could only change the visitor's own local project, never send it anywhere. A host that allows headers closes this (see Other hosts).

### Checking a deployed version

1. Open the site, open the browser's developer tools on the Network tab, and use the app: load the sample, import a file, save. Only the site's own `.js` files appear.
2. In the console, run `fetch(location.href)`. It fails with a Content Security Policy error.

## First-time setup (repo owner)

- In the repo settings, under **Pages**, set the source to **GitHub Actions**.
- Under **Environments > github-pages > Deployment branches and tags**, add a tag rule `v*`. By default only the default branch may deploy, which would block the tag runs.
- Use a custom domain or subdomain (see Own origin): set it under **Pages** and add the DNS records GitHub shows. No app change is needed.

## Own origin

Browsers keep a site's local data (the working copy in private file storage, IndexedDB and localStorage) per origin, not per path. On the default address `<user>.github.io/fire`, every other GitHub Pages site of the same account shares that origin and could read the working copy, whatever fire's own policy says. Serve fire from an origin used for nothing else: a custom domain or subdomain (see First-time setup), or a GitHub account or organisation that publishes only fire.

## Other hosts

Any static host works: upload the contents of `front/dist`. The site uses relative paths (`base: "./"`), so it also works from a sub-folder, and the security policy is inside `index.html`. A host that allows response headers can repeat the same policy as a header and add `frame-ancestors 'none'`.
