// Registers Valence's tool surface on document.modelContext (the API
// ChatGPT's built-in browser, Codex, and Chrome's WebMCP read). @mcp-b/global
// wraps the native context when one is present, otherwise installs a polyfill,
// so the same registerTool() calls work everywhere.

import "@mcp-b/global";
import { setWebmcp, note } from "../store/store.ts";
import * as ops from "./ops.ts";
import type { ResolveBy } from "../pubchem/parse.ts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
type Exec = (args: any) => Promise<ToolResult>;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: Exec;
}

function wrap(res: { ok: boolean; text: string }): ToolResult {
  return { content: [{ type: "text", text: res.text }], isError: !res.ok };
}
const OBJ = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties: props, required, additionalProperties: false,
});
const RO = { readOnlyHint: true };

const TOOLS: ToolDef[] = [
  {
    name: "select_elements",
    description: "Set the periodic-table selection and arm the assembly stage. Symbols are case-sensitive element symbols like H, Na, Cl.",
    inputSchema: OBJ({ symbols: { type: "array", items: { type: "string" }, description: "Element symbols to select" } }, ["symbols"]),
    execute: async (a) => wrap(ops.selectElements(a.symbols ?? [], "agent")),
  },
  {
    name: "predict_bond",
    description: "Offline chemistry: given element symbols, say whether they bond and why, using electronegativity and valence. Returns verdict (bond / no-bond / alloy), bond type, likely formula, and a plain-language explanation. No network.",
    inputSchema: OBJ({ symbols: { type: "array", items: { type: "string" }, description: "Element symbols; defaults to the current selection" } }),
    annotations: RO,
    execute: async (a) => wrap(ops.predictBondOp(a.symbols, "agent")),
  },
  {
    name: "combine_selection",
    description: "Resolve the current element selection to a real compound via PubChem and render it on the stage. Optionally pass stoichiometry to fix the ratio.",
    inputSchema: OBJ({ stoichiometry: { type: "object", additionalProperties: { type: "integer", minimum: 1 }, description: 'Symbol to count, e.g. { "H": 2, "O": 1 }' } }),
    execute: async (a) => wrap(await ops.combineSelection(a.stoichiometry, "agent")),
  },
  {
    name: "search_pubchem",
    description: "Resolve a name, formula, SMILES, or InChIKey to PubChem compound IDs and load the top hit onto the stage.",
    inputSchema: OBJ({ query: { type: "string" }, by: { type: "string", enum: ["name", "formula", "smiles", "inchikey"] } }, ["query", "by"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.searchPubchem(String(a.query), a.by as ResolveBy, "agent")),
  },
  {
    name: "fetch_properties",
    description: "Fetch molecular properties for a PubChem CID: weight, TPSA, logP, H-bond donors/acceptors, rotatable bonds.",
    inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.fetchProperties(Number(a.cid), "agent")),
  },
  {
    name: "fetch_3d_conformer",
    description: "Fetch a 3D conformer (SDF) for a CID from PubChem and render a rotatable, labelled ball-and-stick model on the stage.",
    inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
    execute: async (a) => wrap(await ops.fetch3dConformer(Number(a.cid), "agent")),
  },
  {
    name: "assess_hazard_profile",
    description: "Read the GHS hazard classification for a CID and render a hazard badge: signal word, pictograms, hazard statements.",
    inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.assessHazard(Number(a.cid), "agent")),
  },
  {
    name: "find_similar_compounds",
    description: "Run a 2D similarity search against PubChem for a SMILES and show the top matches with a green-chemistry score.",
    inputSchema: OBJ({ smiles: { type: "string" }, threshold: { type: "integer", minimum: 50, maximum: 100, default: 90 }, limit: { type: "integer", minimum: 1, maximum: 8, default: 3 } }, ["smiles"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.findSimilar(String(a.smiles), Number(a.threshold ?? 90), Number(a.limit ?? 3), "agent")),
  },
  {
    name: "industrial_viability",
    description: "Estimate how sourceable a compound is: vendor count and linked patent count from PubChem, with a plain-language verdict.",
    inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.industrialViability(Number(a.cid), "agent")),
  },
  {
    name: "industrial_uses",
    description: "List what a compound is actually used for in industry and consumer products, from PubChem's Uses annotations.",
    inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.industrialUses(Number(a.cid), "agent")),
  },
  {
    name: "describe_compound",
    description: "A plain-language description of a compound from PubChem, plus common names. Good for a beginner asking 'what is this?'.",
    inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.describeCompound(Number(a.cid), "agent")),
  },
  {
    name: "bioactivity_bridge",
    description: "Summarise a compound's bioassay history from PubChem: active assay count, tested targets, pharmacology notes.",
    inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.bioactivityBridge(Number(a.cid), "agent")),
  },
  {
    name: "substitute_and_compare",
    description: "Apply a substituent change to a SMILES (-OH, -CH3, -F, -NH2, -COOH, or a full target SMILES) and report how the properties move.",
    inputSchema: OBJ({ base_smiles: { type: "string" }, change: { type: "string" } }, ["base_smiles", "change"]),
    execute: async (a) => wrap(await ops.substituteAndCompare(String(a.base_smiles), String(a.change), "agent")),
  },
  {
    name: "compare_compounds",
    description: "Put two compounds side by side on the stage: A vs B, each identified by name, formula, SMILES, or CID. Renders both structures, a property delta table, and short descriptions.",
    inputSchema: OBJ({ a: { type: "string" }, b: { type: "string" } }, ["a", "b"]),
    execute: async (x) => wrap(await ops.compareCompounds(String(x.a), String(x.b), "agent")),
  },
  {
    name: "close_comparison",
    description: "Leave side-by-side comparison mode and return to the single-compound view.",
    inputSchema: OBJ({}),
    execute: async () => wrap(ops.closeComparison("agent")),
  },
  {
    name: "build_to_constraints",
    description: "The headline flow. Given a goal (e.g. 'non-toxic polymer precursor') and constraints (allowed elements or a period number, weight/logP caps, non-toxic), search PubChem, hazard-check every candidate, score, rank the top three, and put the winner on the stage.",
    inputSchema: OBJ({
      goal: { type: "string" },
      constraints: OBJ({
        elements: { type: "array", items: { type: "string" } },
        period: { type: "integer", minimum: 1, maximum: 7 },
        nonToxic: { type: "boolean" },
        maxWeight: { type: "number" },
        maxLogP: { type: "number" },
      }),
    }, ["goal"]),
    execute: async (a) => wrap(await ops.buildToConstraints(String(a.goal), a.constraints ?? {}, "agent")),
  },
  {
    name: "propose_greener_alternatives",
    description: "Given a CID or SMILES, find structurally similar compounds and rank them by a transparent green-chemistry score.",
    inputSchema: OBJ({ cid_or_smiles: { type: "string" } }, ["cid_or_smiles"]),
    annotations: RO,
    execute: async (a) => wrap(await ops.proposeGreener(String(a.cid_or_smiles), "agent")),
  },
  {
    name: "render_recipe_card",
    description: "Export the current stage build as a downloadable recipe card: structure, properties, hazard summary, source.",
    inputSchema: OBJ({}),
    execute: async () => wrap(ops.renderRecipeCard("agent")),
  },
  {
    name: "explain",
    description: "Teach mode. Explain a chemistry concept the bench uses (SMILES, TPSA, logP, GHS, Tanimoto, polymer precursor, conformer, and more).",
    inputSchema: OBJ({ topic: { type: "string" } }, ["topic"]),
    annotations: RO,
    execute: async (a) => wrap(ops.explain(String(a.topic), "agent")),
  },
  {
    name: "get_canvas_state",
    description: "Return the full bench state as JSON: selection, stage compound, properties, hazard, similars, candidates, recent notebook entries.",
    inputSchema: OBJ({}),
    annotations: RO,
    execute: async () => wrap(ops.getCanvasState()),
  },
  {
    name: "reset_canvas",
    description: "Clear the selection and the stage.",
    inputSchema: OBJ({}),
    execute: async () => wrap(ops.resetCanvasOp("agent")),
  },
];

