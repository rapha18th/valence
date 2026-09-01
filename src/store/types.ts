// Core shared types for the Valence bench.

export type Actor = "person" | "agent";

export type StageMode = "empty" | "2d" | "3d";

// ---- provenance & confidence ----
// Every claim Valence renders carries where it came from and when, so a human
// (or an agent) can tell live PubChem data from a cached copy, from the bundled
// offline set, from a local computation, or from "we could not check".
export type ProvSource =
  | "pubchem-live"
  | "pubchem-cache"
  | "bundled"
  | "computed"
  | "unavailable";

export interface Provenance {
  source: ProvSource;
  fetchedAt: number | null; // epoch ms of the underlying fetch; null for bundled/computed
  detail?: string; // e.g. "HTTP 503", "offline reference set"
}

export type Confidence = "high" | "medium" | "low";

export interface ElementDef {
  z: number;
  symbol: string;
  name: string;
  mass: number;
  category: ElementCategory;
  period: number;
  group: number; // 1..18; lanthanides/actinides use 3
  xpos: number; // 1..18 grid column
  ypos: number; // 1..10 grid row (8/9 = f-block)
  oxidationStates: number[];
  electronegativity: number | null;
}

export type ElementCategory =
  | "nonmetal"
  | "noble-gas"
  | "alkali-metal"
  | "alkaline-earth"
  | "metalloid"
  | "halogen"
  | "post-transition"
  | "transition-metal"
  | "lanthanide"
  | "actinide"
  | "unknown";

export interface MoleculeProps {
  cid: number;
  name: string;
  formula: string;
  smiles: string;
  weight: number | null;
  tpsa: number | null;
  xlogp: number | null;
  hbd: number | null;
  hba: number | null;
  rotatable: number | null;
  complexity: number | null;
  prov?: Provenance;
}

export type HazardSeverity = "none" | "low" | "moderate" | "high" | "severe" | "unknown";

// what the hazard read is actually based on, so the UI never states an
// absolute like "safe" — only what the evidence supports.
export type HazardBasis =
  | "primary-classification" // GHS block parsed from PubChem
  | "no-ghs-record" // PubChem answered, nothing classified
  | "source-unavailable" // could not reach PubChem
  | "reference-safe"; // bundled simple molecule, no classification expected

export interface HazardProfile {
  cid: number;
  severity: HazardSeverity;
  basis: HazardBasis;
  signal: string | null; // "Danger" | "Warning" | null
  pictograms: HazardPictogram[];
  statements: { code: string; text: string }[];
  notifierNote?: string; // e.g. "primary classification only; minority notifiers excluded"
  sourceUrl: string;
  prov?: Provenance;
}

export type HazardPictogram =
  | "GHS01" // explosive
  | "GHS02" // flammable
  | "GHS03" // oxidiser
  | "GHS04" // gas under pressure
  | "GHS05" // corrosive
  | "GHS06" // acute toxic
  | "GHS07" // harmful / irritant
  | "GHS08" // health hazard
  | "GHS09"; // environmental

export interface SimilarHit {
  cid: number;
  name: string;
  formula: string;
  smiles: string;
  weight: number | null;
  tpsa: number | null;
  xlogp: number | null;
  greenScore?: number; // 0..100, higher is greener
  greenNotes?: string[];
  prov?: Provenance;
}

export interface ViabilityReport {
  cid: number;
  vendorCount: number | null;
  patentCount: number | null;
  verdict: string;
  sourceUrls: string[];
  prov?: Provenance;
}

export interface BioReport {
  cid: number;
  activeAssays: number | null;
  targets: string[];
  pharmClass: string[];
  sourceUrls: string[];
  prov?: Provenance;
}

export interface NotebookEntry {
  id: string;
  at: number;
  actor: Actor;
  action: string;
  detail: string;
  citation?: { label: string; url: string };
}

export interface AgentActivity {
  kind: "target" | "note" | "done";
  selector?: string;
  label: string;
}

export interface ScoreTerm {
  label: string;
  delta: number; // signed contribution, in points
}

export interface CandidateScore {
  cid: number;
  name: string;
  formula: string;
  smiles: string;
  score: number; // 0..100, always clamped
  base: number; // starting score before terms (for the stacked bar)
  breakdown: ScoreTerm[]; // every signed contribution, sums to score within clamp
  reasons: string[]; // human sentences, derived from the breakdown
  pass: boolean;
  rejected?: string; // the single disqualifying reason when pass is false
  hazardLabel?: string; // evidence-based, e.g. "GHS Warning: H319" or "no GHS record"
  weight: number | null;
  tpsa: number | null;
  xlogp: number | null;
  hbd: number | null;
  hba: number | null;
  prov?: Provenance;
}

// ---- tool trace (the agent's activity, made inspectable) ----
export interface TraceEntry {
  id: string;
  name: string;
  actor: Actor;
  args: unknown;
  startedAt: number;
  endedAt: number | null;
  durationMs: number | null;
  ok: boolean | null; // null while running
  retries: number; // PubChem retries consumed during the call
  output: string | null; // truncated result text
  error: string | null;
}

// ---- build job (async constraint solve) ----
export type BuildStatus = "running" | "done" | "cancelled" | "error";

export interface BuildConstraints {
  elements?: string[];
  period?: number;
  nonToxic?: boolean;
  maxWeight?: number;
  maxLogP?: number;
}

export interface BuildJob {
  id: string;
  goal: string;
  constraints: BuildConstraints;
  status: BuildStatus;
  phase: string; // human label of the current step
  progress: { done: number; total: number };
  startedAt: number;
  endedAt: number | null;
  candidates: CandidateScore[]; // ranked; settles as the job runs
  winnerCid: number | null;
  partial: boolean; // true if a time budget cut the hazard sweep short
  error: string | null;
}

// ---- recovery card (an empty/failed result the human can act on) ----
export interface RecoveryAction {
  label: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface RecoveryCard {
  id: string;
  title: string;
  detail: string;
  actions: RecoveryAction[];
}

export interface BondPrediction {
  symbols: string[];
  verdict: "bond" | "no-bond" | "alloy" | "maybe";
  bondType: "ionic" | "polar-covalent" | "nonpolar-covalent" | "metallic" | "none";
  formula: string | null;
  enDiff: number | null;
  why: string;
  note?: string;
}

export interface CompareSide {
  props: MoleculeProps;
  description: string | null;
}
export interface Comparison {
  a: CompareSide;
  b: CompareSide;
}

export interface State {
  theme: "dark" | "light";
  sound: boolean;
  webmcpConnected: boolean;
  queueDepth: number;

  selection: string[]; // element symbols
  armed: boolean;
  bond: BondPrediction | null;

  stageMode: StageMode;
  props: MoleculeProps | null;
  sdf3d: string | null;

  hazard: HazardProfile | null;
  similars: SimilarHit[];
  viability: ViabilityReport | null;
  bio: BioReport | null;
  uses: string[] | null;
  comparison: Comparison | null;
  candidates: CandidateScore[] | null;

  build: BuildJob | null;
  recovery: RecoveryCard | null;
  trace: TraceEntry[];

  notebook: NotebookEntry[];
  status: string;
}
