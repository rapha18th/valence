// The shared canvas spine. Every UI handler and every WebMCP tool mutates
// state through these functions, so the person and the agent always act on
// one surface.

import type {
  State, NotebookEntry, Actor, AgentActivity, MoleculeProps, HazardProfile,
  SimilarHit, ViabilityReport, BioReport, CandidateScore, StageMode, BondPrediction,
} from "./types.ts";
import { predictBond } from "../chem/bonding.ts";

type Listener = () => void;
type ActivityListener = (a: AgentActivity) => void;

const state: State = {
  theme: "dark",
  sound: false,
  webmcpConnected: false,
  queueDepth: 0,

  selection: [],
  armed: false,
  bond: null,

  stageMode: "empty",
  props: null,
  sdf3d: null,

  hazard: null,
  similars: [],
  viability: null,
  bio: null,
  uses: null,
  candidates: null,

  notebook: [],
  status: "Ready. Press two element keys, or ask your agent.",
};

const listeners = new Set<Listener>();
const activityListeners = new Set<ActivityListener>();

export function getState(): Readonly<State> {
  return state;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function onActivity(fn: ActivityListener): () => void {
  activityListeners.add(fn);
  return () => activityListeners.delete(fn);
}

let scheduled = false;
function emit() {
  if (scheduled) return;
  scheduled = true;
  // microtask batch: coalesces bursts of mutations but always flushes, even
  // when requestAnimationFrame is throttled (background tab, headless preview).
  queueMicrotask(() => {
    scheduled = false;
    for (const fn of listeners) {
      try { fn(); } catch (e) { console.error("store listener", e); }
    }
  });
}

/** Announce an agent action so the ghost cursor can trace it. */
export function activity(a: AgentActivity) {
  for (const fn of activityListeners) {
    try { fn(a); } catch (e) { console.error("activity listener", e); }
  }
}

// ---- mutations ----

export function setTheme(theme: "dark" | "light") {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("valence.theme", theme); } catch { /* ignore */ }
  emit();
}

export function toggleSound() {
  state.sound = !state.sound;
  emit();
}

export function setWebmcp(connected: boolean) {
  state.webmcpConnected = connected;
  emit();
}

export function setQueueDepth(n: number) {
  state.queueDepth = n;
  emit();
}

export function setStatus(text: string) {
  state.status = text;
  emit();
}

function refreshBond() {
  state.bond = state.selection.length >= 2 ? predictBond(state.selection) : null;
}

export function setSelection(symbols: string[]) {
  state.selection = symbols.slice(0, 8);
  state.armed = state.selection.length >= 1;
  refreshBond();
  emit();
}

export function toggleElement(symbol: string) {
  const i = state.selection.indexOf(symbol);
  if (i >= 0) state.selection.splice(i, 1);
  else if (state.selection.length < 8) state.selection.push(symbol);
  state.armed = state.selection.length >= 1;
  refreshBond();
  emit();
}

export function setBond(b: BondPrediction | null) {
  state.bond = b;
  emit();
}

export function setStage(mode: StageMode) {
  state.stageMode = mode;
  emit();
}

export function setProps(props: MoleculeProps | null) {
  state.props = props;
  if (props) state.stageMode = state.stageMode === "3d" ? "3d" : "2d";
  emit();
}

export function setSdf3d(sdf: string | null) {
  state.sdf3d = sdf;
  if (sdf) state.stageMode = "3d";
  emit();
}

export function setHazard(h: HazardProfile | null) {
  state.hazard = h;
  emit();
}

export function setSimilars(list: SimilarHit[]) {
  state.similars = list;
  emit();
}

export function setViability(v: ViabilityReport | null) {
  state.viability = v;
  emit();
}

export function setBio(b: BioReport | null) {
  state.bio = b;
  emit();
}

export function setUses(u: string[] | null) {
  state.uses = u;
  emit();
}

export function setCandidates(c: CandidateScore[] | null) {
  state.candidates = c;
  emit();
}

export function resetCanvas() {
  state.selection = [];
  state.armed = false;
  state.bond = null;
  state.stageMode = "empty";
  state.props = null;
  state.sdf3d = null;
  state.hazard = null;
  state.similars = [];
  state.viability = null;
  state.bio = null;
  state.uses = null;
  state.candidates = null;
  state.status = "Canvas cleared.";
  emit();
}

let seq = 0;
export function note(
  actor: Actor,
  action: string,
  detail: string,
  citation?: { label: string; url: string },
) {
  const entry: NotebookEntry = {
    id: `n${Date.now()}-${seq++}`,
    at: Date.now(),
    actor, action, detail, citation,
  };
  state.notebook.unshift(entry);
  if (state.notebook.length > 200) state.notebook.pop();
  emit();
  return entry;
}

export function clearNotebook() {
  state.notebook = [];
  emit();
}

// restore theme early
try {
  const t = localStorage.getItem("valence.theme");
  if (t === "light" || t === "dark") {
    state.theme = t;
    document.documentElement.dataset.theme = t;
  } else {
    document.documentElement.dataset.theme = "dark";
  }
} catch {
  document.documentElement.dataset.theme = "dark";
}
