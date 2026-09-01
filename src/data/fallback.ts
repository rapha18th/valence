// A tiny offline set for the most common compounds, so the core loop keeps
// working during a PubChem outage. Live PubChem data always takes precedence;
// this only fills in when a request returns nothing.
import type { MoleculeProps } from "../store/types.ts";

type F = MoleculeProps & { aliases: string[] };

export const FALLBACK: F[] = [
  { cid: 962, name: "Water", formula: "H2O", smiles: "O", weight: 18.015, tpsa: 1, xlogp: -0.5, hbd: 1, hba: 1, rotatable: 0, complexity: 0, aliases: ["water", "h2o", "ho", "dihydrogen monoxide"] },
  { cid: 280, name: "Carbon Dioxide", formula: "CO2", smiles: "C(=O)=O", weight: 44.009, tpsa: 34.1, xlogp: 0.8, hbd: 0, hba: 2, rotatable: 0, complexity: 18.3, aliases: ["carbon dioxide", "co2", "coo"] },
  { cid: 297, name: "Methane", formula: "CH4", smiles: "C", weight: 16.043, tpsa: 0, xlogp: 0.6, hbd: 0, hba: 0, rotatable: 0, complexity: 0, aliases: ["methane", "ch4"] },
  { cid: 702, name: "Ethanol", formula: "C2H6O", smiles: "CCO", weight: 46.07, tpsa: 20.2, xlogp: -0.1, hbd: 1, hba: 1, rotatable: 0, complexity: 2.8, aliases: ["ethanol", "ethyl alcohol", "c2h6o", "alcohol"] },
  { cid: 222, name: "Ammonia", formula: "H3N", smiles: "N", weight: 17.031, tpsa: 1, xlogp: -1.1, hbd: 1, hba: 1, rotatable: 0, complexity: 0, aliases: ["ammonia", "nh3", "h3n"] },
  { cid: 313, name: "Hydrochloric Acid", formula: "ClH", smiles: "Cl", weight: 36.46, tpsa: 0, xlogp: 0.3, hbd: 1, hba: 0, rotatable: 0, complexity: 0, aliases: ["hydrochloric acid", "hydrogen chloride", "hcl", "clh"] },
  { cid: 5234, name: "Sodium Chloride", formula: "ClNa", smiles: "[Na+].[Cl-]", weight: 58.44, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["sodium chloride", "salt", "nacl", "clna"] },
  { cid: 241, name: "Benzene", formula: "C6H6", smiles: "c1ccccc1", weight: 78.11, tpsa: 0, xlogp: 2.1, hbd: 0, hba: 0, rotatable: 0, complexity: 15.5, aliases: ["benzene", "c6h6"] },
  { cid: 2519, name: "Caffeine", formula: "C8H10N4O2", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", weight: 194.19, tpsa: 58.4, xlogp: -0.1, hbd: 0, hba: 3, rotatable: 0, complexity: 293, aliases: ["caffeine", "c8h10n4o2"] },
  { cid: 2244, name: "Aspirin", formula: "C9H8O4", smiles: "CC(=O)OC1=CC=CC=C1C(=O)O", weight: 180.16, tpsa: 63.6, xlogp: 1.2, hbd: 1, hba: 4, rotatable: 3, complexity: 212, aliases: ["aspirin", "acetylsalicylic acid", "c9h8o4"] },
  { cid: 5793, name: "D-Glucose", formula: "C6H12O6", smiles: "C(C1C(C(C(C(O1)O)O)O)O)O", weight: 180.16, tpsa: 110, xlogp: -2.6, hbd: 5, hba: 6, rotatable: 1, complexity: 151, aliases: ["glucose", "d-glucose", "dextrose", "c6h12o6"] },
  { cid: 10442, name: "1,3-Propanediol", formula: "C3H8O2", smiles: "C(CO)CO", weight: 76.09, tpsa: 40.5, xlogp: -1, hbd: 2, hba: 2, rotatable: 2, complexity: 18.3, aliases: ["1,3-propanediol", "propane-1,3-diol", "trimethylene glycol", "c3h8o2"] },
  { cid: 174, name: "Ethylene Glycol", formula: "C2H6O2", smiles: "C(CO)O", weight: 62.07, tpsa: 40.5, xlogp: -1.4, hbd: 2, hba: 2, rotatable: 1, complexity: 8.9, aliases: ["ethylene glycol", "ethane-1,2-diol", "c2h6o2"] },
  { cid: 612, name: "Glycolic Acid", formula: "C2H4O3", smiles: "C(C(=O)O)O", weight: 76.05, tpsa: 57.5, xlogp: -1.1, hbd: 2, hba: 3, rotatable: 1, complexity: 51.4, aliases: ["glycolic acid", "hydroxyacetic acid", "c2h4o3"] },
  { cid: 6106, name: "Toluene", formula: "C7H8", smiles: "Cc1ccccc1", weight: 92.14, tpsa: 0, xlogp: 2.7, hbd: 0, hba: 0, rotatable: 0, complexity: 38.9, aliases: ["toluene", "methylbenzene", "c7h8"] },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function fallbackFind(query: string): F | undefined {
  const q = norm(query);
  return FALLBACK.find((f) => norm(f.name) === q || norm(f.formula) === q || f.aliases.includes(q));
}
export function fallbackByCid(cid: number): F | undefined {
  return FALLBACK.find((f) => f.cid === cid);
}
