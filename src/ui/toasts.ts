import { el } from "../lib/dom.ts";

let host: HTMLElement | null = null;

export function mountToasts() {
  host = el("div", { class: "toasts", "aria-live": "polite" });
  document.body.append(host);
}

export function toast(text: string, ms = 2600) {
  if (!host) return;
  const t = el("div", { class: "toast", text });
  host.append(t);
  setTimeout(() => {
    t.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(6px)" }], { duration: 200, fill: "forwards" });
    setTimeout(() => t.remove(), 220);
  }, ms);
}
