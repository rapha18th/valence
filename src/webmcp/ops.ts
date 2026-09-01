// Core bench operations. Both the WebMCP tool layer (actor "agent") and any
// direct UI affordance (actor "person") call these, so the person and the
// agent always act on one canvas.

import {
  note, setSelection, setProps, setSdf3d, setHazard, setSimilars, setViability,
  setBio, setCandidates, resetCanvas, setStatus, activity, getState,
} from "../store/store.ts";
import { ep } from "../pubchem/endpoints.ts";
import {
  resolveCids, getProperties, getOneProperty, get3dSdf, getHazard,
  similaritySearch, getViability, getBio, greenScore, type ResolveBy,
} from "../pubchem/parse.ts";
import { BY_SYMBOL } from "../data/elements.ts";
import { GLOSSARY } from "../data/glossary.ts";
import type { Actor, MoleculeProps, CandidateScore, SimilarHit } from "../store/types.ts";
import { openRecipeCard } from "../ui/recipe-card.ts";

type Res = { ok: true; text: string; data?: unknown } | { ok: false; text: string };
const ok = (text: string, data?: unknown): Res => ({ ok: true, text, data });
const err = (text: string): Res => ({ ok: false, text });

const KNOWN_COMBOS: Record<string, number> = {
  "H,O": 962, "H,H,O": 962, "Cl,Na": 5234, "C,O": 280, "Cl,H": 313,
  "H,N": 222, "C,H": 297, "H,S": 402, "O,S": 1119, "C,N": 6857,
};

// ---------- selection ----------
export function selectElements(symbols: string[], actor: Actor): Res {
  const clean = symbols.map((s) => s.trim()).filter((s) => BY_SYMBOL[s]);
  const bad = symbols.filter((s) => !BY_SYMBOL[s.trim()]);
  if (!clean.length) return err(`No valid element symbols in [${symbols.join(", ")}].`);
  setSelection(clean);
  for (const s of clean) activity({ kind: "target", selector: `[data-sym="${s}"]`, label: `select ${s}` });
  note(actor, "Selected elements", clean.join(", ") + (bad.length ? ` (ignored ${bad.join(", ")})` : ""));
  return ok(`Selection: ${clean.join(", ")}. Stage armed.`);
}

// ---------- combine ----------
export async function combineSelection(
  stoich: Record<string, number> | undefined, actor: Actor,
): Promise<Res> {
  const sel = getState().selection;
  if (!sel.length) return err("Nothing selected. Call select_elements first.");
  setStatus("Resolving compound…");

  const counts = stoich && Object.keys(stoich).length
    ? stoich
    : Object.fromEntries(sel.map((s) => [s, 1]));
  const key = Object.entries(counts)
    .flatMap(([s, n]) => Array(n).fill(s)).sort().join(",");

  let cid: number | undefined = KNOWN_COMBOS[key];
  let formula = Object.entries(counts).map(([s, n]) => (n > 1 ? `${s}${n}` : s)).join("");

  if (!cid) {
    const cids = await resolveCids(formula, "formula");
    cid = cids.sort((a, b) => a - b)[0];
  }
  if (!cid) return err(`Could not resolve a compound for ${formula}. Try giving stoichiometry, e.g. { "H": 2, "O": 1 }.`);

  const props = await getOneProperty(cid);
  if (!props) return err(`Found CID ${cid} but no property record.`);
  formula = props.formula || formula;
  setProps(props);
  setSdf3d(null); setHazard(null); setSimilars([]); setCandidates(null); setViability(null); setBio(null);
  activity({ kind: "note", label: `combined → ${props.name}` });
  note(actor, "Combined selection", `${sel.join(" + ")} → ${props.name} (${formula})`,
    { label: `CID ${cid}`, url: ep.page(cid) });
  setStatus(`${props.name} on the stage.`);
  return ok(`${props.name} — formula ${formula}, SMILES ${props.smiles}, CID ${cid}.`, props);
}