/** name -> execute, for the built-in operator to invoke tools the same way. */
export const TOOL_EXEC = new Map<string, Exec>(TOOLS.map((t) => [t.name, t.execute]));
export const TOOL_NAMES = TOOLS.map((t) => t.name);

// A minimal, spec-shaped document.modelContext for browsers that ship no
// native one. It stores tools and exposes getTools / executeTool / callTool /
// provideContext so any agent that reads document.modelContext (ChatGPT's
// built-in browser, Codex, Chrome) can discover and run them.
function installDocumentShim() {
  const store = new Map<string, ToolDef>();
  const descr = (t: ToolDef) => ({
    name: t.name,
    description: t.description,
    inputSchema: JSON.stringify(t.inputSchema),
    annotations: t.annotations,
  });
  const run = async (name: string, argsJson: string) => {
    const t = store.get(name);
    if (!t) return JSON.stringify({ content: [{ type: "text", text: `unknown tool ${name}` }], isError: true });
    let args: any = {};
    try { args = argsJson ? JSON.parse(argsJson) : {}; } catch { /* ignore */ }
    const res = await t.execute(args);
    return JSON.stringify(res);
  };
  const mc = {
    async registerTool(tool: ToolDef, options?: { signal?: AbortSignal }) {
      store.set(tool.name, tool);
      options?.signal?.addEventListener("abort", () => store.delete(tool.name));
      window.dispatchEvent(new CustomEvent("modelcontexttoolschange"));
    },
    unregisterTool(name: string) { store.delete(name); },
    provideContext(opts: { tools: ToolDef[] }) {
      store.clear();
      for (const t of opts.tools ?? []) store.set(t.name, t);
      window.dispatchEvent(new CustomEvent("modelcontexttoolschange"));
    },
    clearContext() { store.clear(); },
    async getTools() { return [...store.values()].map(descr); },
    listTools() { return [...store.values()].map(descr); },
    async executeTool(tool: { name: string } | string, inputArgsJson: string) {
      return run(typeof tool === "string" ? tool : tool.name, inputArgsJson);
    },
    async callTool(params: { name: string; arguments?: Record<string, unknown> }) {
      return JSON.parse(await run(params.name, JSON.stringify(params.arguments ?? {})));
    },
  };
  try {
    Object.defineProperty(document, "modelContext", { value: mc, configurable: true, writable: true });
  } catch { (document as any).modelContext = mc; }
  return mc;
}

