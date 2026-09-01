// Core bench operations. Both the WebMCP tool layer (actor "agent") and any
// direct UI affordance (actor "person") call these, so the person and the
// agent always act on one canvas.

import {
  note, setSelection, setProps, setSdf3d, setHazard, setSimilars, setViability,
  setBio, setUses, setComparison, setCandidates, resetCanvas, setStatus, activity, getState,
  setBuild, setRecovery,
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
import type {
  Actor, MoleculeProps, CandidateScore, SimilarHit, HazardProfile, BuildJob,
  BuildConstraints, ScoreTerm, RecoveryAction,
} from "../store/types.ts";
import { openRecipeCard } from "../ui/recipe-card.ts";

type Res = { ok: true; text: string; data?: unknown } | { ok: false; text: string };
const ok = (text: string, data?: unknown): Res => ({ ok: true, text, data });
const err = (text: string): Res => ({ ok: false, text });

// ---- evidence-based hazard phrasing ----
// Never emit a bare absolute ("safe", "non-toxic", "toxic"). State what the
// GHS record supports, and be explicit when it was not checked.
export function hazardLabel(h: HazardProfile | null | undefined): string {
  if (!h) return "hazard not assessed";
  switch (h.basis) {
    case "primary-classification": {
      const codes = h.statements.slice(0, 3).map((s) => s.code).join(" ");
      return `GHS ${h.signal ?? "classified"}${codes ? `: ${codes}` : ""}`;
    }
    case "no-ghs-record":
      return "no GHS classification on file (PubChem checked)";
    case "reference-safe":
      return "no GHS classification expected (reference compound)";
    case "source-unavailable":
    default:
      return "GHS not checked — PubChem unavailable";
  }
}

// a short "where from / when" tag for a claim
function provTag(p: { source: string; fetchedAt: number | null; detail?: string } | undefined): string {
  if (!p) return "";
  const when = p.fetchedAt ? new Date(p.fetchedAt).toISOString().slice(11, 16) + "Z" : "";
  const src =
    p.source === "pubchem-live" ? "PubChem live"
    : p.source === "pubchem-cache" ? "PubChem cached"
    : p.source === "bundled" ? "bundled reference"
    : p.source === "computed" ? "computed locally"
    : "source unavailable";
  return when ? `${src} ${when}` : src;
}

// ---- recovery cards ----
function recover(title: string, detail: string, actions: RecoveryAction[]) {
  setRecovery({ id: `r${Date.now()}`, title, detail, actions });
}
function clearRecovery() {
  setRecovery(null);
}

const KNOWN_COMBOS: Record<string, number> = {
  "H,O": 962, "H,H,O": 962, "Cl,Na": 5234, "C,O": 280, "C,O,O": 280,
  "Cl,H": 313, "H,N": 222, "H,H,H,N": 222, "C,H": 297,
  "C,H,H,H,H": 297, "H,S": 402, "H,H,S": 402, "O,S": 1119, "O,O,S": 24682,
  "F,F": 24524, "Ca,F,F": 24617, "Mg,O": 14792, "K,K,O": 25522,
  "Ca,O": 14778, "F,Li": 224478, "F,Na": 5235, "H,H,O,O": 784,
  "N,N": 947, "O,O": 977, "Cl,Cl": 24526,
  "Li,Li,O": 166630, "Na,Na,O": 73974, "Al,Al,O,O,O": 9989226,
  "Cl,K": 4873, "Ca,Cl,Cl": 5284359, "Cl,Cl,Mg": 5360315,
  "Al,Cl,Cl,Cl": 24564, "Br,K": 253877, "I,K": 4875, "Br,Na": 253881,
  "F,H": 14917, "C,Ca,O,O,O": 10112, "H,Na,O": 14798, "H,K,O": 14797,
  "N,N,O": 948,
};

/** rough molar mass from element counts, for an offline predicted compound */
function molarMass(counts: Record<string, number>): number {
  let m = 0;
  for (const [sym, n] of Object.entries(counts)) m += (BY_SYMBOL[sym]?.mass ?? 0) * n;
  return m;
}

/** "CaF2" -> { Ca: 1, F: 2 }; returns null if it isn't a plain formula */
function parseFormulaCounts(s: string): Record<string, number> | null {
  const tokens = s.match(/([A-Z][a-z]?)(\d*)/g);
  if (!tokens || tokens.join("") !== s) return null;
  const out: Record<string, number> = {};
  for (const tok of tokens) {
    const m = /([A-Z][a-z]?)(\d*)/.exec(tok)!;
    if (!BY_SYMBOL[m[1]]) return null;
    out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? parseInt(m[2], 10) : 1);
  }
  return Object.keys(out).length ? out : null;
}

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
  setComparison(null);

  // no explicit ratio: use the criss-cross formula the bond predictor derives
  // (Ca + F -> CaF2, not CaF), falling back to one-of-each.
  let counts: Record<string, number>;
  if (stoich && Object.keys(stoich).length) {
    counts = stoich;
  } else {
    const predicted = predictBond(sel).formula;
    counts = (predicted && parseFormulaCounts(predicted)) || Object.fromEntries(sel.map((s) => [s, 1]));
  }
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
    if (!pubchemHealthy()) {
      // PubChem is down and this one is not bundled. Don't dead-end: stage the
      // compound the offline bonding model predicts, clearly marked computed,
      // and still offer a retry against PubChem.
      const predicted: MoleculeProps = {
        cid: 0,
        name: `${formula} (predicted)`,
        formula,
        smiles: "",
        weight: Math.round(molarMass(counts) * 100) / 100,
        tpsa: null, xlogp: null, hbd: null, hba: null, rotatable: null, complexity: null,
        prov: { source: "computed", fetchedAt: null, detail: "offline bonding model; PubChem unavailable" },
      };
      setProps(predicted);
      setSdf3d(null); setHazard(null); setSimilars([]); setCandidates(null); setViability(null); setBio(null); setUses(null); setComparison(null);
      recover("Predicted compound — PubChem is unreachable",
        `${formula} is not in the offline set, so this is the bonding model's prediction (${p.bondType}), not a PubChem record.`,
        [{ label: "Retry with PubChem", tool: "combine_selection", args: { stoichiometry: counts } }]);
      note(actor, "Combined selection (predicted)", `${sel.join(" + ")} → ${formula} · ${p.bondType} · computed offline`);
      setStatus(`${formula} (predicted) on the stage — PubChem unavailable.`);
      return ok(
        `${bondVerdictGlyph(p.verdict)} Predicted ${p.bondType} compound ${formula}. ${p.why}\n` +
        `PubChem is unreachable, so this is the offline bonding model, not a database record.`,
        predicted,
      );
    }
    return err(`PubChem has no entry for the formula ${formula}. Try explicit stoichiometry, e.g. { "H": 2, "O": 1 }, or a known name.`);
  }
  clearRecovery();

  const props = await getOneProperty(cid);
  if (!props) {
    return err(pubchemHealthy()
      ? `Found CID ${cid} but PubChem returned no property record.`
      : `${pubchemStatusNote()} Found CID ${cid} but could not fetch its properties.`);
  }
  formula = props.formula || formula;
  setProps(props);
  setSdf3d(null); setHazard(null); setSimilars([]); setCandidates(null); setViability(null); setBio(null); setUses(null); setComparison(null);
  activity({ kind: "note", label: `combined → ${props.name}` });
  note(actor, "Combined selection", `${sel.join(" + ")} → ${props.name} (${formula}) · ${provTag(props.prov)}`,
    { label: `CID ${cid}`, url: ep.page(cid) });
  setStatus(`${props.name} on the stage.`);
  return ok(`${props.name} — formula ${formula}, SMILES ${props.smiles}, CID ${cid}.\nSource: ${provTag(props.prov)}.`, props);
}

