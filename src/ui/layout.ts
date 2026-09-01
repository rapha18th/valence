import { el } from "../lib/dom.ts";
import { getState, subscribe } from "../store/store.ts";
import { mountCommandBar } from "./command-bar.ts";
import { mountPeriodicTable } from "./periodic-table.ts";
import { mountWorkbenchBar } from "./workbench-bar.ts";
import { mountStage } from "./stage.ts";
import { mountBuildPanel } from "./build-panel.ts";
import { mountNotebook } from "./notebook-rail.ts";

export function mountLayout(app: HTMLElement) {
  const bench = el("div", { class: "bench" });
  const body = el("div", { class: "bench__body" });
  const main = el("div", { class: "bench__main" });

  mountCommandBar(bench);
  mountPeriodicTable(main);
  mountWorkbenchBar(main);
  mountStage(main);
  mountBuildPanel(main);
  body.append(main);
  mountNotebook(body);
  bench.append(body);

  const status = el("div", { class: "status" });
  bench.append(status);
  app.append(bench);

  const selEl = el("span", {});
  const qEl = el("span", {});
  const dot = el("span", { class: "status__dot" });
  const stEl = el("span", {});
  status.append(
    el("span", { class: "k", text: "SELECTION" }), selEl,
    el("span", { class: "status__spacer" }),
    stEl,
    el("span", { class: "status__spacer" }),
    el("span", { class: "k", text: "PUBCHEM" }), qEl,
    el("span", { class: "k", text: "WEBMCP" }), dot,
  );

  subscribe(() => {
    const s = getState();
    selEl.textContent = s.selection.length ? s.selection.join(" · ") : "—";
    qEl.textContent = s.queueDepth ? `${s.queueDepth} queued` : "idle";
    dot.dataset.on = String(s.webmcpConnected);
    stEl.textContent = s.status;
  });
}