// ---------- search ----------
export async function searchPubchem(query: string, by: ResolveBy, actor: Actor): Promise<Res> {
  setStatus(`Searching PubChem (${by})…`);
  const cids = await resolveCids(query, by);
  if (!cids.length) return err(`No PubChem match for "${query}" by ${by}.`);
  const props = await getProperties(cids.slice(0, 5));
  note(actor, "Searched PubChem", `${by}:"${query}" → ${cids.length} hit(s)`,
    { label: `CID ${cids[0]}`, url: ep.page(cids[0]) });
  if (props[0]) {
    setProps(props[0]); setSdf3d(null);
    setHazard(null); setSimilars([]); setCandidates(null); setViability(null); setBio(null);
  }
  const lines = props.map((p) => `${p.cid} ${p.name} (${p.formula})`).join("; ");
  return ok(`Top matches: ${lines || cids.slice(0, 5).join(", ")}.`, props);
}

// ---------- properties ----------
export async function fetchProperties(cid: number, actor: Actor): Promise<Res> {
  const p = await getOneProperty(cid);
  if (!p) return err(`No property record for CID ${cid}.`);
  setProps(p);
  note(actor, "Fetched properties", `${p.name}: MW ${p.weight}, TPSA ${p.tpsa}, logP ${p.xlogp}, HBD/HBA ${p.hbd}/${p.hba}`,
    { label: `CID ${cid}`, url: ep.page(cid) });
  return ok(`${p.name}: formula ${p.formula}, MW ${p.weight} g/mol, TPSA ${p.tpsa}, XLogP ${p.xlogp}, HBD ${p.hbd}, HBA ${p.hba}, rotatable bonds ${p.rotatable}.`, p);
}

// ---------- 3D ----------
export async function fetch3dConformer(cid: number, actor: Actor): Promise<Res> {
  setStatus("Fetching 3D conformer…");
  activity({ kind: "target", selector: ".stage", label: "load 3D" });
  const { sdf, is3d } = await get3dSdf(cid);
  if (!sdf) return err(`No structure record for CID ${cid}.`);
  setSdf3d(sdf);
  note(actor, is3d ? "Rendered 3D conformer" : "Rendered 2D structure (no 3D on file)",
    `CID ${cid}`, { label: "SDF", url: is3d ? ep.sdf3d(cid) : ep.sdf2d(cid) });
  setStatus(is3d ? "3D conformer on the stage." : "2D structure (no 3D conformer available).");
  return ok(is3d ? `3D ball-and-stick model rendered for CID ${cid}.` : `Only a 2D conformer is on file for CID ${cid}; rendered that.`);
}

// ---------- hazard ----------
export async function assessHazard(cid: number, actor: Actor): Promise<Res> {
  setStatus("Reading GHS hazard record…");
  activity({ kind: "target", selector: ".hazard, .stage", label: "assess hazard" });
  const h = await getHazard(cid);
  setHazard(h);
  const summary = h.severity === "unknown"
    ? "No GHS classification on file."
    : `${h.signal ?? "Unclassified"} · ${h.severity} · ${h.pictograms.join(" ") || "no pictograms"} · ${h.statements.slice(0, 3).map((s) => s.code).join(" ")}`;
  note(actor, "Assessed hazard profile", summary, { label: `GHS · CID ${cid}`, url: ep.page(cid) });
  setStatus(`Hazard: ${h.severity}.`);
  return ok(summary, h);
}