// ---------- search ----------
export async function searchPubchem(query: string, by: ResolveBy, actor: Actor): Promise<Res> {
  setStatus(`Searching PubChem (${by})…`);
  const cids = await resolveCids(query, by);
  if (!cids.length) {
    const down = !pubchemHealthy();
    if (down) {
      recover("PubChem unreachable — lookup failed",
        `"${query}" is not in the bundled set and the live lookup could not complete.`,
        [{ label: "Retry", tool: "search_pubchem", args: { query, by } }]);
      return err(`${pubchemStatusNote()} Could not look up "${query}". Recovery: retry in a moment.`);
    }
    return err(`PubChem has no ${by} match for "${query}". Try a different spelling, by:"formula", or a SMILES.`);
  }
  clearRecovery();
  const props = await getProperties(cids.slice(0, 5));
  note(actor, "Searched PubChem", `${by}:"${query}" → ${cids.length} hit(s)`,
    { label: `CID ${cids[0]}`, url: ep.page(cids[0]) });
  if (props[0]) {
    setProps(props[0]); setSdf3d(null);
    setHazard(null); setSimilars([]); setCandidates(null); setViability(null); setBio(null); setUses(null); setComparison(null);
  }
  const lines = props.map((p) => `${p.cid} ${p.name} (${p.formula})`).join("; ");
  return ok(`Top matches: ${lines || cids.slice(0, 5).join(", ")}.`, props);
}

