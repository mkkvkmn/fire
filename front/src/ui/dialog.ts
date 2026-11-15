// In-app dialogs instead of window.confirm and window.prompt: they match the app's look and keep
// working where the browser blocks native dialogs. Both return a promise. The answer comes from
// the button click or Esc directly, not from the dialog's close event (which some embedded
// browsers deliver late or not at all).
import { html, raw } from "./html";
import { t } from "./texts";

/** Opens a modal dialog; resolves the text input's value ("" without one) on OK, or null. */
function open(body: string, okLabel: string, danger: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "app-dialog";
    d.innerHTML = html`<form>
      ${raw(body)}
      <div class="actions">
        <span class="grow"></span><button type="button" data-d="cancel" class="ghost">${t("cancel")}</button>
        <button type="submit" data-d="ok" class="${danger ? "primary danger-fill" : "primary"}">${okLabel}</button>
      </div>
    </form>`;
    document.body.append(d);
    let done = false;
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      if (d.open) d.close();
      d.remove();
      resolve(value);
    };
    const input = d.querySelector<HTMLInputElement>("input");
    d.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      if (input && !input.value.trim()) return;
      finish(input?.value ?? "");
    });
    d.querySelector('[data-d="cancel"]')!.addEventListener("click", () => finish(null));
    d.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    });
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      finish(null);
    });
    d.showModal();
    (input ?? d.querySelector<HTMLButtonElement>('[data-d="ok"]'))?.focus();
  });
}

/** Asks a yes/no question. Resolves true when the user confirms. `note` is a warning shown as its own paragraph. */
export async function ask(message: string, opts: { ok?: string; danger?: boolean; note?: string } = {}): Promise<boolean> {
  const note = opts.note ? html`<p class="warn-text">${opts.note}</p>` : "";
  return (
    (await open(
      html`<p>${message}</p>
        ${raw(note)}`,
      opts.ok ?? t("ok"),
      opts.danger ?? false,
    )) !== null
  );
}

/** Asks for one line of text. Resolves the trimmed text, or null when cancelled or empty. */
export async function askText(label: string, value = ""): Promise<string | null> {
  const v =
    (
      await open(html`<label class="field">${label}<input name="v" value="${value}" autocomplete="off" /></label>`, t("ok"), false)
    )?.trim() ?? "";
  return v || null;
}
