import { el } from "../lib/dom.ts";
import { ELEMENTS, BY_SYMBOL } from "../data/elements.ts";
import { getState, subscribe, toggleElement, onActivity } from "../store/store.ts";
import { sfx } from "../lib/sound.ts";
import type { ElementDef } from "../store/types.ts";

export function mountPeriodicTable(root: HTMLElement) {
  const wrap = el("div", { class: "table-wrap" });
  const grid = el("div", { class: "ptable", role: "grid", "aria-label": "Periodic table" });
  wrap.append(grid);
  root.append(wrap);

  const cells = new Map<string, HTMLElement>();

  for (const e of ELEMENTS) {
    const cell = el("button", {
      class: "pcell",
      role: "gridcell",
      "data-sym": e.symbol,
      "aria-label": `${e.name}, atomic number ${e.z}`,
      style: `--x:${e.xpos}; --y:${e.ypos === 9 ? 9 : e.ypos === 10 ? 10 : e.ypos}; --cat:var(--cat-${e.category})`,
      tabindex: e.z === 1 ? "0" : "-1",
    }, [
      el("span", { class: "pcell__z", text: e.z }),
      el("span", { class: "pcell__sym", text: e.symbol }),
      el("span", { class: "pcell__mass", text: e.mass.toFixed(e.mass < 100 ? 2 : 1) }),
    ]);
    cell.addEventListener("click", () => { sfx.key(); toggleElement(e.symbol); });
    cell.addEventListener("mouseenter", () => showHalo(cell, e));
    cell.addEventListener("mouseleave", () => hideHalo(cell));
    cell.addEventListener("focus", () => showHalo(cell, e));
    cell.addEventListener("blur", () => hideHalo(cell));
    grid.append(cell);
    cells.set(e.symbol, cell);
  }

  // f-block placeholders in the main body (group 3, periods 6 & 7)
  for (const [z, y, label] of [[57, 6, "57–71"], [89, 7, "89–103"]] as const) {
    void z;
    grid.append(el("div", {
      class: "pcell pcell--placeholder",
      style: `--x:3; --y:${y}`,
      text: label,
      "aria-hidden": "true",
    }));
  }
  // spacer before f-block rows
  grid.append(el("div", { class: "ptable__gap", "aria-hidden": "true", style: "--x:1; grid-row:8" }));

  // keyboard roving focus
  grid.addEventListener("keydown", (ev) => {
    const active = document.activeElement as HTMLElement;
    const sym = active?.dataset.sym;
    if (!sym) return;
    const cur = BY_SYMBOL[sym];
    if (!cur) return;
    let next: ElementDef | undefined;
    if (ev.key === "ArrowRight") next = neighbour(cur, 1, 0);
    else if (ev.key === "ArrowLeft") next = neighbour(cur, -1, 0);
    else if (ev.key === "ArrowDown") next = neighbour(cur, 0, 1);
    else if (ev.key === "ArrowUp") next = neighbour(cur, 0, -1);
    else return;
    ev.preventDefault();
    if (next) {
      const nc = cells.get(next.symbol);
      if (nc) { active.tabIndex = -1; nc.tabIndex = 0; nc.focus(); }
    }
  });

  function neighbour(e: ElementDef, dx: number, dy: number): ElementDef | undefined {
    const tx = e.xpos + dx, ty = e.ypos + dy;
    return ELEMENTS.find((c) => c.xpos === tx && c.ypos === ty);
  }

  function render() {
    const { selection } = getState();
    for (const [sym, cell] of cells) {
      cell.dataset.selected = String(selection.includes(sym));
    }
  }

  subscribe(render);
  render();

  // ghost-cursor tracing: when the agent targets an element cell
  onActivity((a) => {
    if (a.kind === "target" && a.selector?.startsWith("[data-sym=")) {
      const cell = grid.querySelector<HTMLElement>(a.selector);
      if (cell) {
        cell.dataset.trace = "true";
        cell.classList.add("traced");
        setTimeout(() => { cell.classList.remove("traced"); delete cell.dataset.trace; }, 700);
      }
    }
  });

  return { cells };
}

// ---- hover halo ----
function showHalo(cell: HTMLElement, e: ElementDef) {
  hideHalo(cell);
  const halo = el("div", { class: "pcell__halo" }, [
    el("b", { text: e.name }),
    el("div", { html: `Group ${e.group} · Period ${e.period}<br>&chi; ${e.electronegativity ?? "—"}` }),
    el("div", {
      html: e.oxidationStates.length
        ? `states <span class="ox">${e.oxidationStates.join(", ")}</span>`
        : "",
    }),
  ]);
  cell.append(halo);
}
function hideHalo(cell: HTMLElement) {
  cell.querySelector(".pcell__halo")?.remove();
}