// ---------- similarity ----------
export async function findSimilar(
  smiles: string, threshold: number, limit: number, actor: Actor,
): Promise<Res> {
  setStatus("Running 2D similarity search…");
  const cids = await similaritySearch(smiles, threshold, Math.max(limit + 3, 8));
  const self = getState().props?.cid;
  const others = cids.filter((c) => c !== self).slice(0, limit);
  if (!others.length) return err("No similar compounds returned.");
  const props = await getProperties(others);
  const hits: SimilarHit[] = props.map((p) => {
    const base: SimilarHit = {
      cid: p.cid, name: p.name, formula: p.formula, smiles: p.smiles,
      weight: p.weight, tpsa: p.tpsa, xlogp: p.xlogp,
    };
    const g = greenScore(base);
    base.greenScore = g.score; base.greenNotes = g.notes;
    return base;
  });
  setSimilars(hits); setCandidates(null);
  note(actor, "Found similar compounds",
    hits.map((h) => `${h.name} (${h.formula})`).join("; "),
    { label: "similarity", url: ep.similarity2d(smiles, threshold, limit) });
  setStatus(`${hits.length} similar compounds.`);
  return ok(`Similar (Tanimoto ≥ ${threshold / 100}): ` + hits.map((h) => `${h.cid} ${h.name}`).join("; "), hits);
}

// ---------- viability ----------
export async function industrialViability(cid: number, actor: Actor): Promise<Res> {
  setStatus("Checking sourcing and patents…");
  const v = await getViability(cid);
  setViability(v);
  note(actor, "Industrial viability", v.verdict, { label: `CID ${cid}`, url: ep.page(cid) });
  setStatus("Viability assessed.");
  return ok(`Vendors: ${v.vendorCount ?? "unknown"}, patent references: ${v.patentCount ?? "unknown"}. ${v.verdict}`, v);
}

// ---------- bioactivity ----------
export async function bioactivityBridge(cid: number, actor: Actor): Promise<Res> {
  setStatus("Reading bioassay summary…");
  const b = await getBio(cid);
  setBio(b);
  const summary = `${b.activeAssays ?? 0} active assays; targets: ${b.targets.slice(0, 5).join(", ") || "none listed"}`;
  note(actor, "Bioactivity bridge", summary, { label: `CID ${cid}`, url: ep.page(cid) });
  return ok(summary + (b.pharmClass[0] ? ` — ${b.pharmClass[0]}` : ""), b);
}

// ---------- recipe card ----------
export function renderRecipeCard(actor: Actor): Res {
  if (!getState().props) return err("Nothing on the stage to export.");
  openRecipeCard();
  note(actor, "Rendered recipe card", getState().props!.name);
  return ok("Recipe card opened. It can be downloaded as a PNG.");
}

// ---------- canvas state ----------
export function getCanvasState(): Res {
  const s = getState();
  const snap = {
    selection: s.selection,
    stage: s.props && { cid: s.props.cid, name: s.props.name, formula: s.props.formula, smiles: s.props.smiles, mode: s.stageMode },
    properties: s.props,
    hazard: s.hazard && { severity: s.hazard.severity, signal: s.hazard.signal, pictograms: s.hazard.pictograms },
    similars: s.similars.map((h) => ({ cid: h.cid, name: h.name, greenScore: h.greenScore })),
    candidates: s.candidates,
    notebook: s.notebook.slice(0, 12).map((e) => ({ actor: e.actor, action: e.action, detail: e.detail, cite: e.citation?.url })),
  };
  return ok(JSON.stringify(snap, null, 2), snap);
}

export function resetCanvasOp(actor: Actor): Res {
  resetCanvas();
  note(actor, "Reset canvas", "cleared selection and stage");
  return ok("Canvas cleared.");
}

