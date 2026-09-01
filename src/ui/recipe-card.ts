import { el, fmt } from "../lib/dom.ts";
import { getState } from "../store/store.ts";
import { structureToPng } from "../lib/structure2d.ts";
import { toast } from "./toasts.ts";

export function openRecipeCard() {
  const s = getState();
  if (!s.props) { toast("Nothing on the stage to export yet."); return; }
  const p = s.props;
  const h = s.hazard;

  const overlay = el("div", { class: "modal" });
  const card = el("div", { class: "card" }, [
    el("div", { class: "card__head" }, [
      el("b", { text: p.name }),
      el("span", { text: `CID ${p.cid}` }),
    ]),
    el("div", { class: "card__body" }, [
      el("div", { class: "card__grid" }, [
        prop("formula", p.formula),
        prop("weight", `${fmt(p.weight, 2)} g/mol`),
        prop("TPSA", `${fmt(p.tpsa, 1)} Å²`),
        prop("logP", fmt(p.xlogp, 2)),
        prop("H-bond D / A", `${fmt(p.hbd, 0)} / ${fmt(p.hba, 0)}`),
        prop("rot. bonds", fmt(p.rotatable, 0)),
      ]),
      el("div", {
        style: "font-family:var(--font-mono);font-size:var(--step--1);color:var(--ink-300)",
        text: h
          ? `Hazard: ${h.signal ?? h.severity}${h.pictograms.length ? " · " + h.pictograms.join(" ") : ""}`
          : "Hazard: not assessed",
      }),
      el("div", {
        style: "font-family:var(--font-mono);font-size:10px;color:var(--ink-500);word-break:break-all",
        text: `SMILES ${p.smiles}`,
      }),
    ]),
    el("div", { class: "card__foot" }),
  ]);

  const dl = el("button", { class: "btn btn--primary", text: "Download PNG" });
  const close = el("button", { class: "btn", text: "Close" });
  dl.addEventListener("click", () => void downloadCard(p, h));
  close.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  card.querySelector(".card__foot")!.append(close, dl);

  overlay.append(card);
  document.body.append(overlay);
}

function prop(k: string, v: string) {
  return el("div", {}, [
    el("div", { class: "props__k", text: k }),
    el("div", { class: "props__v", text: v }),
  ]);
}

async function downloadCard(
  p: import("../store/types.ts").MoleculeProps,
  h: import("../store/types.ts").HazardProfile | null,
) {
  const W = 1000, H = 1300, s = 2;
  const c = document.createElement("canvas");
  c.width = W * s; c.height = H * s;
  const ctx = c.getContext("2d")!;
  ctx.scale(s, s);

  ctx.fillStyle = "#16181b";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#5fb2c9";
  ctx.fillRect(0, 0, 6, H);

  ctx.fillStyle = "#8b877e";
  ctx.font = "600 14px 'JetBrains Mono', monospace";
  ctx.fillText("VALENCE · RECIPE CARD", 44, 60);

  ctx.fillStyle = "#f2f0ec";
  ctx.font = "600 44px Inter, sans-serif";
  wrap(ctx, p.name, 44, 116, W - 88, 48);

  ctx.fillStyle = "#c4c0b8";
  ctx.font = "18px 'JetBrains Mono', monospace";
  ctx.fillText(`${p.formula}   ·   CID ${p.cid}`, 44, 176);

  // structure
  try {
    const png = await structureToPng(p.smiles, 520, 360, "dark");
    if (png) {
      await new Promise<void>((res) => {
        const im = new Image();
        im.onload = () => { ctx.drawImage(im, (W - 520) / 2, 210, 520, 360); res(); };
        im.onerror = () => res();
        im.src = png;
      });
    }
  } catch { /* ignore */ }

  // properties
  const rows: [string, string][] = [
    ["Molecular weight", `${fmt(p.weight, 2)} g/mol`],
    ["Topological polar surface area", `${fmt(p.tpsa, 1)} Å²`],
    ["logP (XLogP)", fmt(p.xlogp, 2)],
    ["H-bond donors / acceptors", `${fmt(p.hbd, 0)} / ${fmt(p.hba, 0)}`],
    ["Rotatable bonds", fmt(p.rotatable, 0)],
    ["Complexity", fmt(p.complexity, 0)],
  ];
  let y = 640;
  ctx.font = "16px Inter, sans-serif";
  for (const [k, v] of rows) {
    ctx.fillStyle = "#8b877e"; ctx.fillText(k, 44, y);
    ctx.fillStyle = "#f2f0ec"; ctx.font = "16px 'JetBrains Mono', monospace";
    ctx.textAlign = "right"; ctx.fillText(v, W - 44, y); ctx.textAlign = "left";
    ctx.font = "16px Inter, sans-serif";
    ctx.strokeStyle = "#363c45"; ctx.beginPath(); ctx.moveTo(44, y + 14); ctx.lineTo(W - 44, y + 14); ctx.stroke();
    y += 46;
  }

  // hazard
  y += 20;
  ctx.fillStyle = "#8b877e"; ctx.fillText("HAZARD (GHS)", 44, y); y += 28;
  ctx.fillStyle = h ? sevColor(h.severity) : "#8b877e";
  ctx.font = "600 20px 'JetBrains Mono', monospace";
  ctx.fillText(h ? (h.signal ?? h.severity.toUpperCase()) : "NOT ASSESSED", 44, y);
  if (h?.pictograms.length) {
    ctx.font = "14px 'JetBrains Mono', monospace"; ctx.fillStyle = "#c4c0b8";
    ctx.fillText(h.pictograms.join("  "), 44, y + 26);
  }

  ctx.fillStyle = "#5b5852";
  ctx.font = "12px 'JetBrains Mono', monospace";
  ctx.fillText(`Source: pubchem.ncbi.nlm.nih.gov/compound/${p.cid}`, 44, H - 40);

  const a = document.createElement("a");
  a.href = c.toDataURL("image/png");
  a.download = `valence-${p.name.replace(/\W+/g, "-").toLowerCase()}.png`;
  a.click();
  toast("Recipe card saved.");
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; }
    else line = test;
  }
  ctx.fillText(line, x, y);
}

function sevColor(sev: string): string {
  return sev === "severe" ? "#b23b2e"
    : sev === "high" ? "#c76a2e"
    : sev === "moderate" || sev === "low" ? "#d9a441"
    : sev === "none" ? "#6faf7a" : "#8b877e";
}
