// Client-side bonding prediction. No PubChem: this is the textbook reasoning a
// first-year student uses. It answers "will these combine, and why?" so a
// beginner can explore the table without guessing.

import { BY_SYMBOL } from "../data/elements.ts";
import type { ElementDef, BondPrediction } from "../store/types.ts";

type Verdict = BondPrediction["verdict"];
export type { BondPrediction };

const METALS = new Set(["alkali-metal", "alkaline-earth", "transition-metal", "post-transition", "lanthanide", "actinide"]);
const isMetal = (e: ElementDef) => METALS.has(e.category);
const isNoble = (e: ElementDef) => e.category === "noble-gas";

/** typical number of covalent bonds an atom forms */
function valenceOf(e: ElementDef): number {
  const s = e.symbol;
  if (s === "H" || s === "F" || s === "Cl" || s === "Br" || s === "I") return 1;
  if (s === "O" || s === "S") return 2;
  if (s === "N" || s === "P") return 3;
  if (s === "C" || s === "Si") return 4;
  if (e.category === "alkali-metal") return 1;
  if (e.category === "alkaline-earth") return 2;
  if (s === "B" || s === "Al") return 3;
  // fall back to the smallest positive oxidation state
  const pos = e.oxidationStates.filter((n) => n > 0).sort((a, b) => a - b)[0];
  return pos ?? 1;
}

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }

/** criss-cross formula from two valences, e.g. H(1)+O(2) -> H2O */
function crissCross(a: ElementDef, b: ElementDef): string {
  let va = valenceOf(a), vb = valenceOf(b);
  const g = gcd(va, vb) || 1;
  va /= g; vb /= g;
  // heavier/less electronegative first, matching how formulae are written
  const [x, nx, y, ny] = (a.electronegativity ?? 0) <= (b.electronegativity ?? 0)
    ? [a.symbol, vb, b.symbol, va]
    : [b.symbol, va, a.symbol, vb];
  return `${x}${nx > 1 ? nx : ""}${y}${ny > 1 ? ny : ""}`;
}

function diatomic(sym: string): string | null {
  if (["H", "N", "O", "F", "Cl", "Br", "I"].includes(sym)) return `${sym}2`;
  return null;
}

export function predictBond(rawSymbols: string[]): BondPrediction {
  const symbols = rawSymbols.map((s) => s.trim()).filter((s) => BY_SYMBOL[s]);
  const uniq = [...new Set(symbols)];

  if (symbols.length < 2) {
    return { symbols, verdict: "maybe", bondType: "none", formula: null, enDiff: null,
      why: "Pick at least two element keys to see whether they bond." };
  }

  // same element, selected twice -> diatomic / monatomic
  if (uniq.length === 1) {
    const e = BY_SYMBOL[uniq[0]];
    const d = diatomic(e.symbol);
    if (isNoble(e)) {
      return { symbols, verdict: "no-bond", bondType: "none", formula: e.symbol, enDiff: 0,
        why: `${e.name} is a noble gas. Its outer shell is already full, so its atoms drift alone as a monatomic gas.` };
    }
    if (d) {
      return { symbols, verdict: "bond", bondType: "nonpolar-covalent", formula: d, enDiff: 0,
        why: `Two ${e.name.toLowerCase()} atoms have the same pull on electrons, so they share one or more pairs evenly and travel as ${d}.` };
    }
    return { symbols, verdict: "alloy", bondType: "metallic", formula: null, enDiff: 0,
      why: `A block of ${e.name.toLowerCase()} is held together by a shared sea of electrons flowing between fixed cores.` };
  }

  // work with the first two distinct elements
  const a = BY_SYMBOL[uniq[0]];
  const b = BY_SYMBOL[uniq[1]];
  const extra = uniq.length > 2 ? ` (ignoring ${uniq.slice(2).join(", ")} for this pair)` : "";

  // noble gas involved
  if (isNoble(a) || isNoble(b)) {
    const ng = isNoble(a) ? a : b;
    const other = isNoble(a) ? b : a;
    if ((ng.symbol === "Xe" || ng.symbol === "Kr") && ["F", "O"].includes(other.symbol)) {
      return { symbols, verdict: "maybe", bondType: "polar-covalent",
        formula: `${ng.symbol}${other.symbol}2`, enDiff: enDiff(a, b),
        why: `${ng.name} normally will not react, but fluorine and oxygen pull hard enough to force a bond under harsh lab conditions (for example XeF2, XeF4).`,
        note: "Edge case: needs high pressure or an electric discharge." };
    }
    return { symbols, verdict: "no-bond", bondType: "none", formula: null, enDiff: enDiff(a, b),
      why: `${ng.name} has a full outer shell, so there is no electron gap to close. It does not bond with ${other.name.toLowerCase()} under normal conditions.${extra}` };
  }

  const dEN = enDiff(a, b);
  const bothMetal = isMetal(a) && isMetal(b);
  const metalNonmetal = isMetal(a) !== isMetal(b);

  if (bothMetal) {
    return { symbols, verdict: "alloy", bondType: "metallic", formula: null, enDiff: dEN,
      why: `${a.name} and ${b.name} are both metals. They pool their outer electrons and mix as an alloy (think brass or bronze) rather than forming a fixed compound.${extra}` };
  }

  const formula = crissCross(a, b);
  const [low, high] = (a.electronegativity ?? 0) <= (b.electronegativity ?? 0) ? [a, b] : [b, a];

  if (dEN !== null && dEN >= 1.7 && metalNonmetal) {
    return { symbols, verdict: "bond", bondType: "ionic", formula, enDiff: dEN,
      why: `${low.name} holds its outer electrons loosely; ${high.name} pulls hard (electronegativity gap ${dEN.toFixed(1)}). ${low.name} gives electrons away to become a positive ion, ${high.name} takes them to become negative, and the opposite charges lock together as ${formula}.${extra}` };
  }
  if (dEN !== null && dEN >= 0.4) {
    return { symbols, verdict: "bond", bondType: "polar-covalent", formula, enDiff: dEN,
      why: `${a.name} and ${b.name} share electrons, but ${high.name} pulls harder (gap ${dEN.toFixed(1)}), so each bond is polar. The likely formula is ${formula}; whether the whole molecule is polar also depends on its shape.${extra}` };
  }
  return { symbols, verdict: "bond", bondType: "nonpolar-covalent", formula, enDiff: dEN,
    why: `${a.name} and ${b.name} pull on electrons about equally (gap ${dEN === null ? "unknown" : dEN.toFixed(1)}), so they share evenly in a nonpolar covalent bond. The likely formula is ${formula}.${extra}` };
}

function enDiff(a: ElementDef, b: ElementDef): number | null {
  if (a.electronegativity == null || b.electronegativity == null) return null;
  return Math.abs(a.electronegativity - b.electronegativity);
}

export function bondVerdictGlyph(v: Verdict): string {
  return v === "bond" ? "✓" : v === "no-bond" ? "✕" : v === "alloy" ? "≈" : "?";
}