// ---------- substitute & compare ----------
const SUBS: Record<string, string> = { "-OH": "O", "-CH3": "C", "-F": "F", "-NH2": "N", "-COOH": "C(=O)O" };
export async function substituteAndCompare(baseSmiles: string, change: string, actor: Actor): Promise<Res> {
  const before = getState().props;
  let target = change;
  if (SUBS[change]) {
    // naive: append the group to the first carbon; good enough for a directional what-if
    target = baseSmiles.replace(/C/, `C(${SUBS[change]})`);
  }
  const cids = await resolveCids(target, "smiles");
  if (!cids.length) return err(`Could not resolve the modified structure (${target}).`);
  const after = await getOneProperty(cids[0]);
  if (!after) return err("No property record for the modified structure.");
  setProps(after); setSdf3d(null);
  const diff = (a: number | null, b: number | null) =>
    a === null || b === null ? "?" : (b - a >= 0 ? "+" : "") + (b - a).toFixed(2);
  const line = before
    ? `MW ${diff(before.weight, after.weight)}, TPSA ${diff(before.tpsa, after.tpsa)}, logP ${diff(before.xlogp, after.xlogp)}, HBD ${diff(before.hbd, after.hbd)}, HBA ${diff(before.hba, after.hba)}`
    : `${after.name}: MW ${after.weight}, TPSA ${after.tpsa}, logP ${after.xlogp}`;
  note(actor, "Substitute and compare", `${change}: ${line}`, { label: `CID ${cids[0]}`, url: ep.page(cids[0]) });
  return ok(`After ${change} → ${after.name}. Δ ${line}.`, after);
}

// ---------- explain (teach mode) ----------
export function explain(topic: string, actor: Actor): Res {
  const key = topic.toLowerCase().trim();
  const hit = GLOSSARY.find((g) => key.includes(g.term.toLowerCase()) || g.term.toLowerCase().includes(key))
    ?? GLOSSARY.find((g) => g.aliases?.some((a) => key.includes(a)));
  if (!hit) return err(`No glossary entry for "${topic}". Try: ${GLOSSARY.slice(0, 6).map((g) => g.term).join(", ")}.`);
  note(actor, `Explained: ${hit.term}`, hit.short);
  return ok(`${hit.term} — ${hit.short}${hit.more ? "\n\n" + hit.more : ""}`);
}

// ---------- build to constraints (the headline) ----------
interface Constraints {
  elements?: string[];      // whitelist of allowed element symbols
  period?: number;          // e.g. 2 => only period-2 elements
  nonToxic?: boolean;
  maxWeight?: number;
  maxLogP?: number;
}

