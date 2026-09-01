import { el, clear, relTime } from "../lib/dom.ts";
import { getState, subscribe, clearNotebook, clearTrace } from "../store/store.ts";
import type { Actor, TraceEntry } from "../store/types.ts";

export function mountNotebook(root: HTMLElement) {
  const rail = el("aside", { class: "notebook", "aria-label": "Lab notebook" });

  const head = el("div", { class: "notebook__head" });

  // view switch: the cited notebook, or the raw tool trace
  let view: "notebook" | "trace" = "notebook";
  const tabs = el("div", { class: "notebook__tabs" });
  const tabBtns: Record<string, HTMLButtonElement> = {};
  for (const v of ["notebook", "trace"] as const) {
    const b = el("button", { class: "notebook__tab", "aria-pressed": String(v === view), text: v });
    b.addEventListener("click", () => {
      view = v;
      for (const k in tabBtns) tabBtns[k].setAttribute("aria-pressed", String(k === v));
      render();
    });
    tabBtns[v] = b;
    tabs.append(b);
  }

  const filter = el("div", { class: "notebook__filter" });
  let mode: "all" | Actor = "all";
  const btns: Record<string, HTMLButtonElement> = {};
  for (const m of ["all", "person", "agent"] as const) {
    const b = el("button", { class: "tinybtn", "aria-pressed": String(m === "all"), text: m });
    b.addEventListener("click", () => { mode = m; for (const k in btns) btns[k].setAttribute("aria-pressed", String(k === m)); render(); });
    btns[m] = b;
    filter.append(b);
  }
  head.append(tabs, filter);

  const list = el("div", { class: "notebook__list" });

  const foot = el("div", { class: "notebook__foot" });
  const count = el("span", { text: "0 entries" });
  const exportBtn = el("button", { class: "tinybtn", text: "export" });
  const clearBtn = el("button", { class: "tinybtn", text: "clear" });
  exportBtn.addEventListener("click", exportNotebook);
  clearBtn.addEventListener("click", () => (view === "trace" ? clearTrace() : clearNotebook()));
  foot.append(count, el("span", {}, [exportBtn, el("span", { text: " " }), clearBtn]));

  rail.append(head, list, foot);
  root.append(rail);

  function renderNotebook() {
    const entries = getState().notebook.filter((e) => mode === "all" || e.actor === mode);
    for (const e of entries) {
      const node = el("div", { class: "entry", "data-actor": e.actor }, [
        el("div", { class: "entry__meta", html: `<span>${e.actor}</span><span>${relTime(e.at)}</span>` }),
        el("div", { class: "entry__action", text: e.action }),
        el("div", { class: "entry__detail", text: e.detail }),
      ]);
      if (e.citation) {
        node.append(el("a", {
          class: "entry__cite", href: e.citation.url, target: "_blank", rel: "noreferrer",
          text: `↗ ${e.citation.label}`,
        }));
      }
      list.append(node);
    }
    count.textContent = `${getState().notebook.length} ${getState().notebook.length === 1 ? "entry" : "entries"}`;
  }

  function renderTrace() {
    const entries = getState().trace.filter((e) => mode === "all" || e.actor === mode);
    for (const e of entries) {
      list.append(traceCard(e));
    }
    count.textContent = `${getState().trace.length} call${getState().trace.length === 1 ? "" : "s"}`;
  }

  function render() {
    clear(list);
    filter.hidden = false;
    if (view === "trace") renderTrace();
    else renderNotebook();
  }

  subscribe(render);
  render();
}

function traceCard(e: TraceEntry): HTMLElement {
  const state = e.ok === null ? "run" : e.ok ? "ok" : "err";
  const dur = e.durationMs == null ? "…" : e.durationMs < 1000 ? `${e.durationMs}ms` : `${(e.durationMs / 1000).toFixed(1)}s`;
  const args = argPreview(e.args);
  const node = el("div", { class: "trace", "data-state": state, "data-actor": e.actor }, [
    el("div", { class: "trace__top" }, [
      el("span", { class: "trace__name", text: e.name }),
      el("span", { class: "trace__dur", text: dur }),
    ]),
    el("div", { class: "trace__args", text: args }),
  ]);
  const tags = el("div", { class: "trace__tags" });
  tags.append(el("span", { class: "trace__tag trace__tag--" + state, text: e.ok === null ? "running" : e.ok ? "ok" : "error" }));
  if (e.retries > 0) tags.append(el("span", { class: "trace__tag trace__tag--retry", text: `${e.retries} retr${e.retries === 1 ? "y" : "ies"}` }));
  node.append(tags);
  if (e.error) node.append(el("div", { class: "trace__out trace__out--err", text: e.error }));
  else if (e.output) node.append(el("div", { class: "trace__out", text: e.output.length > 220 ? e.output.slice(0, 219) + "…" : e.output }));
  return node;
}

function argPreview(args: unknown): string {
  try {
    const s = JSON.stringify(args ?? {});
    return s === "{}" ? "(no arguments)" : s.length > 140 ? s.slice(0, 139) + "…" : s;
  } catch {
    return "(unserialisable)";
  }
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
