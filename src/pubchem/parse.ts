// High-level PubChem operations: resolve identifiers, read properties,
// parse GHS hazard records, run similarity search, estimate sourcing.

import { ep } from "./endpoints.ts";
import { getJSON, getText } from "./client.ts";
import { fallbackFind, fallbackByCid } from "../data/fallback.ts";
import type {
  MoleculeProps, HazardProfile, HazardPictogram, HazardSeverity, SimilarHit,
  ViabilityReport, BioReport,
} from "../store/types.ts";

const SAFE_CIDS = new Set([962, 783, 977, 280, 23987, 23968, 24523]); // water, H2, O2, CO2, N2, He, Ne-ish

// ---- identifier resolution ----

export type ResolveBy = "name" | "smiles" | "inchikey" | "formula";

export async function resolveCids(query: string, by: ResolveBy): Promise<number[]> {
  const url =
    by === "name" ? ep.cidsByName(query)
    : by === "smiles" ? ep.cidsBySmiles(query)
    : by === "inchikey" ? ep.cidsByInchiKey(query)
    : ep.cidsByFormula(query);
  const json = await getJSON<{ IdentifierList?: { CID?: number[] } }>(url);
  const cids = json?.IdentifierList?.CID ?? [];
  if (cids.length) return cids;
  // PubChem unreachable or no hit: fall back to the bundled common set
  if (by === "name" || by === "formula") {
    const f = fallbackFind(query);
    if (f) return [f.cid];
  }
  return [];
}

// ---- properties ----

interface RawProp {
  CID: number;
  MolecularFormula?: string;
  MolecularWeight?: string | number;
  SMILES?: string;
  ConnectivitySMILES?: string;
  TPSA?: number;
  XLogP?: number;
  HBondDonorCount?: number;
  HBondAcceptorCount?: number;
  RotatableBondCount?: number;
  Complexity?: number;
  Title?: string;
}

