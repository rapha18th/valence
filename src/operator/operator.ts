// The built-in operator. Not an LLM. It reads the command-bar text, picks a
// tool chain, and runs the same tool executes an external agent (ChatGPT,
// Codex, Chrome) invokes through document.modelContext. Identical behaviour.

import { getState, setStatus, note, activity } from "../store/store.ts";
import { BY_SYMBOL } from "../data/elements.ts";
import { toast } from "../ui/toasts.ts";
import { invokeTool } from "../webmcp/invoke.ts";

const call = invokeTool;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// element-symbol + count formula, e.g. "CO2", "H2SO4", "C6H12O6"
function parseFormula(s: string): Record<string, number> | null {
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

export async function runOperator(text: string) {
  const t = text.trim();
  const low = t.toLowerCase();
  note("person", "Asked", t);
  setStatus(`Agent: reading "${t}"…`);

  try {
    // ---- headline: constraint-solved build ----
    if (/\b(build|design|make|find)\b.*\b(precursor|monomer|polymer|solvent|surfactant)\b/.test(low)
        || /\bpolymer precursor\b/.test(low)) {
      const periodM = low.match(/period[\s-]?(\d)/);
      const onlyM = low.match(/only\s+([a-z,\s and]+?)(?:\.|$)/);
      const constraints: Record<string, unknown> = {};
      if (periodM) constraints.period = Number(periodM[1]);
      else if (onlyM) {
        const syms = onlyM[1].split(/[,\s]+|and/).map((s) => cap(s)).filter((s) => BY_SYMBOL[s]);
        if (syms.length) constraints.elements = syms;
      }
      if (/non[\s-]?toxic|less toxic|safe|green/.test(low)) constraints.nonToxic = true;
      const startText = await call("build_to_constraints", { goal: t, constraints });
      const jobId = /\b(bld_[a-z0-9]+)\b/.exec(startText)?.[1];
      // stream status: poll the same tool an external agent would
      let last = "";
      for (let i = 0; i < 80; i++) {
        await sleep(500);
        const st = await call("get_build_status", jobId ? { jobId } : {});
        last = st;
        const b = getState().build;
        if (b && b.status !== "running") break;
      }
      const b = getState().build;
      if (b?.status === "done") {
        toast(b.partial ? "Build ranked (partial — time budget)." : "Build ranked. See the panel.");
        setStatus(`Agent: build ${b.id} complete.`);
      } else if (b?.status === "cancelled") {
        toast("Build stopped.");
      }
      return last.split("\n")[0] || startText;
    }

    // ---- greener alternatives ----
    if (/green(er)?|less toxic|safer alternative|alternatives?/.test(low)) {
      const cid = getState().props?.cid;
      const named = low.match(/to\s+([a-z0-9-]+)/);
      const arg = cid ? String(cid) : named ? named[1] : "";
      if (!arg) return say("Load a compound first, then ask for greener alternatives.");
      const out = await call("propose_greener_alternatives", { cid_or_smiles: arg });
      toast("Greener options ranked.");
      return out;
    }

    // ---- compare: "compare A and B", "A vs B", "aspirin versus ibuprofen" ----
    const vs = t.match(/^\s*compare\s+(.+?)\s+(?:and|with|to|vs\.?|versus)\s+(.+?)\s*$/i)
      ?? t.match(/^\s*(.+?)\s+(?:vs\.?|versus)\s+(.+?)\s*$/i);
    if (vs) {
      const a = vs[1].trim(), b = vs[2].trim();
      const cur = getState().props;
      const resolvedA = /^(this|it|current)$/i.test(a) && cur ? cur.name : a;
      return await call("compare_compounds", { a: resolvedA, b });
    }
    if (/^close (the )?comparison$|^(exit|leave) compare/i.test(low)) {
      return await call("close_comparison", {});
    }

    // ---- bond check: "will Na and Cl bond", "does helium react with oxygen" ----
    if (/\b(bond|react|combine|join)\b/.test(low) && /\b(will|do(es)?|can|why)\b/.test(low)) {
      const syms = (t.match(/[A-Z][a-z]?/g) ?? []).filter((s) => BY_SYMBOL[s]);
      if (syms.length >= 2) return await call("predict_bond", { symbols: syms });
      if (getState().selection.length >= 2) return await call("predict_bond", {});
    }

    // ---- explain / teach ----
    if (/^(explain|what is|what's|define|teach me|tell me about)\b/.test(low)) {
      const topic = low.replace(/^(explain|what is|what's|define|teach me|tell me about)\b/, "").replace(/[?.]/g, "").trim();
      // if a compound is on the stage and the topic names it, describe the compound
      const p = getState().props;
      if (p && (topic === "" || p.name.toLowerCase().includes(topic) || topic.includes(p.name.toLowerCase()) || /this|it/.test(topic))) {
        return await call("describe_compound", { cid: p.cid });
      }
      return await call("explain", { topic });
    }

    // ---- uses ----
    if (/what.*(used for|use of|application)|industrial use|consumer use/.test(low)) {
      const cid = getState().props?.cid;
      if (!cid) return say("Load a compound first, then ask what it is used for.");
      return await call("industrial_uses", { cid });
    }

    // ---- combine named elements / make X / make CO2 ----
    const makeM = t.match(/\b(make|combine|build|assemble|show me|render)\b\s+(.+)/i);
    if (makeM) {
      const rest = makeM[2].replace(/[?.!]+$/, "").trim();

      // a bare chemical formula like "CO2", "H2O", "C6H12O6"
      const oneToken = rest.split(/\s+/).length === 1 ? rest : "";
      const formula = oneToken ? parseFormula(oneToken) : null;
      if (formula) {
        await call("select_elements", { symbols: Object.keys(formula) });
        let out = await call("combine_selection", { stoichiometry: formula });
        if (!getState().props) out = await call("search_pubchem", { query: oneToken, by: "formula" });
        const cid = getState().props?.cid;
        if (cid) { await call("fetch_3d_conformer", { cid }); await call("assess_hazard_profile", { cid }); }
        return out;
      }

      // a space/plus separated element list like "H O" or "Na + Cl"
      const parts = rest.split(/[\s,+]+/).filter(Boolean);
      const asSyms = parts.map(cap);
      if (asSyms.length >= 1 && asSyms.every((w) => BY_SYMBOL[w])) {
        await call("select_elements", { symbols: asSyms });
        const out = await call("combine_selection", {});
        const cid = getState().props?.cid;
        if (cid) { await call("fetch_3d_conformer", { cid }); await call("assess_hazard_profile", { cid }); }
        return out;
      }

      // otherwise treat it as a compound name; fall back to a formula search
      let out = await call("search_pubchem", { query: rest, by: "name" });
      if (!getState().props && /^[A-Za-z0-9()]+$/.test(rest)) {
        out = await call("search_pubchem", { query: rest, by: "formula" });
      }
      const cid = getState().props?.cid;
      if (cid) { await call("fetch_3d_conformer", { cid }); await call("assess_hazard_profile", { cid }); }
      return out;
    }

    // ---- 3D / hazard / sourcing / similar / recipe on the current compound ----
    const cid = getState().props?.cid;
    if (/\b3d\b|three.dimension|conformer|rotate/.test(low) && cid) return await call("fetch_3d_conformer", { cid });
    if (/hazard|toxic|danger|safety|ghs/.test(low) && cid) return await call("assess_hazard_profile", { cid });
    if (/vendor|sourc|buy|patent|viab|commercial/.test(low) && cid) return await call("industrial_viability", { cid });
    if (/bioactiv|assay|target|pharmacolog/.test(low) && cid) return await call("bioactivity_bridge", { cid });
    if (/similar|analog|like this/.test(low)) {
      const smiles = getState().props?.smiles;
      if (smiles) return await call("find_similar_compounds", { smiles });
    }
    if (/recipe card|export|save.*card/.test(low)) return await call("render_recipe_card", {});

    // ---- search fallthrough ----
    const searchM = low.match(/\b(show|load|open|find)\s+(.+)/);
    if (searchM) {
      const q = searchM[2].replace(/[?.]/g, "").trim();
      const out = await call("search_pubchem", { query: q, by: /^[a-z0-9@+\-[\]()=#]+$/i.test(q) && /[=#()]/.test(q) ? "smiles" : "name" });
      const c = getState().props?.cid;
      if (c) { await call("fetch_3d_conformer", { cid: c }); await call("assess_hazard_profile", { cid: c }); }
      return out;
    }

    return say("Try: \"will sodium and chlorine bond\", \"make CO2\", \"aspirin vs ibuprofen\", \"build a non-toxic polymer precursor from period-2 elements\", \"how hazardous is this\", \"what is it used for\", \"find greener alternatives\", \"explain TPSA\". Your own agent can call any of the 21 tools on document.modelContext directly.");
  } catch (e) {
    activity({ kind: "done", label: "Agent: hit an error." });
    setStatus("Agent: error — see console.");
    console.error(e);
    return say(`Something failed: ${(e as Error).message}`);
  }
}

function cap(s: string): string {
  s = s.trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

function say(msg: string): string {
  note("agent", "Note", msg);
  setStatus(msg.length > 80 ? msg.slice(0, 79) + "…" : msg);
  toast(msg, 4000);
  return msg;
}
