import { el, clear, fmt } from "../lib/dom.ts";
import { getState, subscribe, setStage, setComparison, setRecovery } from "../store/store.ts";
import { sfx } from "../lib/sound.ts";
import { drawStructureSvg } from "../lib/structure2d.ts";
import * as ops from "../webmcp/ops.ts";
import { invokeTool } from "../webmcp/invoke.ts";
import type { MoleculeProps, CompareSide, HazardProfile } from "../store/types.ts";

// evidence-based, never a bare "safe" / "toxic"
function hazardWording(h: HazardProfile): { head: string; sub: string } {
  switch (h.basis) {
    case "primary-classification":
      return {
        head: h.signal ?? "GHS classified",
        sub: h.statements.slice(0, 3).map((s) => `${s.code} ${s.text}`).join("  ·  ") || "see PubChem for statements",
      };
    case "no-ghs-record":
      return { head: "No GHS record", sub: "PubChem was checked; nothing is classified for this compound" };
    case "reference-safe":
      return { head: "No GHS record", sub: "reference compound; no classification expected" };
    case "source-unavailable":
    default:
      return { head: "Not checked", sub: "PubChem unavailable — hazard was not read" };
  }
}

function provChipText(p: MoleculeProps["prov"]): string {
  if (!p) return "provenance unknown";
  const when = p.fetchedAt ? new Date(p.fetchedAt).toISOString().slice(11, 16) + "Z" : "";
  const src =
    p.source === "pubchem-live" ? "PubChem · live"
    : p.source === "pubchem-cache" ? "PubChem · cached"
    : p.source === "bundled" ? "bundled reference"
    : p.source === "computed" ? "computed locally"
    : "source unavailable";
  return when ? `${src} · ${when}` : src;
}

