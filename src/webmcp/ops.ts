// Core bench operations. Both the WebMCP tool layer (actor "agent") and any
// direct UI affordance (actor "person") call these, so the person and the
// agent always act on one canvas.

import {
  note, setSelection, setProps, setSdf3d, setHazard, setSimilars, setViability,
  setBio, setUses, setComparison, setCandidates, resetCanvas, setStatus, activity, getState,
} from "../store/store.ts";
import { ep } from "../pubchem/endpoints.ts";
import {
  resolveCids, getProperties, getOneProperty, get3dSdf, getHazard,
  similaritySearch, getViability, getBio, getUses, getDescription, getSynonyms,
  greenScore, type ResolveBy,
} from "../pubchem/parse.ts";
import { pubchemHealthy, pubchemStatusNote } from "../pubchem/client.ts";
import { fallbackFind } from "../data/fallback.ts";
import { BY_SYMBOL } from "../data/elements.ts";
import { GLOSSARY } from "../data/glossary.ts";
import { predictBond, bondVerdictGlyph } from "../chem/bonding.ts";
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

// ---------- bond prediction (no network) ----------
export function predictBondOp(symbols: string[] | undefined, actor: Actor): Res {
  const syms = symbols?.length ? symbols : getState().selection;
  const p = predictBond(syms);
  note(actor, `Bond check: ${p.symbols.join(" + ") || "—"}`,
    `${bondVerdictGlyph(p.verdict)} ${p.bondType} — ${p.why}`);
  return ok(
    `${bondVerdictGlyph(p.verdict)} ${p.verdict.toUpperCase()} (${p.bondType})` +
    (p.formula ? `, likely ${p.formula}` : "") +
    (p.enDiff != null ? `, electronegativity gap ${p.enDiff.toFixed(1)}` : "") +
    `.\n${p.why}` + (p.note ? `\nNote: ${p.note}` : ""),
    p,
  );
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
  if (!cid) {
    // no compound: explain why, using the offline bonding check
    const p = predictBond(sel);
    if (p.verdict === "no-bond") {
      setStatus(`${sel.join(" + ")} do not bond.`);
      note(actor, `Combined selection: ${sel.join(" + ")}`, `No compound. ${p.why}`);
      return ok(`${bondVerdictGlyph("no-bond")} These elements do not form a compound. ${p.why}`);
    }
    if (p.verdict === "alloy") {
      return ok(`${bondVerdictGlyph("alloy")} ${p.why} There is no single molecular compound to place on the stage.`);
    }
    const hint = pubchemHealthy()
      ? `PubChem has no entry for the formula ${formula}. Try giving explicit stoichiometry, e.g. { "H": 2, "O": 1 }, or a known name.`
      : `${pubchemStatusNote()} Could not resolve ${formula} and it is not in the bundled set. Retry in a moment.`;
    return err(hint);
  }

  const props = await getOneProperty(cid);
  if (!props) {
    return err(pubchemHealthy()
      ? `Found CID ${cid} but PubChem returned no property record.`
      : `${pubchemStatusNote()} Found CID ${cid} but could not fetch its properties.`);
  }
  formula = props.formula || formula;
  setProps(props);
  setSdf3d(null); setHazard(null); setSimilars([]); setCandidates(null); setViability(null); setBio(null); setUses(null);
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
  if (!cids.length) {
    return err(pubchemHealthy()
      ? `PubChem has no ${by} match for "${query}". Try a different spelling, a formula (by: "formula"), or a SMILES.`
      : `${pubchemStatusNote()} Could not look up "${query}", and it is not in the bundled set. Retry in a moment.`);
  }
  const props = await getProperties(cids.slice(0, 5));
  note(actor, "Searched PubChem", `${by}:"${query}" → ${cids.length} hit(s)`,
    { label: `CID ${cids[0]}`, url: ep.page(cids[0]) });
  if (props[0]) {
    setProps(props[0]); setSdf3d(null);
    setHazard(null); setSimilars([]); setCandidates(null); setViability(null); setBio(null); setUses(null);
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
  const { sdf, is3d, approx } = await get3dSdf(cid);
  if (!sdf) {
    const why = pubchemHealthy()
      ? `PubChem has no structure record for CID ${cid}.`
      : `${pubchemStatusNote()} No cached or bundled geometry for CID ${cid}. Try again in a moment.`;
    return err(why);
  }
  setSdf3d(sdf);
  const label = approx ? "Rendered approximate 3D geometry (bundled)"
    : is3d ? "Rendered 3D conformer" : "Rendered 2D structure (no 3D on file)";
  note(actor, label, `CID ${cid}`,
    approx ? undefined : { label: "SDF", url: is3d ? ep.sdf3d(cid) : ep.sdf2d(cid) });
  setStatus(approx ? "Approximate geometry on the stage (PubChem 3D unavailable)."
    : is3d ? "3D conformer on the stage." : "2D structure (no 3D conformer available).");
  return ok(approx
    ? `PubChem's 3D conformer was unavailable; rendered a textbook geometry for CID ${cid} instead.`
    : is3d ? `3D ball-and-stick model rendered for CID ${cid}.`
    : `Only a 2D conformer is on file for CID ${cid}; rendered that.`);
}

// ---------- hazard ----------
export async function assessHazard(cid: number, actor: Actor): Promise<Res> {
  setStatus("Reading GHS hazard record…");
  activity({ kind: "target", selector: ".hazard, .stage", label: "assess hazard" });
  const h = await getHazard(cid);
  if (h.severity === "unknown" && !pubchemHealthy()) {
    return err(`${pubchemStatusNote()} The GHS record is a live PubChem PUG View call. Retry in a moment.`);
  }
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
  if (!others.length) {
    return err(pubchemHealthy()
      ? `No compounds within Tanimoto ${threshold / 100} of ${smiles}. Lower the threshold (try 80) or simplify the SMILES.`
      : `${pubchemStatusNote()} Similarity search is a live PubChem call and has no offline fallback. Retry in a moment.`);
  }
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
  if (v.vendorCount === null && v.patentCount === null && !pubchemHealthy()) {
    return err(`${pubchemStatusNote()} Sourcing and patent counts come from live PubChem PUG View. Retry in a moment.`);
  }
  setViability(v);
  note(actor, "Industrial viability", v.verdict, { label: `CID ${cid}`, url: ep.page(cid) });
  setStatus("Viability assessed.");
  return ok(`Vendors: ${v.vendorCount ?? "unknown"}, patent references: ${v.patentCount ?? "unknown"}. ${v.verdict}`, v);
}

// ---------- resolve a free-form query to props ----------
async function resolveQuery(q: string): Promise<MoleculeProps | null> {
  const t = q.trim();
  if (/^\d+$/.test(t)) return getOneProperty(parseInt(t, 10));
  const looksSmiles = /[=#()\[\]]/.test(t) && !/\s/.test(t);
  const by: ResolveBy = looksSmiles ? "smiles" : "name";
  let cids = await resolveCids(t, by);
  if (!cids.length && by === "name") cids = await resolveCids(t, "formula");
  if (!cids.length) return null;
  return getOneProperty(cids[0]);
}

// ---------- side-by-side comparison ----------
export async function compareCompounds(aQ: string, bQ: string, actor: Actor): Promise<Res> {
  setStatus(`Comparing ${aQ} vs ${bQ}…`);
  activity({ kind: "target", selector: ".stage", label: `compare ${aQ} vs ${bQ}` });
  const [pa, pb] = await Promise.all([resolveQuery(aQ), resolveQuery(bQ)]);
  if (!pa) return err(`Could not resolve "${aQ}".` + (pubchemHealthy() ? "" : " " + pubchemStatusNote()));
  if (!pb) return err(`Could not resolve "${bQ}".` + (pubchemHealthy() ? "" : " " + pubchemStatusNote()));
  if (pa.cid === pb.cid) return err(`"${aQ}" and "${bQ}" are the same compound (CID ${pa.cid}).`);

  const [da, db] = await Promise.all([getDescription(pa.cid), getDescription(pb.cid)]);
  setComparison({
    a: { props: pa, description: da?.text ?? null },
    b: { props: pb, description: db?.text ?? null },
  });
  setSdf3d(null); setCandidates(null); setSimilars([]);

  const d = (x: number | null, y: number | null) => {
    if (x == null || y == null) return "?";
    const delta = y - x;
    return (delta >= 0 ? "+" : "") + (Number.isInteger(delta) ? String(delta) : delta.toFixed(1));
  };
  const diff =
    `Δ (B−A): MW ${d(pa.weight, pb.weight)}, TPSA ${d(pa.tpsa, pb.tpsa)}, ` +
    `logP ${d(pa.xlogp, pb.xlogp)}, HBD ${d(pa.hbd, pb.hbd)}, HBA ${d(pa.hba, pb.hba)}, ` +
    `rot.bonds ${d(pa.rotatable, pb.rotatable)}`;
  note(actor, `Compared: ${pa.name} vs ${pb.name}`, diff,
    { label: `CID ${pa.cid} / ${pb.cid}`, url: ep.page(pa.cid) });
  setStatus(`${pa.name} vs ${pb.name}.`);
  return ok(
    `A ${pa.name} (${pa.formula}, CID ${pa.cid}) — MW ${pa.weight}, TPSA ${pa.tpsa}, logP ${pa.xlogp}, HBD/HBA ${pa.hbd}/${pa.hba}.\n` +
    `B ${pb.name} (${pb.formula}, CID ${pb.cid}) — MW ${pb.weight}, TPSA ${pb.tpsa}, logP ${pb.xlogp}, HBD/HBA ${pb.hbd}/${pb.hba}.\n` +
    diff,
    { a: pa, b: pb },
  );
}

export function closeComparison(actor: Actor): Res {
  setComparison(null);
  note(actor, "Closed comparison", "back to single view");
  return ok("Comparison closed.");
}

// ---------- description (beginner-friendly summary) ----------
export async function describeCompound(cid: number, actor: Actor): Promise<Res> {
  setStatus("Reading PubChem description…");
  const [d, syn] = await Promise.all([getDescription(cid), getSynonyms(cid)]);
  if (!d) {
    return pubchemHealthy()
      ? ok(`PubChem has no written description for CID ${cid}.${syn.length ? " Also known as: " + syn.slice(0, 6).join(", ") + "." : ""}`)
      : err(`${pubchemStatusNote()} Descriptions come from live PubChem. Retry in a moment.`);
  }
  note(actor, "Compound description", d.text.length > 200 ? d.text.slice(0, 197) + "…" : d.text,
    { label: d.source, url: ep.page(cid) });
  return ok(`${d.text}\n\n(Source: ${d.source}${syn.length ? "; also known as " + syn.slice(0, 6).join(", ") : ""}.)`);
}

// ---------- industrial / consumer uses ----------
export async function industrialUses(cid: number, actor: Actor): Promise<Res> {
  setStatus("Reading PubChem Uses annotations…");
  const uses = await getUses(cid);
  setUses(uses.length ? uses : null);
  if (!uses.length) {
    if (!pubchemHealthy()) {
      return err(`${pubchemStatusNote()} The Uses annotations come from live PubChem PUG View. Retry in a moment.`);
    }
    note(actor, "Industrial uses", "PubChem has no Uses annotations for this compound.",
      { label: `CID ${cid}`, url: ep.page(cid) });
    return ok(`PubChem has no Uses annotations for CID ${cid}. Common for very simple or very new compounds. Try a related, better-studied analogue.`);
  }
  note(actor, "Industrial uses", uses.slice(0, 4).join(" · "),
    { label: `CID ${cid}`, url: ep.page(cid) });
  setStatus(`${uses.length} documented uses.`);
  return ok("Documented uses: " + uses.join("; "), uses);
}

// ---------- bioactivity ----------
export async function bioactivityBridge(cid: number, actor: Actor): Promise<Res> {
  setStatus("Reading bioassay summary…");
  const b = await getBio(cid);
  if (b.activeAssays === null && !b.targets.length && !pubchemHealthy()) {
    return err(`${pubchemStatusNote()} Bioassay data is a live PubChem call. Retry in a moment.`);
  }
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
    uses: s.uses,
    viability: s.viability,
    comparison: s.comparison && {
      a: { cid: s.comparison.a.props.cid, name: s.comparison.a.props.name, formula: s.comparison.a.props.formula },
      b: { cid: s.comparison.b.props.cid, name: s.comparison.b.props.name, formula: s.comparison.b.props.formula },
    },
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
const SUBS: Record<string, string> = {
  "-oh": "O", "-ch3": "C", "-f": "F", "-cl": "Cl", "-nh2": "N", "-cooh": "C(=O)O",
};
function applySub(base: string, group: string): string {
  // add the group as a branch on the first carbon that has a free valence,
  // i.e. the first "C" not already followed by an open bracket
  const m = /C(?![(])/.exec(base);
  if (!m) return `${base}${group}`;
  const i = m.index + 1;
  return `${base.slice(0, i)}(${group})${base.slice(i)}`;
}
export async function substituteAndCompare(baseSmiles: string, change: string, actor: Actor): Promise<Res> {
  const before = getState().props;
  const key = change.toLowerCase().replace(/\s+/g, "");
  const group = SUBS[key];
  const target = group ? applySub(baseSmiles, group) : change;

  const cids = await resolveCids(target, "smiles");
  if (!cids.length) {
    const why = pubchemHealthy()
      ? `PubChem does not recognise the modified structure ${target}. It may be an unstable or unregistered species. Try a different substituent or a full target SMILES.`
      : `${pubchemStatusNote()} Could not validate ${target}. Retry in a moment.`;
    return err(`${why} (base ${baseSmiles} + ${change})`);
  }
  const after = await getOneProperty(cids[0]);
  if (!after) return err(`Resolved to CID ${cids[0]} but no property record is available right now.`);
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

  // resolve names -> CIDs. Check the bundled set first so a PubChem outage
  // never turns this into an 8-way retry storm.
  const budget = Date.now() + 10000;
  const pairs: { seed: string; cid: number }[] = [];
  for (const seed of seeds) {
    const fb = fallbackFind(seed);
    if (fb) { pairs.push({ seed, cid: fb.cid }); continue; }
    if (Date.now() > budget) break;
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
  // rewards the safer molecule rather than whatever sorted first. Bounded by a
  // ~14s budget so the tool always returns a ranking instead of hanging.
  const deadline = Date.now() + 14000;
  const wantSafe = cons.nonToxic || /non[\s-]?toxic|green|safe/.test(goal.toLowerCase());
  activity({ kind: "note", label: "checking hazard on every candidate" });
  const hazards = new Map<number, Awaited<ReturnType<typeof getHazard>>>();
  let hazardChecked = 0;
  for (const c of scored) {
    if (Date.now() > deadline) break;
    const h = await getHazard(c.cid);
    hazardChecked++;
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
  const partial = hazardChecked < scored.length;
  activity({ kind: "done", label: `Agent: ${winner.name} scored ${winner.score}/100.` });
  setStatus(`Best fit: ${winner.name} (${winner.score}/100).` + (partial ? " (partial: time budget hit)" : ""));
  return ok(
    `Ranked candidates for "${goal}"` +
    (partial ? ` (hazard-checked ${hazardChecked}/${scored.length} before the time budget):` : ":") + "\n" +
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
