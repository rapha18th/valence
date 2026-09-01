import { el, clear, relTime } from "../lib/dom.ts";
import { getState, subscribe, clearNotebook } from "../store/store.ts";
import type { Actor } from "../store/types.ts";

export function mountNotebook(root: HTMLElement) {
  const rail = el("aside", { class: "notebook", "aria-label": "Lab notebook" });

  const head = el("div", { class: "notebook__head" });
  const filter = el("div", { class: "notebook__filter" });
  let mode: "all" | Actor = "all";
  const btns: Record<string, HTMLButtonElement> = {};
  for (const m of ["all", "person", "agent"] as const) {
    const b = el("button", { class: "tinybtn", "aria-pressed": String(m === "all"), text: m });
    b.addEventListener("click", () => { mode = m; for (const k in btns) btns[k].setAttribute("aria-pressed", String(k === m)); render(); });
    btns[m] = b;
    filter.append(b);
  }
  head.append(el("h2", { text: "Notebook" }), filter);

  const list = el("div", { class: "notebook__list" });

  const foot = el("div", { class: "notebook__foot" });
  const count = el("span", { text: "0 entries" });
  const exportBtn = el("button", { class: "tinybtn", text: "export" });
  const clearBtn = el("button", { class: "tinybtn", text: "clear" });
  exportBtn.addEventListener("click", exportNotebook);
  clearBtn.addEventListener("click", () => clearNotebook());
  foot.append(count, el("span", {}, [exportBtn, el("span", { text: " " }), clearBtn]));

  rail.append(head, list, foot);
  root.append(rail);

  function render() {
    const entries = getState().notebook.filter((e) => mode === "all" || e.actor === mode);
    clear(list);
    for (const e of entries) {
      const node = el("div", { class: "entry", "data-actor": e.actor }, [
        el("div", { class: "entry__meta", html: `<span>${e.actor}</span><span>${relTime(e.at)}</span>` }),
        el("div", { class: "entry__action", text: e.action }),
        el("div", { class: "entry__detail", text: e.detail }),
      ]);
      if (e.citation) {
        const a = el("a", {
          class: "entry__cite", href: e.citation.url, target: "_blank", rel: "noreferrer",
          text: `↗ ${e.citation.label}`,
        });
        node.append(a);
      }
      list.append(node);
    }
    count.textContent = `${getState().notebook.length} ${getState().notebook.length === 1 ? "entry" : "entries"}`;
  }

  subscribe(render);
  render();
}

function exportNotebook() {
  const lines = getState().notebook.slice().reverse().map((e) => {
    const t = new Date(e.at).toISOString();
    const cite = e.citation ? `  [${e.citation.label}](${e.citation.url})` : "";
    return `- ${t} · ${e.actor} · **${e.action}** — ${e.detail}${cite}`;
  });
  const md = `# Valence notebook\n\n${lines.join("\n")}\n`;
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "valence-notebook.md"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