// ---------- properties ----------
export async function fetchProperties(cid: number, actor: Actor): Promise<Res> {
  const p = await getOneProperty(cid);
  if (!p) return err(`No property record for CID ${cid}.`);
  setProps(p);
  note(actor, "Fetched properties", `${p.name}: MW ${p.weight}, TPSA ${p.tpsa}, logP ${p.xlogp}, HBD/HBA ${p.hbd}/${p.hba} · ${provTag(p.prov)}`,
    { label: `CID ${cid}`, url: ep.page(cid) });
  return ok(`${p.name}: formula ${p.formula}, MW ${p.weight} g/mol, TPSA ${p.tpsa}, XLogP ${p.xlogp}, HBD ${p.hbd}, HBA ${p.hba}, rotatable bonds ${p.rotatable}.\nSource: ${provTag(p.prov)}.`, p);
}

// ---------- 3D ----------
export async function fetch3dConformer(cid: number, actor: Actor): Promise<Res> {
  setStatus("Fetching 3D conformer…");
  activity({ kind: "target", selector: ".stage", label: "load 3D" });
  const { sdf, is3d, approx, prov } = await get3dSdf(cid);
  if (!sdf) {
    const down = !pubchemHealthy();
    recover(
      down ? "PubChem unreachable — 3D geometry not fetched" : `No structure record for CID ${cid}`,
      down
        ? "The conformer call is live PubChem with no offline copy for this compound."
        : "PubChem has neither a 3D nor a 2D conformer on file for this CID.",
      [
        { label: down ? "Retry fetch" : "Retry", tool: "fetch_3d_conformer", args: { cid } },
        { label: "Keep the 2D view", tool: "get_canvas_state", args: {} },
      ],
    );
    return err(down
      ? `${pubchemStatusNote()} No cached or bundled geometry for CID ${cid}.`
      : `PubChem has no 2D or 3D structure record for CID ${cid}.`);
  }
  clearRecovery();
  setSdf3d(sdf);
  const label = approx ? "Rendered approximate 3D geometry (bundled)"
    : is3d ? "Rendered 3D conformer" : "Rendered 2D structure (no 3D on file)";
  note(actor, label, `CID ${cid} · ${provTag(prov)}`,
    approx ? undefined : { label: "SDF", url: is3d ? ep.sdf3d(cid) : ep.sdf2d(cid) });
  setStatus(approx ? "Approximate geometry on the stage (PubChem 3D unavailable)."
    : is3d ? "3D conformer on the stage." : "2D structure (no 3D conformer available).");
  return ok((approx
    ? `PubChem's 3D conformer was unavailable; rendered a hand-built textbook geometry for CID ${cid} instead.`
    : is3d ? `3D ball-and-stick model rendered for CID ${cid}.`
    : `Only a 2D conformer is on file for CID ${cid}; rendered that.`) + `\nSource: ${provTag(prov)}.`);
}

