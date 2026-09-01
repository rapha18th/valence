import { el, clear, fmt } from "../lib/dom.ts";
import { getState, subscribe, setStage } from "../store/store.ts";
import { sfx } from "../lib/sound.ts";
import { drawStructureSvg } from "../lib/structure2d.ts";
import type { MoleculeProps } from "../store/types.ts";

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
  t2d.addEventListener("click", () => setStage("2d"));
  t3d.addEventListener("click", () => { if (getState().sdf3d) setStage("3d"); });
  tSpin.addEventListener("click", () => toggleSpin(tSpin));
  controls.append(t2d, t3d, tSpin);

  const hazard = el("div", { class: "hazard", hidden: true });
  const compare = el("div", { class: "compare", hidden: true });
  const props = el("div", { class: "props" });

  stage.append(scene, title, controls, hazard, compare, props);
  root.append(stage);

  let viewer: any = null;
  let lastSmiles = "";
  let lastSdf = "";

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

  function draw2d(p: MoleculeProps) {
    if (!p.smiles || p.smiles === lastSmiles) return;
    lastSmiles = p.smiles;
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
  }

  function renderHazard() {
    const s = getState();
    const h = s.hazard;
    if (!h || !s.props) { hazard.hidden = true; return; }
    hazard.hidden = false;
    hazard.dataset.sev = h.severity;
    clear(hazard);
    hazard.append(
      el("div", { class: "hazard__row" }, [
        el("span", { class: "hazard__sig", text: h.signal ?? (h.severity === "none" ? "Low concern" : "Unclassified") }),
      ]),
      el("div", { class: "hazard__pics" },
        h.pictograms.length
          ? h.pictograms.map((p) => el("span", { class: "hazard__pic", title: p, text: p.replace("GHS", "") }))
          : [el("span", { class: "hazard__stmts", text: h.severity === "unknown" ? "no GHS record" : "no pictograms" })],
      ),
      el("div", { class: "hazard__stmts", text: h.statements.slice(0, 3).map((s) => `${s.code} ${s.text}`).join("  ·  ") }),
    );
  }

  function renderCompare() {
    const { similars, candidates } = getState();
    const list = candidates?.length
      ? candidates.map((c) => ({ name: c.name, formula: c.formula, score: c.score, pass: c.pass, notes: c.reasons }))
      : similars.map((s) => ({ name: s.name, formula: s.formula, score: s.greenScore ?? 0, pass: true, notes: s.greenNotes ?? [] }));
    if (!list.length) { compare.hidden = true; return; }
    compare.hidden = false;
    clear(compare);
    for (const it of list.slice(0, 4)) {
      compare.append(el("div", { class: "compare__card", "data-pass": String(it.pass) }, [
        el("b", { text: it.name.length > 22 ? it.name.slice(0, 21) + "…" : it.name }),
        el("span", { class: "f", text: it.formula }),
        el("div", { class: "compare__score" }, [el("i", { style: `width:${Math.round(it.score)}%` })]),
        el("div", { class: "hazard__stmts", text: (it.notes[0] ?? "").slice(0, 60) }),
      ]));
    }
  }

  function render() {
    const s = getState();
    stage.dataset.mode = s.stageMode;
    empty.hidden = s.stageMode !== "empty";
    t2d.setAttribute("aria-pressed", String(s.stageMode === "2d"));
    t3d.setAttribute("aria-pressed", String(s.stageMode === "3d"));
    t3d.toggleAttribute("disabled", !s.sdf3d);

    clear(title);
    if (s.props) {
      title.append(
        el("b", { text: s.props.name.length > 32 ? s.props.name.slice(0, 31) + "…" : s.props.name }),
        el("span", { text: `${s.props.formula}${s.props.cid ? `  ·  CID ${s.props.cid}` : ""}` }),
      );
      draw2d(s.props);
    }
    if (s.sdf3d) void draw3d(s.sdf3d);
    renderProps(s.props);
    renderHazard();
    renderCompare();
  }

  subscribe(render);
  render();
}
