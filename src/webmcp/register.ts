// Registers Valence's tool surface on navigator.modelContext via @mcp-b/global.
// Every tool is a thin wrapper over an ops function; both an external agent
// (ChatGPT / Chrome) and the built-in operator call these the same way.

import "@mcp-b/global";
import { setWebmcp, note } from "../store/store.ts";
import * as ops from "./ops.ts";
import type { ResolveBy } from "../pubchem/parse.ts";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function wrap(res: { ok: boolean; text: string }): ToolResult {
  return { content: [{ type: "text", text: res.text }], isError: !res.ok };
}

const OBJ = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties: props, required,
});

export function registerTools() {
  const mc = navigator.modelContext;
  if (!mc) {
    console.warn("navigator.modelContext unavailable; WebMCP tools not registered.");
    return;
  }

  const tools = [
    {
      name: "select_elements",
      description: "Set the periodic-table selection. Arms the assembly stage. Symbols are case-sensitive element symbols like H, Na, Cl.",
      inputSchema: OBJ({ symbols: { type: "array", items: { type: "string" }, description: "Element symbols to select" } }, ["symbols"]),
      execute: async (a: any) => wrap(ops.selectElements(a.symbols ?? [], "agent")),
    },
    {
      name: "combine_selection",
      description: "Resolve the current element selection to a real compound via PubChem and render it on the stage. Optionally pass stoichiometry to fix the ratio.",
      inputSchema: OBJ({
        stoichiometry: { type: "object", additionalProperties: { type: "integer", minimum: 1 }, description: 'Symbol to count, e.g. { "H": 2, "O": 1 }' },
      }),
      execute: async (a: any) => wrap(await ops.combineSelection(a.stoichiometry, "agent")),
    },
    {
      name: "search_pubchem",
      description: "Resolve a name, formula, SMILES, or InChIKey to PubChem compound IDs and load the top hit.",
      inputSchema: OBJ({
        query: { type: "string" },
        by: { type: "string", enum: ["name", "formula", "smiles", "inchikey"] },
      }, ["query", "by"]),
      execute: async (a: any) => wrap(await ops.searchPubchem(String(a.query), a.by as ResolveBy, "agent")),
    },
    {
      name: "fetch_properties",
      description: "Fetch molecular properties for a PubChem CID: weight, TPSA, logP, H-bond donors/acceptors, rotatable bonds.",
      inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
      execute: async (a: any) => wrap(await ops.fetchProperties(Number(a.cid), "agent")),
    },
    {
      name: "fetch_3d_conformer",
      description: "Fetch a 3D conformer (SDF) for a CID from PubChem and render a rotatable ball-and-stick model on the stage.",
      inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
      execute: async (a: any) => wrap(await ops.fetch3dConformer(Number(a.cid), "agent")),
    },
    {
      name: "assess_hazard_profile",
      description: "Read the GHS hazard classification for a CID and render a hazard badge: signal word, pictograms, hazard statements.",
      inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
      execute: async (a: any) => wrap(await ops.assessHazard(Number(a.cid), "agent")),
    },
    {
      name: "find_similar_compounds",
      description: "Run a 2D similarity search against PubChem for a SMILES and show the top matches with a green-chemistry score.",
      inputSchema: OBJ({
        smiles: { type: "string" },
        threshold: { type: "integer", minimum: 50, maximum: 100, default: 90, description: "Tanimoto percent" },
        limit: { type: "integer", minimum: 1, maximum: 8, default: 3 },
      }, ["smiles"]),
      execute: async (a: any) => wrap(await ops.findSimilar(String(a.smiles), Number(a.threshold ?? 90), Number(a.limit ?? 3), "agent")),
    },
    {
      name: "industrial_viability",
      description: "Estimate how sourceable a compound is: vendor count and linked patent count from PubChem, with a plain-language verdict.",
      inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
      execute: async (a: any) => wrap(await ops.industrialViability(Number(a.cid), "agent")),
    },
    {
      name: "bioactivity_bridge",
      description: "Summarise a compound's bioassay history from PubChem: active assay count, tested targets, pharmacology notes.",
      inputSchema: OBJ({ cid: { type: "integer", minimum: 1 } }, ["cid"]),
      execute: async (a: any) => wrap(await ops.bioactivityBridge(Number(a.cid), "agent")),
    },
    {
      name: "substitute_and_compare",
      description: "Apply a substituent change to a SMILES (one of -OH, -CH3, -F, -NH2, -COOH, or a full target SMILES) and report how the properties move.",
      inputSchema: OBJ({
        base_smiles: { type: "string" },
        change: { type: "string", description: "-OH | -CH3 | -F | -NH2 | -COOH, or a full replacement SMILES" },
      }, ["base_smiles", "change"]),
      execute: async (a: any) => wrap(await ops.substituteAndCompare(String(a.base_smiles), String(a.change), "agent")),
    },
    {
      name: "build_to_constraints",
      description: "The headline flow. Given a goal (e.g. 'non-toxic polymer precursor') and constraints (allowed elements or a period number, weight/logP caps, non-toxic), search PubChem, score candidates, rank the top three, and put the winner on the stage.",
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
      execute: async (a: any) => wrap(await ops.buildToConstraints(String(a.goal), a.constraints ?? {}, "agent")),
    },
    {
      name: "propose_greener_alternatives",
      description: "Given a CID or SMILES, find structurally similar compounds and rank them by a transparent green-chemistry score (hazard-linked properties).",
      inputSchema: OBJ({ cid_or_smiles: { type: "string" } }, ["cid_or_smiles"]),
      execute: async (a: any) => wrap(await ops.proposeGreener(String(a.cid_or_smiles), "agent")),
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
      execute: async (a: any) => wrap(ops.explain(String(a.topic), "agent")),
    },
    {
      name: "get_canvas_state",
      description: "Return the full bench state as JSON: selection, stage compound, properties, hazard, similars, candidates, recent notebook entries.",
      inputSchema: OBJ({}),
      execute: async () => wrap(ops.getCanvasState()),
    },
    {
      name: "reset_canvas",
      description: "Clear the selection and the stage.",
      inputSchema: OBJ({}),
      execute: async () => wrap(ops.resetCanvasOp("agent")),
    },
  ];

  mc.provideContext({ tools });
  setWebmcp(true);
  note("agent", "WebMCP ready", `${tools.length} tools registered on navigator.modelContext`);

  // reflect external agent calls in the status line
  return tools.map((t) => t.name);
}
