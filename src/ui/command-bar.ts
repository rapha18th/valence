import { el } from "../lib/dom.ts";
import { getState, subscribe, setTheme, toggleSound } from "../store/store.ts";
import { runOperator } from "../operator/operator.ts";

export function mountCommandBar(root: HTMLElement) {
  const bar = el("header", { class: "cmd" });

  const brand = el("div", { class: "cmd__brand" }, [
    el("span", { class: "dot", title: "WebMCP" }),
    el("b", { text: "Valence" }),
    el("span", { text: "the bench" }),
  ]);

  const inputWrap = el("div", { class: "cmd__input" });
  const prompt = el("span", { text: "›" });
  const input = el("input", {
    type: "text",
    placeholder: "Ask: build a non-toxic polymer precursor using only period-2 elements",
    "aria-label": "Ask your agent",
    autocomplete: "off",
  });
  inputWrap.append(prompt, input);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      const v = input.value.trim();
      input.value = "";
      void runOperator(v);
    }
  });

  const tools = el("div", { class: "cmd__tools" });
  const themeBtn = el("button", {
    class: "iconbtn", "aria-label": "Toggle theme", title: "Theme",
    html: sun(),
  });
  const soundBtn = el("button", {
    class: "iconbtn", "aria-label": "Toggle sound", "aria-pressed": "false", title: "Sound",
    html: speaker(),
  });
  themeBtn.addEventListener("click", () => setTheme(getState().theme === "dark" ? "light" : "dark"));
  soundBtn.addEventListener("click", () => toggleSound());
  tools.append(themeBtn, soundBtn);

  bar.append(brand, inputWrap, tools);
  root.append(bar);

  subscribe(() => {
    const s = getState();
    soundBtn.setAttribute("aria-pressed", String(s.sound));
    themeBtn.innerHTML = s.theme === "dark" ? sun() : moon();
    (brand.querySelector(".dot") as HTMLElement).style.background =
      s.webmcpConnected ? "var(--signal)" : "var(--ink-700)";
  });
}

const sun = () =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>`;
const moon = () =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/></svg>`;
const speaker = () =>
  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a3 3 0 010 6"/></svg>`;
