// Core shared types for the Valence bench.

export type Actor = "person" | "agent";

export type StageMode = "empty" | "2d" | "3d";

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
}

export type HazardSeverity = "none" | "low" | "moderate" | "high" | "severe" | "unknown";

export interface HazardProfile {
  cid: number;
  severity: HazardSeverity;
  signal: string | null; // "Danger" | "Warning" | null
  pictograms: HazardPictogram[];
  statements: { code: string; text: string }[];
  sourceUrl: string;
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
}

export interface ViabilityReport {
  cid: number;
  vendorCount: number | null;
  patentCount: number | null;
  verdict: string;
  sourceUrls: string[];
}

export interface BioReport {
  cid: number;
  activeAssays: number | null;
  targets: string[];
  pharmClass: string[];
  sourceUrls: string[];
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

export interface CandidateScore {
  cid: number;
  name: string;
  formula: string;
  smiles: string;
  score: number; // 0..100
  reasons: string[];
  pass: boolean;
}

export interface State {
  theme: "dark" | "light";
  sound: boolean;
  webmcpConnected: boolean;
  queueDepth: number;

  selection: string[]; // element symbols
  armed: boolean;

  stageMode: StageMode;
  props: MoleculeProps | null;
  sdf3d: string | null;

  hazard: HazardProfile | null;
  similars: SimilarHit[];
  viability: ViabilityReport | null;
  bio: BioReport | null;
  uses: string[] | null;
  candidates: CandidateScore[] | null;

  notebook: NotebookEntry[];
  status: string;
}