function toProps(r: RawProp): MoleculeProps {
  return {
    cid: r.CID,
    name: r.Title ?? `CID ${r.CID}`,
    formula: r.MolecularFormula ?? "",
    smiles: r.SMILES ?? r.ConnectivitySMILES ?? "",
    weight: num(r.MolecularWeight),
    tpsa: num(r.TPSA),
    xlogp: num(r.XLogP),
    hbd: num(r.HBondDonorCount),
    hba: num(r.HBondAcceptorCount),
    rotatable: num(r.RotatableBondCount),
    complexity: num(r.Complexity),
  };
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function getProperties(cids: number[]): Promise<MoleculeProps[]> {
  if (!cids.length) return [];
  const json = await getJSON<{ PropertyTable?: { Properties?: RawProp[] } }>(
    ep.properties(cids.slice(0, 50)),
  );
  const live = (json?.PropertyTable?.Properties ?? []).map(toProps);
  if (live.length) return live;
  // PubChem unreachable: return whatever the bundled set covers
  const out: MoleculeProps[] = [];
  for (const c of cids) { const f = fallbackByCid(c); if (f) out.push(f); }
  return out;
}

export async function getOneProperty(cid: number): Promise<MoleculeProps | null> {
  const list = await getProperties([cid]);
  return list[0] ?? fallbackByCid(cid) ?? null;
}

// ---- 3D / 2D structure ----

export async function get3dSdf(cid: number): Promise<{ sdf: string; is3d: boolean }> {
  const three = await getText(ep.sdf3d(cid));
  if (three && three.includes("V2000")) return { sdf: three, is3d: true };
  const two = await getText(ep.sdf2d(cid));
  return { sdf: two, is3d: false };
}

// ---- GHS hazard ----

interface PugSection {
  TOCHeading?: string;
  Section?: PugSection[];
  Information?: {
    Name?: string;
    Value?: {
      Number?: number[];
      StringWithMarkup?: { String?: string; Markup?: { URL?: string; Extra?: string }[] }[];
    };
  }[];
}

function walk(sections: PugSection[] | undefined, heading: string): PugSection | null {
  if (!sections) return null;
  for (const s of sections) {
    if (s.TOCHeading === heading) return s;
    const deep = walk(s.Section, heading);
    if (deep) return deep;
  }
  return null;
}

function stringsOf(sec: PugSection | null): string[] {
  if (!sec?.Information) return [];
  const out: string[] = [];
  for (const info of sec.Information) {
    for (const sw of info.Value?.StringWithMarkup ?? []) {
      if (sw.String) out.push(sw.String);
    }
  }
  return out;
}

export async function getHazard(cid: number): Promise<HazardProfile> {
  const url = ep.ghs(cid);
  const json = await getJSON<{ Record?: { Section?: PugSection[] } }>(url);
  const root = json?.Record?.Section;
  const ghs = walk(root, "GHS Classification");

  const profile: HazardProfile = {
    cid,
    severity: "unknown",
    signal: null,
    pictograms: [],
    statements: [],
    sourceUrl: ep.page(cid),
  };

  if (!ghs?.Information?.length) {
    profile.severity = SAFE_CIDS.has(cid) ? "none" : "unknown";
    return profile;
  }

  // The GHS Classification section is a flat, repeated list of Information
  // entries. The first contiguous block (Pictogram(s) / Signal / GHS Hazard
  // Statements) is the curated primary classification; everything after the
  // first "Note" or "ECHA C&L Notifications Summary" is minority notifier
  // data that often contains stray misclassifications. Read the primary block
  // only, and drop hazard statements reported by <25% of notifiers.
  const picCodes = new Set<HazardPictogram>();
  const stmts = new Map<string, string>();
  let danger = false, warning = false;

  for (const info of ghs.Information) {
    const name = info.Name ?? "";
    // the first "ECHA C&L Notifications Summary" starts the minority-notifier
    // data; everything before it is the curated primary classification.
    if (/notifications summary/i.test(name)) break;
    if (/^note$/i.test(name)) continue;
    const sw = info.Value?.StringWithMarkup ?? [];
    if (/pictogram/i.test(name)) {
      for (const s of sw) for (const m of s.Markup ?? []) {
        const hit = /GHS0\d/.exec(m.URL ?? "") ?? /GHS0\d/.exec(m.Extra ?? "");
        if (hit) picCodes.add(hit[0] as HazardPictogram);
      }
    } else if (/^signal$/i.test(name)) {
      for (const s of sw) {
        if (/danger/i.test(s.String ?? "")) danger = true;
        else if (/warning/i.test(s.String ?? "")) warning = true;
      }
    } else if (/hazard statement/i.test(name)) {
      for (const s of sw) {
        const str = s.String ?? "";
        const pct = /\((\d+(?:\.\d+)?)%\)/.exec(str);
        if (pct && parseFloat(pct[1]) < 25) continue;
        const m = /(H\d{3}[A-Za-z+]*)\s*(?:\([^)]*\))?:?\s*(.*)/.exec(str);
        if (m && !stmts.has(m[1])) stmts.set(m[1], m[2].replace(/\s*\[.*$/, "").trim());
      }
    }
  }

  profile.pictograms = [...picCodes].sort();
  profile.signal = danger ? "Danger" : warning ? "Warning" : null;
  profile.statements = [...stmts].map(([code, text]) => ({ code, text })).slice(0, 8);
  profile.severity = severityOf(profile.signal, profile.pictograms, [...stmts.keys()]);
  if (profile.severity === "unknown" && SAFE_CIDS.has(cid)) profile.severity = "none";
  return profile;
}

function severityOf(
  signal: string | null,
  pics: HazardPictogram[],
  hcodes: string[],
): HazardSeverity {
  const danger = /danger/i.test(signal ?? "");
  const warning = /warning/i.test(signal ?? "");
  const has = (p: HazardPictogram) => pics.includes(p);
  const acute = has("GHS06") || hcodes.some((h) => /^H3(0[0-2]|1[01]|3[01])/.test(h));
  const health = has("GHS08");
  const explosive = has("GHS01");

  if ((acute || explosive) && danger) return "severe";
  if (health && danger) return "high";
  if (danger) return "high";
  if (warning && (acute || health)) return "moderate";
  if (warning) return "moderate";
  if (pics.length) return "low";
  if (signal) return "low";
  return "unknown";
}

// ---- similarity ----

export async function similaritySearch(
  smiles: string, threshold: number, max: number,
): Promise<number[]> {
  const json = await getJSON<{ IdentifierList?: { CID?: number[] } }>(
    ep.similarity2d(smiles, threshold, max),
  );
  return json?.IdentifierList?.CID ?? [];
}

export function greenScore(h: SimilarHit): { score: number; notes: string[] } {
  // Transparent heuristic: start at 100, subtract for hazard-linked properties.
  let score = 100;
  const notes: string[] = [];
  if (h.xlogp !== null) {
    if (h.xlogp > 3) { score -= 20; notes.push(`logP ${h.xlogp} (lipophilic, bioaccumulation risk)`); }
    else if (h.xlogp < 0) { notes.push(`logP ${h.xlogp} (water-loving)`); }
  }
  if (h.tpsa !== null) {
    if (h.tpsa < 20) { score -= 10; notes.push(`low TPSA ${h.tpsa} (volatile, non-polar)`); }
  }
  if (h.weight !== null && h.weight < 60) { score -= 10; notes.push(`light (${Math.round(h.weight)} g/mol), likely volatile`); }
  return { score: Math.max(0, Math.min(100, score)), notes };
}

// ---- sourcing ----

export async function getViability(cid: number): Promise<ViabilityReport> {
  const [vendors, patents] = await Promise.all([
    getJSON<{ Record?: { Section?: PugSection[] } }>(ep.vendors(cid)),
    getJSON<{ InformationList?: { Information?: { PatentID?: string[] }[] } }>(ep.patents(cid)),
  ]);

  let vendorCount: number | null = null;
  const vSec = walk(vendors?.Record?.Section, "Chemical Vendors");
  for (const s of stringsOf(vSec)) {
    const m = /([\d,]+)\s+(?:chemical\s+)?vendors?/i.exec(s);
    if (m) vendorCount = parseInt(m[1].replace(/,/g, ""), 10);
  }
  if (vendorCount === null && vSec) {
    // fall back to counting distinct vendor links
    const urls = new Set<string>();
    for (const info of vSec.Information ?? []) {
      for (const sw of info.Value?.StringWithMarkup ?? []) {
        for (const m of sw.Markup ?? []) if (m.URL) urls.add(m.URL);
      }
    }
    if (urls.size) vendorCount = urls.size;
  }

  const patentCount =
    patents?.InformationList?.Information?.[0]?.PatentID?.length ?? null;

  return {
    cid,
    vendorCount,
    patentCount,
    verdict: viabilityVerdict(vendorCount, patentCount),
    sourceUrls: [ep.page(cid)],
  };
}

function viabilityVerdict(vendors: number | null, patents: number | null): string {
  const parts: string[] = [];
  if (vendors === null) parts.push("No vendor listing found");
  else if (vendors === 0) parts.push("Not offered by listed vendors");
  else if (vendors < 10) parts.push(`Specialty supply only (${vendors} vendors)`);
  else parts.push(`Broadly sourced (${vendors}+ vendors)`);

  if (patents === null) parts.push("no linked patents");
  else if (patents < 20) parts.push(`light patent activity (${patents})`);
  else parts.push(`patent-dense (${patents}+ references)`);

  return parts.join("; ") + ".";
}

// ---- industrial / consumer uses ----

export async function getUses(cid: number): Promise<string[]> {
  const json = await getJSON<{ Record?: { Section?: PugSection[] } }>(ep.uses(cid));
  const sec = walk(json?.Record?.Section, "Uses");
  if (!sec) return [];
  const out: string[] = [];
  const collect = (s: PugSection) => {
    for (const line of stringsOf(s)) {
      const clean = line.replace(/\s+/g, " ").trim();
      if (clean && clean.length < 220 && !out.includes(clean)) out.push(clean);
    }
    for (const sub of s.Section ?? []) collect(sub);
  };
  collect(sec);
  return out.slice(0, 8);
}

// ---- bioactivity ----

export async function getBio(cid: number): Promise<BioReport> {
  const [assay, pharm] = await Promise.all([
    getJSON<{ Table?: { Row?: { Cell?: string[] }[]; Columns?: { Column?: string[] } } }>(ep.assaySummary(cid)),
    getJSON<{ Record?: { Section?: PugSection[] } }>(ep.pharmacology(cid)),
  ]);

  let activeAssays: number | null = null;
  const targets = new Set<string>();
  if (assay?.Table?.Row) {
    const cols = assay.Table.Columns?.Column ?? [];
    const outcomeIdx = cols.indexOf("Bioactivity Outcome");
    const targetIdx = cols.indexOf("Target Name");
    activeAssays = 0;
    for (const row of assay.Table.Row) {
      const cells = row.Cell ?? [];
      if (outcomeIdx >= 0 && /active/i.test(cells[outcomeIdx] ?? "")) activeAssays++;
      if (targetIdx >= 0 && cells[targetIdx]) targets.add(cells[targetIdx]);
    }
  }

  const pharmClass: string[] = [];
  const pSec = walk(pharm?.Record?.Section, "Pharmacology and Biochemistry");
  for (const s of stringsOf(walk(pSec ? [pSec] : undefined, "Pharmacology")).slice(0, 2)) {
    pharmClass.push(s.length > 240 ? s.slice(0, 237) + "..." : s);
  }

  return {
    cid,
    activeAssays,
    targets: [...targets].slice(0, 8),
    pharmClass,
    sourceUrls: [ep.page(cid)],
  };
}