export function mountStage(root: HTMLElement) {
  const stage = el("div", { class: "stage", "data-mode": "empty" });

  const scene = el("div", { class: "stage__scene" });
  const empty = el("div", { class: "stage__empty" }, [
    el("div", {
      html: `<svg width="72" height="72" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1"><circle cx="24" cy="24" r="15" stroke-dasharray="2 3"/><circle cx="24" cy="9" r="3.2" fill="currentColor" fill-opacity="0.25"/><circle cx="37" cy="31.5" r="3.2" fill="currentColor" fill-opacity="0.25"/><circle cx="11" cy="31.5" r="3.2" fill="currentColor" fill-opacity="0.25"/><path d="M24 9v9M24 24l13 7.5M24 24 11 31.5" stroke-opacity="0.7"/><circle cx="24" cy="24" r="2"/></svg>`,
    }),
    el("div", { text: "THE STAGE IS EMPTY", style: "letter-spacing:.18em;color:var(--ink-300)" }),
    el("div", { text: "press two element keys, or ask your agent to build something", style: "opacity:.65;margin-top:6px;letter-spacing:.02em" }),
  ]);

  const layer2d = el("div", { class: "stage__layer stage__2d" });
  const svg2d = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg2d.setAttribute("viewBox", "0 0 440 360");
  svg2d.setAttribute("class", "stage__svg");
  layer2d.append(svg2d);

  const layer3d = el("div", { class: "stage__layer stage__3d" });
  const holder3d = el("div", { style: "position:relative;width:100%;height:100%" });
  layer3d.append(holder3d);

  scene.append(empty, layer2d, layer3d);

  const title = el("div", { class: "stage__title" });
  const controls = el("div", { class: "stage__controls" });
  const t2d = el("button", { class: "chip", "aria-pressed": "false", text: "2D" });
  const t3d = el("button", { class: "chip", "aria-pressed": "false", text: "3D" });
  const tSpin = el("button", { class: "chip", "aria-pressed": "false", text: "spin" });
  const tLabels = el("button", { class: "chip", "aria-pressed": "true", title: "Atom labels", text: "labels·X" });
  const tMax = el("button", { class: "chip chip--max", "aria-pressed": "false", "aria-label": "Maximise stage", title: "Maximise (Esc to exit)", text: "⤢" });
  t2d.addEventListener("click", () => setStage("2d"));
  t3d.addEventListener("click", () => { if (getState().sdf3d) setStage("3d"); });
  tSpin.addEventListener("click", () => toggleSpin(tSpin));
  tLabels.addEventListener("click", () => cycleLabels(tLabels));
  tMax.addEventListener("click", () => setMax(stage.dataset.max !== "true"));
  controls.append(t2d, t3d, tSpin, tLabels, tMax);

  function setMax(on: boolean) {
    stage.dataset.max = String(on);
    tMax.setAttribute("aria-pressed", String(on));
    tMax.textContent = on ? "⤡" : "⤢";
    // let layout settle, then resize the GL viewer to the new box
    requestAnimationFrame(() => setTimeout(() => {
      if (viewer) { try { viewer.resize(); viewer.render(); } catch { /* ignore */ } }
    }, 60));
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && stage.dataset.max === "true") setMax(false);
  });

  const hazard = el("div", { class: "hazard", hidden: true });
  const compare = el("div", { class: "compare", hidden: true });
  const props = el("div", { class: "props" });

  const uses = el("div", { class: "stage__uses", hidden: true });
  const cmp = el("div", { class: "stage__cmp", hidden: true });
  const recovery = el("div", { class: "recovery", hidden: true });
  stage.append(scene, cmp, title, uses, controls, hazard, compare, recovery, props);
  root.append(stage);

  let viewer: any = null;
  let lastSmiles = "";
  let lastSdf = "";
  let lastTheme = getState().theme;

  async function ensureViewer() {
    if (viewer) return viewer;
    const mod: any = await import("3dmol").catch(() => import("3dmol/build/3Dmol.js" as any));
    const $3Dmol = mod.createViewer ? mod : (mod.default ?? mod);
    viewer = $3Dmol.createViewer(holder3d, {
      backgroundColor: "black",
      backgroundOpacity: 0,
      antialias: true,
    });
    const ro = new ResizeObserver(() => {
      if (viewer) { try { viewer.resize(); viewer.render(); } catch { /* ignore */ } }
    });
    ro.observe(holder3d);
    return viewer;
  }

  function toggleSpin(btn: HTMLElement) {
    const on = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute("aria-pressed", String(!on));
    if (viewer) { viewer.spin(!on ? "y" : false); viewer.render(); }
  }

  // 0 = none, 1 = heteroatoms only, 2 = every atom
  let labelMode = 1;
  function applyLabels() {
    if (!viewer) return;
    try {
      viewer.removeAllLabels();
      if (labelMode === 0) { viewer.render(); return; }
      const dark = getState().theme !== "light";
      const style = {
        fontSize: 12, fontColor: dark ? "#f3f1ec" : "#1b1b1b",
        backgroundColor: dark ? "#000000" : "#ffffff", backgroundOpacity: 0.35,
        borderThickness: 0, inFront: true, alignment: "center",
      };
      const sel = labelMode === 1 ? { not: { elem: ["C", "H"] } } : {};
      viewer.addPropertyLabels("elem", sel, style);
      viewer.render();
    } catch { /* older 3Dmol without addPropertyLabels */ }
  }
  function cycleLabels(btn: HTMLElement) {
    labelMode = (labelMode + 1) % 3;
    btn.setAttribute("aria-pressed", String(labelMode > 0));
    btn.textContent = labelMode === 0 ? "labels" : labelMode === 1 ? "labels·X" : "labels·all";
    applyLabels();
  }

  function draw2d(p: MoleculeProps) {
    if (p.smiles === lastSmiles) return;
    lastSmiles = p.smiles;
    if (!p.smiles) {
      // a predicted / offline compound with no structure on file
      svg2d.innerHTML =
        `<text x="220" y="176" text-anchor="middle" fill="#7b776e" ` +
        `font-family="var(--font-mono)" font-size="15">${p.formula || "no structure"}</text>` +
        `<text x="220" y="200" text-anchor="middle" fill="#5b5852" ` +
        `font-family="var(--font-mono)" font-size="11">structure not available offline</text>`;
      return;
    }
    drawStructureSvg(p.smiles, svg2d as SVGSVGElement, getState().theme === "light" ? "light" : "dark");
  }

  async function draw3d(sdf: string) {
    if (!sdf || sdf === lastSdf) return;
    lastSdf = sdf;
    const v = await ensureViewer();
    v.clear();
    v.addModel(sdf, "sdf");
    v.setStyle({}, {
      stick: { radius: 0.16, colorscheme: "Jmol" },
      sphere: { scale: 0.30, colorscheme: "Jmol" },
    });
    v.zoomTo();
    v.render();
    v.zoom(1.6, 500);
    applyLabels();
    // the scene may have been zero-height at create time; force a resize once
    setTimeout(() => { try { v.resize(); v.zoomTo(); v.zoom(1.6); v.render(); applyLabels(); } catch { /* ignore */ } }, 120);
    sfx.confirm();
  }

  function renderProps(p: MoleculeProps | null) {
    clear(props);
    if (!p) return;
    const cells: [string, string, string?][] = [
      ["formula", p.formula || "—"],
      ["weight", fmt(p.weight, 2), "g/mol"],
      ["TPSA", fmt(p.tpsa, 1), "Å²"],
      ["logP", fmt(p.xlogp, 2)],
      ["H-bond D / A", `${fmt(p.hbd, 0)} / ${fmt(p.hba, 0)}`],
      ["rot. bonds", fmt(p.rotatable, 0)],
    ];
    for (const [k, v, u] of cells) {
      props.append(el("div", { class: "props__cell" }, [
        el("div", { class: "props__k", text: k }),
        el("div", { class: "props__v", html: `${v}${u ? ` <small>${u}</small>` : ""}` }),
      ]));
    }
    props.append(el("div", { class: "props__cell props__cell--prov" }, [
      el("div", { class: "props__k", text: "source" }),
      el("div", { class: "props__prov", text: provChipText(p.prov) }),
    ]));
  }

  function renderHazard() {
    const s = getState();
    const h = s.hazard;
    if (!h || !s.props) { hazard.hidden = true; return; }
    hazard.hidden = false;
    hazard.dataset.sev = h.severity;
    clear(hazard);
    const w = hazardWording(h);
    hazard.append(
      el("div", { class: "hazard__row" }, [
        el("span", { class: "hazard__sig", text: w.head }),
      ]),
      el("div", { class: "hazard__pics" },
        h.pictograms.length
          ? h.pictograms.map((p) => el("span", { class: "hazard__pic", title: p, text: p.replace("GHS", "") }))
          : [el("span", { class: "hazard__stmts", text: h.basis === "primary-classification" ? "no pictograms" : "no pictograms on file" })],
      ),
      el("div", { class: "hazard__stmts", text: w.sub }),
      el("div", { class: "hazard__prov", text: provChipText(h.prov) }),
    );
  }

  function renderRecovery() {
    const r = getState().recovery;
    if (!r) { recovery.hidden = true; return; }
    recovery.hidden = false;
    clear(recovery);
    recovery.append(
      el("div", { class: "recovery__title", text: r.title }),
      el("div", { class: "recovery__detail", text: r.detail }),
    );
    const acts = el("div", { class: "recovery__acts" });
    for (const a of r.actions) {
      const btn = el("button", { class: "recovery__btn", text: a.label });
      btn.addEventListener("click", () => {
        setRecovery(null);
        void invokeTool(a.tool, a.args);
      });
      acts.append(btn);
    }
    const dismiss = el("button", { class: "recovery__x", "aria-label": "Dismiss", text: "dismiss" });
    dismiss.addEventListener("click", () => setRecovery(null));
    acts.append(dismiss);
    recovery.append(acts);
  }

  function renderCompare() {
    const { similars, candidates, props: cur } = getState();
    const isSimilar = !candidates?.length && similars.length > 0;
    const list = candidates?.length
      ? candidates.map((c) => ({ name: c.name, formula: c.formula, score: c.score, pass: c.pass, notes: c.reasons }))
      : similars.map((s) => ({ name: s.name, formula: s.formula, score: s.greenScore ?? 0, pass: true, notes: s.greenNotes ?? [] }));
    if (!list.length) { compare.hidden = true; return; }
    compare.hidden = false;
    clear(compare);
    for (const it of list.slice(0, 4)) {
      const card = el("div", { class: "compare__card", "data-pass": String(it.pass) }, [
        el("b", { text: it.name.length > 22 ? it.name.slice(0, 21) + "…" : it.name }),
        el("span", { class: "f", text: it.formula }),
        el("div", { class: "compare__score" }, [el("i", { style: `width:${Math.round(it.score)}%` })]),
        el("div", { class: "hazard__stmts", text: (it.notes[0] ?? "").slice(0, 60) }),
      ]);
      if (isSimilar && cur) {
        card.classList.add("compare__card--clickable");
        card.title = `Compare ${cur.name} vs ${it.name}`;
        card.addEventListener("click", () => void ops.compareCompounds(cur.name, it.name, "person"));
      }
      compare.append(card);
    }
  }

  const cmpProps = (p: MoleculeProps) =>
    `<span>MW <b>${fmt(p.weight, 2)}</b></span>` +
    `<span>TPSA <b>${fmt(p.tpsa, 1)}</b></span>` +
    `<span>logP <b>${fmt(p.xlogp, 2)}</b></span>` +
    `<span>HBD/HBA <b>${fmt(p.hbd, 0)}/${fmt(p.hba, 0)}</b></span>` +
    `<span>rot. bonds <b>${fmt(p.rotatable, 0)}</b></span>`;

  // compare view: built once per comparison, then 2D<->3D is just a toggle
  let cmpKey = "";
  let cmpMode: "2d" | "3d" = "2d";
  const cmpPanes: { viz: HTMLElement; svg: SVGSVGElement; holder: HTMLElement; viewer: any; loaded: boolean; side: CompareSide }[] = [];

  function teardownCmp() {
    for (const p of cmpPanes) { try { p.viewer?.clear?.(); } catch { /* ignore */ } }
    cmpPanes.length = 0;
    cmpKey = "";
  }

  async function loadCmp3d(pane: typeof cmpPanes[number]) {
    if (pane.loaded) { pane.viewer?.resize?.(); pane.viewer?.render?.(); return; }
    pane.loaded = true;
    const mod: any = await import("3dmol").catch(() => import("3dmol/build/3Dmol.js" as any));
    const $3Dmol = mod.createViewer ? mod : (mod.default ?? mod);
    const v = $3Dmol.createViewer(pane.holder, { backgroundColor: "black", backgroundOpacity: 0, antialias: true });
    pane.viewer = v;
    const { get3dSdf } = await import("../pubchem/parse.ts");
    const { sdf } = await get3dSdf(pane.side.props.cid);
    if (!sdf) { pane.holder.innerHTML = '<div class="stage__cmp-3dnote">no 3D geometry</div>'; return; }
    v.addModel(sdf, "sdf");
    v.setStyle({}, { stick: { radius: 0.16, colorscheme: "Jmol" }, sphere: { scale: 0.30, colorscheme: "Jmol" } });
    v.zoomTo(); v.render(); v.zoom(1.5, 400);
    try {
      v.addPropertyLabels("elem", { not: { elem: ["C", "H"] } }, {
        fontSize: 11, fontColor: "#f3f1ec", backgroundColor: "#000", backgroundOpacity: 0.35, borderThickness: 0, inFront: true,
      });
      v.render();
    } catch { /* ignore */ }
    setTimeout(() => { try { v.resize(); v.zoomTo(); v.zoom(1.5); v.render(); } catch { /* ignore */ } }, 120);
  }

  function applyCmpMode() {
    for (const p of cmpPanes) {
      p.svg.style.display = cmpMode === "2d" ? "" : "none";
      p.holder.style.display = cmpMode === "3d" ? "" : "none";
      if (cmpMode === "3d") void loadCmp3d(p);
    }
  }

  function buildCmpView(c: NonNullable<ReturnType<typeof getState>["comparison"]>) {
    clear(cmp);
    teardownCmp();
    cmpKey = `${c.a.props.cid}|${c.b.props.cid}`;

    const t2 = el("button", { class: "chip", "aria-pressed": String(cmpMode === "2d"), text: "2D" });
    const t3 = el("button", { class: "chip", "aria-pressed": String(cmpMode === "3d"), text: "3D" });
    t2.addEventListener("click", () => { cmpMode = "2d"; t2.setAttribute("aria-pressed", "true"); t3.setAttribute("aria-pressed", "false"); applyCmpMode(); });
    t3.addEventListener("click", () => { cmpMode = "3d"; t3.setAttribute("aria-pressed", "true"); t2.setAttribute("aria-pressed", "false"); applyCmpMode(); });
    const close = el("button", { class: "chip", "aria-label": "Close comparison", text: "✕ close" });
    close.addEventListener("click", () => setComparison(null));
    const head = el("div", { class: "stage__cmp-head" }, [
      el("span", { class: "stage__cmp-title", text: `${c.a.props.name}  vs  ${c.b.props.name}` }),
      el("div", { class: "stage__cmp-toggle" }, [t2, t3]),
      close,
    ]);

    const grid = el("div", { class: "stage__cmp-grid" });
    for (const [label, side] of [["A", c.a], ["B", c.b]] as const) {
      const p = side.props;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
      svg.setAttribute("viewBox", "0 0 300 300");
      svg.setAttribute("class", "stage__cmp-svg");
      if (p.smiles) drawStructureSvg(p.smiles, svg, getState().theme === "light" ? "light" : "dark");
      const holder = el("div", { class: "stage__cmp-3d", style: "display:none" });
      const viz = el("div", { class: "stage__cmp-viz" }, [svg, holder]);
      cmpPanes.push({ viz, svg, holder, viewer: null, loaded: false, side });

      grid.append(el("div", { class: "stage__cmp-pane" }, [
        el("div", { class: "stage__cmp-tag", text: label }),
        el("b", { class: "stage__cmp-name", text: p.name }),
        el("span", { class: "stage__cmp-formula", text: `${p.formula} · CID ${p.cid}` }),
        viz,
        el("div", { class: "stage__cmp-props", html: cmpProps(p) }),
        side.description
          ? el("p", { class: "stage__cmp-desc", text: side.description.length > 260 ? side.description.slice(0, 257) + "…" : side.description })
          : el("p", { class: "stage__cmp-desc stage__cmp-desc--muted", text: "No PubChem description on file." }),
      ]));
    }

    const a = c.a.props, b = c.b.props;
    const delta = (x: number | null, y: number | null) => {
      if (x == null || y == null) return `<span class="d0">—</span>`;
      const dd = y - x;
      const cls = dd > 0 ? "dup" : dd < 0 ? "ddn" : "d0";
      const v = Number.isInteger(dd) ? dd : dd.toFixed(1);
      return `<span class="${cls}">${dd >= 0 ? "+" : ""}${v}</span>`;
    };
    const diff = el("div", { class: "stage__cmp-diff", html:
      `<span class="k">Δ&nbsp;B−A</span>` +
      `<span>MW ${delta(a.weight, b.weight)}</span>` +
      `<span>TPSA ${delta(a.tpsa, b.tpsa)}</span>` +
      `<span>logP ${delta(a.xlogp, b.xlogp)}</span>` +
      `<span>HBD ${delta(a.hbd, b.hbd)}</span>` +
      `<span>HBA ${delta(a.hba, b.hba)}</span>` +
      `<span>rot ${delta(a.rotatable, b.rotatable)}</span>`,
    });

    cmp.append(head, grid, diff);
    applyCmpMode();
  }

  function renderCmpView() {
    const c = getState().comparison;
    if (!c) { cmp.hidden = true; if (cmpKey) teardownCmp(); return; }
    cmp.hidden = false;
    const key = `${c.a.props.cid}|${c.b.props.cid}`;
    if (key !== cmpKey) buildCmpView(c);
  }

  function render() {
    const s = getState();
    const comparing = !!s.comparison;
    scene.style.visibility = comparing ? "hidden" : "";
    controls.hidden = comparing;
    props.hidden = comparing;
    hazard.hidden = hazard.hidden || comparing;
    if (comparing) recovery.hidden = true; else renderRecovery();
    stage.dataset.mode = s.stageMode;
    empty.hidden = comparing || s.stageMode !== "empty";
    t2d.setAttribute("aria-pressed", String(s.stageMode === "2d"));
    t3d.setAttribute("aria-pressed", String(s.stageMode === "3d"));
    t3d.toggleAttribute("disabled", !s.sdf3d);
    renderCmpView();
    if (comparing) {
      clear(title);
      if (s.theme !== lastTheme) {
        lastTheme = s.theme;
        for (const p of cmpPanes) if (p.side.props.smiles) {
          drawStructureSvg(p.side.props.smiles, p.svg, s.theme === "light" ? "light" : "dark");
        }
      }
      return;
    }

    clear(title);
    if (s.props) {
      title.append(
        el("b", { text: s.props.name.length > 32 ? s.props.name.slice(0, 31) + "…" : s.props.name }),
        el("span", { text: `${s.props.formula}${s.props.cid ? `  ·  CID ${s.props.cid}` : ""}` }),
      );
      draw2d(s.props);
    }
    if (s.sdf3d) void draw3d(s.sdf3d);
    if (s.theme !== lastTheme) {
      lastTheme = s.theme;
      if (lastSmiles) { lastSmiles = ""; if (s.props) draw2d(s.props); }
      applyLabels();
    }

    if (s.uses?.length) {
      uses.hidden = false;
      clear(uses);
      uses.append(el("span", { class: "stage__uses-k", text: "USES" }));
      for (const u of s.uses.slice(0, 6)) {
        uses.append(el("span", { class: "stage__uses-tag", text: u.length > 46 ? u.slice(0, 44) + "…" : u }));
      }
    } else {
      uses.hidden = true;
    }

    renderProps(s.props);
    renderHazard();
    renderCompare();
  }

  subscribe(render);
  render();
}