// ---------- hazard ----------
export async function assessHazard(cid: number, actor: Actor): Promise<Res> {
  setStatus("Reading GHS hazard record…");
  activity({ kind: "target", selector: ".hazard, .stage", label: "assess hazard" });
  const h = await getHazard(cid);
  if (h.basis === "source-unavailable") {
    recover("PubChem unreachable — GHS record not read",
      "The hazard classification is a live PubChem PUG View call with no offline copy.",
      [{ label: "Retry", tool: "assess_hazard_profile", args: { cid } }]);
    return err(`${pubchemStatusNote()} GHS record not read for CID ${cid}. Recovery: retry in a moment.`);
  }
  clearRecovery();
  setHazard(h);
  const label = hazardLabel(h);
  const detail =
    h.basis === "primary-classification"
      ? `${label} · ${h.pictograms.join(" ") || "no pictograms"} · ${h.statements.slice(0, 3).map((s) => s.code).join(" ")}` +
        (h.notifierNote ? `\n(${h.notifierNote})` : "")
      : label;
  note(actor, "Assessed hazard profile", `${label} · ${provTag(h.prov)}`, { label: `GHS · CID ${cid}`, url: ep.page(cid) });
  setStatus(`Hazard: ${label}.`);
  return ok(`${detail}\nBasis: ${h.basis.replace(/-/g, " ")}. Source: ${provTag(h.prov)}.`, h);
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
    const down = !pubchemHealthy();
    if (down) {
      recover("PubChem unreachable — similarity search skipped",
        "The 2D similarity endpoint is live PubChem with no offline fallback.",
        [{ label: "Retry", tool: "find_similar_compounds", args: { smiles, threshold, limit } }]);
      return err(`${pubchemStatusNote()} Similarity search has no offline fallback. Retry in a moment.`);
    }
    recover(`No matches at Tanimoto ${(threshold / 100).toFixed(2)}`,
      `Nothing in PubChem is that close to ${smiles}. A lower threshold widens the net.`,
      [
        { label: "Lower to 0.80", tool: "find_similar_compounds", args: { smiles, threshold: 80, limit } },
        { label: "Lower to 0.70", tool: "find_similar_compounds", args: { smiles, threshold: 70, limit } },
      ]);
    return err(`No compounds within Tanimoto ${threshold / 100} of ${smiles}. Recovery: retry with threshold 80 or 70.`);
  }
  clearRecovery();
  const props = await getProperties(others);
  const hits: SimilarHit[] = props.map((p) => {
    const base: SimilarHit = {
      cid: p.cid, name: p.name, formula: p.formula, smiles: p.smiles,
      weight: p.weight, tpsa: p.tpsa, xlogp: p.xlogp, prov: p.prov,
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
  if (!pa || !pb) {
    const missing = !pa ? aQ : bQ;
    const down = !pubchemHealthy();
    if (down) {
      recover("PubChem unreachable — comparison incomplete",
        `"${missing}" is not in the bundled set and the live lookup could not complete.`,
        [{ label: "Retry comparison", tool: "compare_compounds", args: { a: aQ, b: bQ } }]);
    }
    return err(`Could not resolve "${missing}".` + (down ? " " + pubchemStatusNote() + " Recovery: retry in a moment." : ""));
  }
  if (pa.cid === pb.cid) return err(`"${aQ}" and "${bQ}" are the same compound (CID ${pa.cid}).`);
  clearRecovery();

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
    properties: s.props && { ...s.props, provenance: s.props.prov ? provTag(s.props.prov) : "unknown" },
    hazard: s.hazard && {
      severity: s.hazard.severity,
      basis: s.hazard.basis,
      label: hazardLabel(s.hazard),
      signal: s.hazard.signal,
      pictograms: s.hazard.pictograms,
      provenance: provTag(s.hazard.prov),
    },
    similars: s.similars.map((h) => ({ cid: h.cid, name: h.name, greenScore: h.greenScore })),
    uses: s.uses,
    viability: s.viability && { ...s.viability, provenance: provTag(s.viability.prov) },
    comparison: s.comparison && {
      a: { cid: s.comparison.a.props.cid, name: s.comparison.a.props.name, formula: s.comparison.a.props.formula },
      b: { cid: s.comparison.b.props.cid, name: s.comparison.b.props.name, formula: s.comparison.b.props.formula },
    },
    candidates: s.candidates,
    build: s.build && {
      id: s.build.id, status: s.build.status, phase: s.build.phase,
      progress: s.build.progress, partial: s.build.partial, winnerCid: s.build.winnerCid,
    },
    recovery: s.recovery && { title: s.recovery.title, actions: s.recovery.actions },
    trace: s.trace.slice(0, 8).map((t) => ({
      name: t.name, actor: t.actor, ok: t.ok, durationMs: t.durationMs, retries: t.retries,
    })),
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

// ---------- build to constraints (the headline, async job) ----------

interface JobCtl {
  job: BuildJob;
  cancelled: boolean;
}
const buildJobs = new Map<string, JobCtl>();
let lastBuildId: string | null = null;
let buildSeq = 0;

const publishJob = (ctl: JobCtl) => setBuild(ctl.job);

/**
 * Start a constraint solve. Returns a job id immediately; the work runs
 * detached. Poll get_build_status, stop with cancel_build. The canvas is only
 * written once, at the end, so a time budget or a cancel never leaves a
 * half-built winner on the stage.
 */
export function startBuild(goal: string, raw: BuildConstraints, actor: Actor): Res {
  const cons: BuildConstraints = { ...raw };
  if (cons.period && !cons.elements) {
    cons.elements = Object.values(BY_SYMBOL)
      .filter((e) => e.period === cons.period && e.category !== "lanthanide" && e.category !== "actinide")
      .map((e) => e.symbol);
  }

  const id = `bld_${Date.now().toString(36)}${(buildSeq++).toString(36)}`;
  const job: BuildJob = {
    id, goal, constraints: cons,
    status: "running", phase: "resolving candidates",
    progress: { done: 0, total: 0 },
    startedAt: Date.now(), endedAt: null,
    candidates: [], winnerCid: null, partial: false, error: null,
  };
  const ctl: JobCtl = { job, cancelled: false };
  buildJobs.set(id, ctl);
  lastBuildId = id;
  clearRecovery();

  // light the allowed elements on the table right away (input, not output)
  const allowed = new Set(cons.elements ?? []);
  if (allowed.size) {
    allowed.add("H");
    for (const s of allowed) if (s !== "H") activity({ kind: "target", selector: `[data-sym="${s}"]`, label: `consider ${s}` });
    setSelection([...allowed].filter((s) => s !== "H").slice(0, 8));
  }
  publishJob(ctl);
  setStatus(`Agent: build ${id} started — ${goal}`);
  note(actor, "Build started", `${id} · ${goal}`);

  void runBuild(ctl, actor).catch((e) => {
    ctl.job.status = "error";
    ctl.job.error = (e as Error)?.message ?? String(e);
    ctl.job.endedAt = Date.now();
    publishJob(ctl);
    setStatus(`Agent: build ${id} failed.`);
  });

  return ok(
    `Build job ${id} started for "${goal}". It runs asynchronously.\n` +
    `Poll with get_build_status { "jobId": "${id}" } for phase, progress, and the ranked result.\n` +
    `Stop it early with cancel_build { "jobId": "${id}" }.`,
    { jobId: id, status: "running" },
  );
}

export function getBuildStatus(jobId: string | undefined): Res {
  const id = jobId || lastBuildId;
  if (!id) return err("No build has been started yet.");
  const ctl = buildJobs.get(id);
  if (!ctl) return err(`No build job ${id}.`);
  const j = ctl.job;
  const snap = {
    jobId: j.id,
    status: j.status,
    phase: j.phase,
    progress: j.progress,
    elapsedMs: (j.endedAt ?? Date.now()) - j.startedAt,
    partial: j.partial,
    winnerCid: j.winnerCid,
    error: j.error,
    candidates: j.candidates.slice(0, 5).map((c) => ({
      cid: c.cid, name: c.name, formula: c.formula, score: c.score,
      pass: c.pass, rejected: c.rejected, hazard: c.hazardLabel,
      breakdown: c.breakdown,
    })),
  };
  const line =
    j.status === "running"
      ? `Build ${j.id}: ${j.phase} (${j.progress.done}/${j.progress.total || "?"}).`
      : j.status === "done"
        ? `Build ${j.id} done${j.partial ? " (partial — time budget)" : ""}. ` +
          snap.candidates.map((c) => `${c.pass ? "✓" : "✗"} ${c.name} ${c.score}/100`).join("; ")
        : `Build ${j.id} ${j.status}${j.error ? `: ${j.error}` : ""}.`;
  return ok(line + "\n" + JSON.stringify(snap, null, 2), snap);
}

export function cancelBuild(jobId: string | undefined): Res {
  const id = jobId || lastBuildId;
  if (!id) return err("No build to cancel.");
  const ctl = buildJobs.get(id);
  if (!ctl) return err(`No build job ${id}.`);
  if (ctl.job.status !== "running") return ok(`Build ${id} is already ${ctl.job.status}.`);
  ctl.cancelled = true;
  ctl.job.phase = "stopping";
  publishJob(ctl);
  return ok(`Build ${id} stop requested. It halts at the next checkpoint and commits whatever it has fully ranked.`);
}

async function runBuild(ctl: JobCtl, actor: Actor) {
  const { job } = ctl;
  const cons = job.constraints;
  const allowed = new Set(cons.elements ?? []);
  if (allowed.size) allowed.add("H");

  const seeds = candidateSeeds(job.goal);
  job.progress = { done: 0, total: seeds.length };
  job.phase = "resolving candidates";
  publishJob(ctl);
  activity({ kind: "note", label: `searching ${seeds.length} candidates` });

  // resolve names -> CIDs, bundled set first, deduped by CID
  const resolveDeadline = Date.now() + 10000;
  const pairs: { seed: string; cid: number }[] = [];
  const seenCid = new Set<number>();
  for (const seed of seeds) {
    if (ctl.cancelled) return commit(ctl, actor, "cancelled", new Map(), new Map());
    const fb = fallbackFind(seed);
    let cid: number | undefined = fb?.cid;
    if (cid === undefined && Date.now() < resolveDeadline) {
      const cids = await resolveCids(seed, "name");
      cid = cids[0];
    }
    job.progress.done++;
    if (cid !== undefined && !seenCid.has(cid)) { seenCid.add(cid); pairs.push({ seed, cid }); }
    publishJob(ctl);
  }
  if (!pairs.length) {
    job.error = pubchemHealthy()
      ? "No candidates resolved for that goal."
      : `${pubchemStatusNote()} No seeds resolved and few are in the bundled set.`;
    job.status = "error";
    job.endedAt = Date.now();
    publishJob(ctl);
    note(actor, "Build failed", job.error);
    setStatus(`Agent: build ${job.id} — ${job.error}`);
    return;
  }

  // properties, then dedupe by connectivity identity (drop stereo/charge)
  job.phase = "fetching properties";
  publishJob(ctl);
  const props = await getProperties(pairs.map((p) => p.cid));
  const byCid = new Map<number, MoleculeProps>();
  const seenKey = new Set<string>();
  for (const p of props) {
    const key = canonicalKey(p);
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    byCid.set(p.cid, p);
  }
  const pool = pairs.filter((p) => byCid.has(p.cid));

  // hazard sweep, bounded by a ~14s budget
  job.phase = "hazard-checking every candidate";
  job.progress = { done: 0, total: pool.length };
  publishJob(ctl);
  activity({ kind: "note", label: "checking hazard on every candidate" });
  const hazards = new Map<number, HazardProfile>();
  const hazDeadline = Date.now() + 14000;
  for (const { cid } of pool) {
    if (ctl.cancelled) break;
    if (Date.now() > hazDeadline) { job.partial = true; break; }
    hazards.set(cid, await getHazard(cid));
    job.progress.done = hazards.size;
    publishJob(ctl);
  }

  // one scoring pass, with props and hazard both known -> bounded, transparent
  job.phase = "scoring";
  publishJob(ctl);
  const wantSafe = !!cons.nonToxic || /non[\s-]?toxic|green|safe/.test(job.goal.toLowerCase());
  const scored: CandidateScore[] = [];
  for (const { cid } of pool) {
    const p = byCid.get(cid);
    if (p) scored.push(scoreCandidate(p, cons, allowed, hazards.get(cid), wantSafe));
  }
  scored.sort((a, b) => b.score - a.score);
  job.candidates = scored;
  const winner = scored.find((c) => c.pass) ?? scored[0];
  job.winnerCid = winner?.cid ?? null;

  return commit(ctl, actor, ctl.cancelled ? "cancelled" : "done", byCid, hazards);
}

/** The single atomic write to the canvas. Nothing above this touches derived state. */
async function commit(
  ctl: JobCtl,
  actor: Actor,
  status: "done" | "cancelled",
  byCid: Map<number, MoleculeProps>,
  hazards: Map<number, HazardProfile>,
) {
  const { job } = ctl;
  job.status = status;
  job.endedAt = Date.now();

  const top = job.candidates.slice(0, 5);
  if (top.length) {
    setCandidates(top);
    setSimilars([]);
    const winner = top.find((c) => c.pass) ?? top[0];
    if (winner) {
      const wp = byCid.get(winner.cid) ?? await getOneProperty(winner.cid);
      if (wp) {
        setProps(wp);
        activity({ kind: "target", selector: ".stage", label: `stage ${wp.name}` });
        const { sdf } = await get3dSdf(wp.cid);
        if (sdf) setSdf3d(sdf);
        setHazard(hazards.get(wp.cid) ?? await getHazard(wp.cid));
      }
    }
    for (const c of top) {
      note(actor, `Candidate: ${c.name}`,
        `${c.score}/100 ${c.pass ? "✓" : `✗ rejected — ${c.rejected ?? "constraint miss"}`}` +
        ` · ${c.reasons.slice(0, 3).join("; ")}`,
        { label: `CID ${c.cid}`, url: ep.page(c.cid) });
    }
  } else if (status === "cancelled") {
    setStatus(`Agent: build ${job.id} stopped before anything was ranked. Canvas unchanged.`);
    note(actor, "Build stopped", `${job.id} — nothing committed`);
    publishJob(ctl);
    return;
  }

  publishJob(ctl);
  const w = top.find((c) => c.pass) ?? top[0];
  const partial = job.partial || status === "cancelled";
  activity({ kind: "done", label: w ? `Agent: ${w.name} scored ${w.score}/100.` : "Agent: build ended." });
  setStatus(
    status === "cancelled"
      ? `Agent: build ${job.id} stopped. Ranked ${top.length} fully processed candidate(s).`
      : `Best fit: ${w?.name ?? "none"} (${w?.score ?? 0}/100).${partial ? " (partial: time budget)" : ""}`,
  );
}

/** connectivity-level identity so two forms of the same molecule score once */
function canonicalKey(p: MoleculeProps): string {
  const s = (p.smiles || p.formula || String(p.cid))
    .replace(/[@/\\]/g, "")
    .replace(/\[([A-Za-z]+)[+-]?\d*\]/g, "$1")
    .toLowerCase();
  return s || `cid${p.cid}`;
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

/**
 * Transparent, bounded scoring. Starts at a fixed base, adds signed terms that
 * each name their reason, then clamps once to 0..100. No term is ever applied
 * after the clamp, so a score can never read "104/100".
 */
function scoreCandidate(
  p: MoleculeProps,
  c: BuildConstraints,
  allowed: Set<string>,
  hazard: HazardProfile | undefined,
  wantSafe: boolean,
): CandidateScore {
  const BASE = 50;
  const terms: ScoreTerm[] = [];
  const reasons: string[] = [];
  let pass = true;
  let rejected: string | undefined;
  const add = (label: string, delta: number) => { if (delta) terms.push({ label, delta }); };

  // hard constraint: element whitelist
  if (allowed.size && !elementsWithin(p.formula, allowed)) {
    pass = false;
    rejected = `uses elements outside the ${c.period ? `period-${c.period}` : "allowed"} set`;
    add("outside allowed elements", -30);
  }
  // weight cap
  if (c.maxWeight && p.weight !== null) {
    if (p.weight <= c.maxWeight) { add(`MW within ${c.maxWeight}`, +8); reasons.push(`MW ${Math.round(p.weight)} within limit`); }
    else {
      add(`MW over ${c.maxWeight}`, -18);
      if (pass) { pass = false; rejected = `MW ${Math.round(p.weight)} over the ${c.maxWeight} g/mol cap`; }
    }
  }
  // logP cap
  if (c.maxLogP != null && p.xlogp !== null) {
    if (p.xlogp <= c.maxLogP) add(`logP within ${c.maxLogP}`, +6);
    else { add(`logP over ${c.maxLogP}`, -12); reasons.push(`logP ${p.xlogp} above the cap`); }
  }
  // reactive handles
  if (p.hbd !== null && p.hba !== null) {
    if (p.hbd >= 1 && p.hba >= 2) { add("2+ H-bond handles", +10); reasons.push(`${p.hbd} donor / ${p.hba} acceptor handles`); }
    else if (p.hbd + p.hba >= 2) add("some reactive handles", +4);
    else { add("few reactive handles", -6); reasons.push("few reactive handles"); }
  }
  // functionality
  if (/O/.test(p.formula) && /N/.test(p.formula)) add("O and N functionality", +4);
  else if (/O/.test(p.formula)) add("oxygen functionality", +5);
  // processability
  if (p.xlogp !== null) {
    if (p.xlogp < 0) add("water-processable (logP < 0)", +6);
    else if (p.xlogp > 1.5) { add("oily (logP > 1.5)", -6); reasons.push(`logP ${p.xlogp} (oily)`); }
  }
  if (p.rotatable !== null && p.rotatable <= 3) add("compact backbone", +3);
  if (p.complexity !== null && p.complexity < 120) add("low complexity", +2);

  // hazard, evidence-based
  const hlabel = hazardLabel(hazard);
  if (hazard) {
    const sev = hazard.severity;
    if (wantSafe) {
      const penalty = sev === "severe" ? -35 : sev === "high" ? -22 : sev === "moderate" ? -12 : sev === "low" ? -5 : 0;
      if (penalty) { add(`hazard: ${hlabel}`, penalty); reasons.push(hlabel); }
      if (sev === "severe" && pass) {
        pass = false;
        const codes = hazard.statements.slice(0, 3).map((s) => s.code).join(" ");
        rejected = `GHS ${hazard.signal ?? "severe"}${codes ? `: ${codes}` : ""} with a non-toxic goal`;
      }
      if (sev === "none") { add("no GHS hazards in primary classification", +6); reasons.push("no GHS hazards in primary classification"); }
      else if (sev === "unknown" && hazard.basis === "no-ghs-record") add("no GHS record (unverified)", +2);
      else if (hazard.basis === "source-unavailable") { add("hazard not checked", -3); reasons.push("hazard not checked — PubChem unavailable"); }
    } else if (sev !== "unknown" && sev !== "none") {
      reasons.push(hlabel);
    }
  }

  const score = Math.max(0, Math.min(100, Math.round(BASE + terms.reduce((s, t) => s + t.delta, 0))));
  reasons.push(`TPSA ${p.tpsa ?? "?"}, logP ${p.xlogp ?? "?"}`);
  return {
    cid: p.cid, name: p.name, formula: p.formula, smiles: p.smiles,
    score, base: BASE, breakdown: terms, reasons, pass, rejected,
    hazardLabel: hlabel,
    weight: p.weight, tpsa: p.tpsa, xlogp: p.xlogp, hbd: p.hbd, hba: p.hba,
    prov: p.prov,
  };
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
  const others = [...new Set(cids.filter((c) => c !== baseCid))].slice(0, 6);
  const props = await getProperties(others);
  const seen = new Set<string>();
  const hits: SimilarHit[] = props.map((p) => {
    const h: SimilarHit = { cid: p.cid, name: p.name, formula: p.formula, smiles: p.smiles, weight: p.weight, tpsa: p.tpsa, xlogp: p.xlogp, prov: p.prov };
    const g = greenScore(h); h.greenScore = g.score; h.greenNotes = g.notes;
    return h;
  }).filter((h) => {
    const k = (h.smiles || h.formula || String(h.cid)).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k); return true;
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
