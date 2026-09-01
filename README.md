# Valence

**A playable periodic table, wired to PubChem, that an AI agent can operate through WebMCP.**

Click two element keys and a real molecule assembles on the stage: 2D structure, then a
rotatable 3D conformer, live properties, and a GHS hazard badge. Or type a goal and watch
an agent do it: search PubChem, assemble candidates, check every hazard record, score them,
and put the winner on the same canvas you were touching. Every claim in the notebook links
back to the exact PubChem endpoint it came from.

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/).

---

## Why this is a WebMCP project

The value is **shared control of a live client canvas**. A backend API cannot move the
pieces on the user's screen. WebMCP can. Valence exposes sixteen typed tools on
`navigator.modelContext`; the person and the agent call the same tools and mutate the same
state, so the stage is always a single source of truth.

The built-in operator (a small heuristic planner, no API keys) drives those tools through
`navigator.modelContext.callTool` — the exact path an external agent uses. A judge in
ChatGPT's in-app browser or Chrome with WebMCP enabled drives them the same way.

### Tool surface

| Tool | Input | Effect |
|---|---|---|
| `select_elements` | `symbols[]` | Set the table selection, arm the stage |
| `combine_selection` | `stoichiometry?` | Resolve the selection to a compound via PubChem |
| `search_pubchem` | `query`, `by` | Resolve a name / formula / SMILES / InChIKey to CIDs |
| `fetch_properties` | `cid` | MW, TPSA, logP, H-bond donors/acceptors, rotatable bonds |
| `fetch_3d_conformer` | `cid` | Fetch an SDF and render a ball-and-stick model |
| `assess_hazard_profile` | `cid` | GHS signal word, pictograms, hazard statements |
| `find_similar_compounds` | `smiles`, `threshold` | 2D similarity search with a green-chemistry score |
| `industrial_viability` | `cid` | Vendor and patent counts, sourcing verdict |
| `bioactivity_bridge` | `cid` | Active assay count, tested targets, pharmacology |
| `substitute_and_compare` | `base_smiles`, `change` | Apply a substituent, report the property shift |
| `build_to_constraints` | `goal`, `constraints` | Search, hazard-check, score and rank candidates |
| `propose_greener_alternatives` | `cid_or_smiles` | Rank similar compounds by a transparent green score |
| `render_recipe_card` | — | Export the build as a PNG card |
| `explain` | `topic` | Teach mode: explain a concept the bench uses |
| `get_canvas_state` | — | Full bench state as JSON |
| `reset_canvas` | — | Clear the selection and the stage |

---

## Run it

```bash
npm install
npm run dev      # http://localhost:5199
```

```bash
npm run build && npm run preview
```

PubChem PUG REST and PUG View are called directly from the browser. If an endpoint ever
rejects CORS, set `VITE_PUBCHEM_PROXY=/api/pug` and deploy with the bundled Vercel edge
function in `api/pug/`.

## Test it as an agent would

- **ChatGPT in-app browser**, or **Chrome** with `chrome://flags/#enable-webmcp-testing`.
- Open the page. The tools register on load (the dot by the wordmark turns on).
- Ask your agent, for example: *"build a non-toxic polymer precursor using only period-2 elements"*, then *"how hazardous is it?"*, then *"find greener alternatives"*.
- Or open the console and call the tools directly:
  ```js
  await navigator.modelContext.callTool({ name: "search_pubchem", arguments: { query: "aspirin", by: "name" } });
  ```

## Demo script

1. Click **H**, then **O**. The stage arms. `combine_selection` → water; 2D settles into 3D; low hazard.
2. Type *"build a non-toxic polymer precursor using only period-2 elements"*. The agent traces the period-2 keys, searches PubChem, checks the GHS record on every candidate, scores them, and stages 1,3-propanediol with three ranked options and a cited notebook trail.
3. Type *"find greener alternatives"* on a flagged solvent. Three options with a transparent scorecard.
4. **Export** the recipe card. Show the notebook, every line linked to a PubChem CID.

---

## Stack

Vite + TypeScript, no framework. [`@mcp-b/global`](https://www.npmjs.com/package/@mcp-b/global)
for the `navigator.modelContext` runtime, [3Dmol.js](https://3dmol.csb.pitt.edu/) for the 3D
viewer, [smiles-drawer](https://github.com/reymond-group/smilesDrawer) for 2D structures.
Data from [PubChem](https://pubchem.ncbi.nlm.nih.gov/) (PUG REST + PUG View).

`docs/Valence-chemistry-primer.docx` is a plain-language refresher on every concept the
bench surfaces; `src/data/glossary.ts` is the teach-mode subset.

## License

MIT. See [LICENSE](LICENSE).