export async function buildToConstraints(goal: string, raw: Constraints, actor: Actor): Promise<Res> {
  setStatus(`Agent: building — ${goal}`);
  const cons: Constraints = { ...raw };
  if (cons.period && !cons.elements) {
    cons.elements = Object.values(BY_SYMBOL)
      .filter((e) => e.period === cons.period && e.category !== "lanthanide" && e.category !== "actinide")
      .map((e) => e.symbol);
  }
  const allowed = new Set(cons.elements ?? []);
  // hydrogen is always implied in an organic backbone; "period-2 elements" is
  // shorthand for the second row plus the H that hangs off it.
  if (allowed.size) allowed.add("H");
  if (allowed.size) {
    for (const s of allowed) if (s !== "H") activity({ kind: "target", selector: `[data-sym="${s}"]`, label: `consider ${s}` });
    setSelection([...allowed].filter((s) => s !== "H").slice(0, 8));
  }

  // candidate pool: goal-driven seeds, scored against the constraints
  const seeds = candidateSeeds(goal);
  activity({ kind: "note", label: `searching ${seeds.length} candidates` });

  // resolve names -> CIDs, then one batched property call for the whole pool
  const pairs: { seed: string; cid: number }[] = [];
  for (const seed of seeds) {
    const cids = await resolveCids(seed, "name");
    if (cids.length) pairs.push({ seed, cid: cids[0] });
  }
  const props = await getProperties(pairs.map((p) => p.cid));
  const byCid = new Map(props.map((p) => [p.cid, p]));

  const scored: CandidateScore[] = [];
  for (const { cid } of pairs) {
    const p = byCid.get(cid);
    if (!p) continue;
    const s = scoreCandidate(p, cons);
    if (allowed.size && !elementsWithin(p.formula, allowed)) {
      s.pass = false;
      s.reasons.unshift(`uses elements outside the ${cons.period ? `period-${cons.period}` : "allowed"} set`);
      s.score = Math.min(s.score, 30);
    }
    scored.push(s);
  }
  if (!scored.length) return err("No candidates resolved for that goal.");

  // check the GHS record for every candidate, so a "non-toxic" goal actually
  // rewards the safer molecule rather than whatever sorted first.
  const wantSafe = cons.nonToxic || /non[\s-]?toxic|green|safe/.test(goal.toLowerCase());
  activity({ kind: "note", label: "checking hazard on every candidate" });
  const hazards = new Map<number, Awaited<ReturnType<typeof getHazard>>>();
  for (const c of scored) {
    const h = await getHazard(c.cid);
    hazards.set(c.cid, h);
    const penalty =
      h.severity === "severe" ? 45 : h.severity === "high" ? 30 :
      h.severity === "moderate" ? 15 : h.severity === "low" ? 6 : 0;
    if (penalty && wantSafe) {
      c.score = Math.max(5, c.score - penalty);
      c.reasons.push(`GHS ${h.signal ?? h.severity} (−${penalty})`);
      if (h.severity === "severe") c.pass = false;
    } else if (h.severity !== "unknown" && h.severity !== "none") {
      c.reasons.push(`GHS ${h.signal ?? h.severity}`);
    } else if (h.severity === "none" || (h.severity === "unknown" && wantSafe)) {
      c.score += 4;
      c.reasons.push(h.severity === "none" ? "low GHS concern" : "no GHS red flags");
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);
  setCandidates(top);
  setSimilars([]);

  // put the winner on the stage
  const winner = top.find((c) => c.pass) ?? top[0];
  const wp = byCid.get(winner.cid) ?? await getOneProperty(winner.cid);
  if (wp) {
    setProps(wp);
    activity({ kind: "target", selector: ".stage", label: `stage ${wp.name}` });
    const { sdf } = await get3dSdf(wp.cid);
    if (sdf) setSdf3d(sdf);
    setHazard(hazards.get(wp.cid) ?? await getHazard(wp.cid));
  }

  for (const c of top) {
    note(actor, `Candidate: ${c.name}`, `score ${c.score}/100 — ${c.reasons.join("; ")}`,
      { label: `CID ${c.cid}`, url: ep.page(c.cid) });
  }
  activity({ kind: "done", label: `Agent: ${winner.name} scored ${winner.score}/100.` });
  setStatus(`Best fit: ${winner.name} (${winner.score}/100).`);
  return ok(
    `Ranked candidates for "${goal}":\n` +
    top.map((c) => `  ${c.pass ? "✓" : "✗"} ${c.name} (${c.formula}) — ${c.score}/100: ${c.reasons.join("; ")}`).join("\n"),
    top,
  );
}

function candidateSeeds(goal: string): string[] {
  const g = goal.toLowerCase();
  if (/polymer|precursor|monomer/.test(g)) {
    return ["lactic acid", "glycolic acid", "ethylene glycol", "1,3-propanediol", "succinic acid", "ethylene", "acrylic acid", "oxalic acid"];
  }
  if (/solvent/.test(g)) {
    return ["ethanol", "ethyl acetate", "acetone", "2-methyltetrahydrofuran", "dimethyl carbonate", "propylene carbonate", "water", "cyclopentyl methyl ether"];
  }
  if (/surfactant|detergent/.test(g)) {
    return ["sodium lauryl sulfate", "decyl glucoside", "cocamidopropyl betaine", "sorbitan monolaurate"];
  }
  return ["ethanol", "acetic acid", "glycerol", "urea", "citric acid", "glucose"];
}

function elementsWithin(formula: string, allowed: Set<string>): boolean {
  const syms = formula.match(/[A-Z][a-z]?/g) ?? [];
  return syms.every((s) => allowed.has(s));
}

function scoreCandidate(p: MoleculeProps, c: Constraints): CandidateScore {
  let score = 70;
  const reasons: string[] = [];
  let pass = true;

  if (c.maxWeight && p.weight !== null) {
    if (p.weight <= c.maxWeight) { score += 8; reasons.push(`MW ${Math.round(p.weight)} within limit`); }
    else { score -= 20; pass = false; reasons.push(`MW ${Math.round(p.weight)} over ${c.maxWeight}`); }
  }
  if (c.maxLogP && p.xlogp !== null) {
    if (p.xlogp <= c.maxLogP) { score += 6; reasons.push(`logP ${p.xlogp} ok`); }
    else { score -= 12; reasons.push(`logP ${p.xlogp} high`); }
  }
  // two or more hydrogen-bonding handles make a workable precursor
  if (p.hbd !== null && p.hba !== null) {
    if (p.hbd >= 1 && p.hba >= 2) { score += 8; reasons.push(`${p.hbd} donor / ${p.hba} acceptor handles`); }
    else if (p.hbd + p.hba >= 2) { score += 4; reasons.push("some reactive handles"); }
    else { score -= 6; reasons.push("few reactive handles"); }
  }
  if (/O/.test(p.formula) && /N/.test(p.formula)) { score += 3; reasons.push("O and N functionality"); }
  else if (/O/.test(p.formula)) { score += 4; reasons.push("oxygen functionality"); }
  // low logP tracks with water processability, a plus for a green precursor
  if (p.xlogp !== null) {
    if (p.xlogp < 0) score += 5;
    else if (p.xlogp > 1.5) { score -= 6; reasons.push(`logP ${p.xlogp} (oily)`); }
  }
  if (p.rotatable !== null && p.rotatable <= 3) { score += 3; reasons.push("compact backbone"); }
  if (p.complexity !== null && p.complexity < 120) score += 2;

  reasons.push(`TPSA ${p.tpsa ?? "?"}, logP ${p.xlogp ?? "?"}`);
  return { cid: p.cid, name: p.name, formula: p.formula, smiles: p.smiles, score: Math.max(0, Math.min(100, score)), reasons, pass };
}

// ---------- greener alternatives ----------
export async function proposeGreener(cidOrSmiles: string, actor: Actor): Promise<Res> {
  setStatus("Agent: searching greener alternatives…");
  let smiles = cidOrSmiles;
  let baseCid: number | undefined;
  if (/^\d+$/.test(cidOrSmiles)) {
    baseCid = parseInt(cidOrSmiles, 10);
    const p = await getOneProperty(baseCid);
    if (!p) return err(`No record for CID ${cidOrSmiles}.`);
    smiles = p.smiles;
    setProps(p);
  } else {
    const cids = await resolveCids(cidOrSmiles, "smiles");
    baseCid = cids[0];
  }
  const cids = await similaritySearch(smiles, 80, 15);
  const others = cids.filter((c) => c !== baseCid).slice(0, 6);
  const props = await getProperties(others);
  const hits: SimilarHit[] = props.map((p) => {
    const h: SimilarHit = { cid: p.cid, name: p.name, formula: p.formula, smiles: p.smiles, weight: p.weight, tpsa: p.tpsa, xlogp: p.xlogp };
    const g = greenScore(h); h.greenScore = g.score; h.greenNotes = g.notes;
    return h;
  }).sort((a, b) => (b.greenScore ?? 0) - (a.greenScore ?? 0)).slice(0, 3);
  setSimilars(hits); setCandidates(null);
  for (const h of hits) {
    note(actor, `Greener option: ${h.name}`, `green score ${h.greenScore}/100 — ${(h.greenNotes ?? []).join("; ") || "no red flags"}`,
      { label: `CID ${h.cid}`, url: ep.page(h.cid) });
  }
  activity({ kind: "done", label: `Agent: ${hits[0]?.name ?? "no"} alternative leads.` });
  setStatus("Greener alternatives ranked.");
  return ok("Greener alternatives (similar core, scored on hazard-linked properties): " +
    hits.map((h) => `${h.cid} ${h.name} ${h.greenScore}/100`).join("; "), hits);
}
