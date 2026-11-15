// A toast in the bottom right corner that closes itself after a while (a bar shows the time left).
import { html, raw } from "./html";
import { icon, type IconName } from "./icons";
import { t } from "./texts";

export function showToast(
  title: string,
  body: string,
  link?: { href: string; label: string },
  ms = 8000,
  kind: "done" | "warn" = "done",
): void {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = kind === "warn" ? "toast warn" : "toast";
  const ic: IconName = kind === "warn" ? "alert" : "check";
  el.setAttribute("role", "status");
  el.innerHTML = html`${raw(icon(ic))}
    <div>
      <b>${title}</b>
      <div class="small">${body}</div>
      ${raw(link ? html`<a class="small" href="${link.href}">${link.label}</a>` : "")}
    </div>
    <button type="button" class="sm ghost" aria-label="${t("close")}">${raw(icon("x"))}</button><i class="timer"></i>`;
  document.body.append(el);
  const timer = el.querySelector<HTMLElement>(".timer")!;
  timer.style.animationDuration = `${ms}ms`;
  const close = () => el.remove();
  el.querySelector("button")!.addEventListener("click", close);
  el.querySelector("a")?.addEventListener("click", close);
  setTimeout(close, ms);
}
