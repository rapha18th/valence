import { el, clear, fmt } from "../lib/dom.ts";
import { getState, subscribe, setBuild } from "../store/store.ts";
import { BY_SYMBOL } from "../data/elements.ts";
import { invokeTool } from "../webmcp/invoke.ts";
import type { BuildConstraints, CandidateScore } from "../store/types.ts";

// The human's view of a constraint solve. Not an agent dashboard: the goal and
// every constraint are editable, the ranking is a side-by-side table, and a
// rejected candidate says why it was rejected.

export function mountBuildPanel(root: HTMLElement) {
  const panel = el("section", { class: "buildp", hidden: true, "aria-label": "Constraint build" });
  root.append(panel);

  // local, editable copy of the constraints; seeded from the running job
  let draft: BuildConstraints = {};
  let draftKey = "";

  function syncDraft() {
    const b = getState().build;
    if (!b) return;
    if (b.id !== draftKey) {
      draftKey = b.id;
      draft = JSON.parse(JSON.stringify(b.constraints ?? {}));
    }
  }

  async function rerun(goal: string) {
    await invokeTool("build_to_constraints", { goal, constraints: draft as Record<string, unknown> });
  }

  async function stop() {
    const b = getState().build;
    if (b) await invokeTool("cancel_build", { jobId: b.id });
  }

  function elementChips(): HTMLElement {
    const wrap = el("div", { class: "buildp__chips" });
    const list = draft.elements ?? [];
    for (const sym of list) {
      const chip = el("span", { class: "buildp__el", text: sym });
      const x = el("button", { class: "buildp__elx", "aria-label": `Remove ${sym}`, text: "×" });
      x.addEventListener("click", () => {
        draft.elements = (draft.elements ?? []).filter((s) => s !== sym);
        render();
      });
      chip.append(x);
      wrap.append(chip);
    }
    const add = el("input", { class: "buildp__eladd", placeholder: "+ element", "aria-label": "Add allowed element" }) as HTMLInputElement;
    add.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const v = add.value.trim();
      const sym = v ? v[0].toUpperCase() + v.slice(1).toLowerCase() : "";
      if (BY_SYMBOL[sym]) {
        draft.elements = [...new Set([...(draft.elements ?? []), sym])];
        add.value = "";
        render();
      } else {
        add.value = "";
      }
    });
    wrap.append(add);
    return wrap;
  }

  function controls(goal: string): HTMLElement {
    const c = el("div", { class: "buildp__controls" });

    // period
    const periodSel = el("select", { class: "buildp__sel", "aria-label": "Period limit" }) as HTMLSelectElement;
    periodSel.append(el("option", { value: "", text: "any period" }));
    for (let i = 1; i <= 7; i++) periodSel.append(el("option", { value: String(i), text: `period ${i}` }));
    periodSel.value = draft.period ? String(draft.period) : "";
    periodSel.addEventListener("change", () => {
      draft.period = periodSel.value ? Number(periodSel.value) : undefined;
      if (draft.period) {
        draft.elements = Object.values(BY_SYMBOL)
          .filter((e) => e.period === draft.period && e.category !== "lanthanide" && e.category !== "actinide")
          .map((e) => e.symbol);
      }
      render();
    });

    // non-toxic
    const tox = el("label", { class: "buildp__check" });
    const toxCb = el("input", { type: "checkbox" }) as HTMLInputElement;
    toxCb.checked = !!draft.nonToxic;
    toxCb.addEventListener("change", () => { draft.nonToxic = toxCb.checked || undefined; });
    tox.append(toxCb, el("span", { text: "non-toxic (GHS-aware)" }));

    // caps
    const mkNum = (label: string, key: "maxWeight" | "maxLogP", step: string) => {
      const w = el("label", { class: "buildp__num" });
      const inp = el("input", { type: "number", step, placeholder: "—", "aria-label": label }) as HTMLInputElement;
      if (draft[key] != null) inp.value = String(draft[key]);
      inp.addEventListener("change", () => {
        const n = parseFloat(inp.value);
        draft[key] = Number.isFinite(n) ? n : undefined;
      });
      w.append(el("span", { text: label }), inp);
      return w;
    };

    c.append(
      periodSel,
      tox,
      mkNum("max MW", "maxWeight", "10"),
      mkNum("max logP", "maxLogP", "0.5"),
    );

    const row = el("div", { class: "buildp__ctlrow" }, [
      el("div", { class: "buildp__ctlk", text: "ALLOWED ELEMENTS" }),
      elementChips(),
    ]);

    const rerunBtn = el("button", { class: "buildp__rerun", text: "Re-run with these constraints →" });
    rerunBtn.addEventListener("click", () => void rerun(goal));

    return el("div", {}, [c, row, rerunBtn]);
  }

  function candTable(cands: CandidateScore[], winnerCid: number | null): HTMLElement {
    const t = el("div", { class: "buildp__table", role: "table" });
    t.append(el("div", { class: "buildp__tr buildp__tr--head" }, [
      cell("candidate"), cell("MW"), cell("TPSA"), cell("logP"),
      cell("HBD/HBA"), cell("GHS"), cell("score"), cell(""),
    ]));
    const winner = cands.find((c) => c.cid === winnerCid) ?? cands.find((c) => c.pass) ?? cands[0];
    for (const c of cands) {
      const isWin = winner && c.cid === winner.cid;
      const bar = el("div", { class: "buildp__scorebar", title: breakdownTitle(c) }, [
        el("i", { style: `width:${Math.round(c.score)}%` }),
      ]);
      const row = el("div", {
        class: "buildp__tr" + (isWin ? " buildp__tr--win" : "") + (c.pass ? "" : " buildp__tr--rej"),
        role: "row",
      }, [
        el("div", { class: "buildp__c buildp__c--name" }, [
          el("b", { text: c.name.length > 26 ? c.name.slice(0, 25) + "…" : c.name }),
          el("span", { class: "buildp__f", text: c.formula }),
        ]),
        cell(fmt(c.weight, 1)),
        cell(fmt(c.tpsa, 0)),
        cell(fmt(c.xlogp, 1)),
        cell(`${fmt(c.hbd, 0)}/${fmt(c.hba, 0)}`),
        el("div", { class: "buildp__c buildp__c--ghs", text: c.hazardLabel ?? "—" }),
        el("div", { class: "buildp__c buildp__c--score" }, [bar, el("span", { text: `${c.score}` })]),
        vsButton(c, winner),
      ]);
      t.append(row);
      if (!c.pass && c.rejected) {
        t.append(el("div", { class: "buildp__why", text: `✗ rejected: ${c.rejected}` }));
      }
    }
    return t;
  }

  function vsButton(c: CandidateScore, winner: CandidateScore | undefined): HTMLElement {
    const wrap = el("div", { class: "buildp__c buildp__c--vs" });
    if (winner && c.cid !== winner.cid) {
      const b = el("button", { class: "buildp__vs", title: `Compare ${winner.name} vs ${c.name}`, text: "vs winner" });
      b.addEventListener("click", () => void invokeTool("compare_compounds", { a: winner.name, b: c.name }));
      wrap.append(b);
    }
    return wrap;
  }

  function render() {
    const b = getState().build;
    if (!b) { panel.hidden = true; return; }
    panel.hidden = false;
    syncDraft();
    clear(panel);

    const running = b.status === "running";
    const goalInput = el("input", {
      class: "buildp__goal", value: b.goal, "aria-label": "Build goal",
    }) as HTMLInputElement;

    const pill = el("span", { class: "buildp__pill", "data-s": b.status, text: b.status });
    const head = el("div", { class: "buildp__head" }, [
      el("span", { class: "buildp__k", text: "BUILD" }),
      goalInput,
      pill,
    ]);
    if (running) {
      const stopBtn = el("button", { class: "buildp__stop", text: "Stop" });
      stopBtn.addEventListener("click", () => void stop());
      head.append(stopBtn);
    } else {
      const close = el("button", { class: "buildp__stop", text: "Clear" });
      close.addEventListener("click", () => setBuild(null));
      head.append(close);
    }
    panel.append(head);

    // progress
    const pct = b.progress.total ? Math.round((b.progress.done / b.progress.total) * 100) : running ? 8 : 100;
    panel.append(el("div", { class: "buildp__phase" }, [
      el("span", { text: b.phase + (b.progress.total ? ` — ${b.progress.done}/${b.progress.total}` : "") }),
      el("span", { class: "buildp__elapsed", text: `${(((b.endedAt ?? Date.now()) - b.startedAt) / 1000).toFixed(1)}s` }),
    ]));
    panel.append(el("div", { class: "buildp__bar" }, [
      el("i", { style: `width:${pct}%`, "data-run": String(running) }),
    ]));

    if (b.status === "error") {
      panel.append(el("div", { class: "buildp__err", text: b.error ?? "Build failed." }));
    }
    if (b.partial) {
      panel.append(el("div", { class: "buildp__note", text: "Partial: the hazard sweep hit its time budget. The ranking below covers every candidate that was fully processed." }));
    }

    panel.append(controls(goalInput.value || b.goal));

    if (b.candidates.length) {
      panel.append(candTable(b.candidates, b.winnerCid));
    } else if (running) {
      panel.append(el("div", { class: "buildp__note", text: "Resolving and hazard-checking candidates…" }));
    }
  }

  subscribe(render);
  render();
}

function cell(text: string): HTMLElement {
  return el("div", { class: "buildp__c", text });
}

function breakdownTitle(c: CandidateScore): string {
  const lines = c.breakdown.map((t) => `${t.delta >= 0 ? "+" : ""}${t.delta}  ${t.label}`);
  return `base ${c.base}\n` + lines.join("\n") + `\n= ${c.score}/100`;
}
