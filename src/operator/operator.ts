// The built-in operator. Not an LLM. It reads the command-bar text, picks a
// tool chain, and runs it through navigator.modelContext.callTool — the exact
// path an external agent (ChatGPT, Chrome) uses. Judges can also drive the
// same tools from their own agent and see identical behaviour.

import { getState, setStatus, note, activity } from "../store/store.ts";
import { BY_SYMBOL } from "../data/elements.ts";
import { toast } from "../ui/toasts.ts";

async function call(name: string, args: Record<string, unknown> = {}) {
  const mc = navigator.modelContext;
  if (!mc) throw new Error("WebMCP not ready");
  const r = await mc.callTool({ name, arguments: args });
  return r.content?.[0]?.text ?? "";
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
      const out = await call("build_to_constraints", { goal: t, constraints });
      toast("Build ranked. See the notebook.");
      setStatus("Agent: build complete.");
      return out;
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

    // ---- explain / teach ----
    if (/^(explain|what is|what's|define|teach me)\b/.test(low)) {
      const topic = low.replace(/^(explain|what is|what's|define|teach me)\b/, "").replace(/[?.]/g, "").trim();
      return await call("explain", { topic });
    }

    // ---- combine named elements / make X ----
    const makeM = t.match(/\b(make|combine|build|assemble)\b\s+(.+)/i);
    if (makeM) {
      const rest = makeM[2].replace(/[?.]+$/, "").trim();
      // element tokens: capitalised symbols, optionally with a count
      const named: Record<string, number> = {};
      let explicitCounts = false;
      for (const m of rest.matchAll(/(\d+)?\s*([A-Z][a-z]?)(?![a-z])/g)) {
        if (BY_SYMBOL[m[2]]) {
          if (m[1]) explicitCounts = true;
          named[m[2]] = (named[m[2]] ?? 0) + (m[1] ? Number(m[1]) : 1);
        }
      }
      const looksElemental = Object.keys(named).length >= 1 &&
        rest.replace(/[\dA-Za-z\s,+]/g, "").length === 0 &&
        rest.split(/[\s,+]+/).every((w) => !w || BY_SYMBOL[cap(w)] || /^\d+$/.test(w));

      if (looksElemental) {
        await call("select_elements", { symbols: Object.keys(named) });
        const out = await call("combine_selection", explicitCounts ? { stoichiometry: named } : {});
        const cid = getState().props?.cid;
        if (cid) { await call("fetch_3d_conformer", { cid }); await call("assess_hazard_profile", { cid }); }
        return out;
      }
      // otherwise treat it as a compound name
      const out = await call("search_pubchem", { query: rest, by: "name" });
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

    return say(`I can: build to constraints, find greener alternatives, combine elements, fetch 3D, assess hazard, check sourcing, explain a concept. Your own agent can call any of the ${navigator.modelContext?.listTools().length ?? 16} tools directly.`);
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