const registeredSurfaces = new WeakSet<object>();

/**
 * Register synchronously, as early as the module loads, so an agent that scans
 * the page on document-ready already sees the tools. Safe to call repeatedly:
 * it only (re)registers on surfaces it has not seen, which catches a native
 * document.modelContext injected after our module ran.
 */
export function registerTools(): string[] {
  const surfaces: any[] = [];
  let doc = (document as any).modelContext;
  const nav = (navigator as any).modelContext;

  if (!doc?.registerTool) doc = installDocumentShim();
  if (!registeredSurfaces.has(doc)) surfaces.push(doc);
  if (nav?.registerTool && nav !== doc && !registeredSurfaces.has(nav)) surfaces.push(nav);
  if (!surfaces.length) return TOOL_NAMES;
  for (const s of surfaces) registeredSurfaces.add(s);

  let registered = 0;
  for (const mc of surfaces) {
    for (const t of TOOLS) {
      try {
        // don't await: the shim resolves immediately, and @mcp-b's promise
        // resolves on the next tick — we don't need to block on either
        void mc.registerTool({
          name: t.name, description: t.description, inputSchema: t.inputSchema,
          annotations: t.annotations, execute: t.execute,
        });
        registered++;
      } catch (e) {
        if (!/exist|duplicate/i.test(String(e))) console.warn("registerTool", t.name, e);
      }
    }
    if (typeof mc.provideContext === "function") {
      try { mc.provideContext({ tools: TOOLS }); } catch { /* ignore */ }
    }
    if (typeof mc.syncNativeTools === "function") {
      try { mc.syncNativeTools(); } catch { /* ignore */ }
    }
  }

  setWebmcp(registered > 0);
  note("agent", "WebMCP ready", `${TOOLS.length} tools on document.modelContext`);
  return TOOL_NAMES;
}

// register the moment this module is imported
try { registerTools(); } catch (e) { console.error("early registerTools failed", e); }
