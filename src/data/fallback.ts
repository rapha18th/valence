// A tiny offline set for the most common compounds, so the core loop keeps
// working during a PubChem outage. Live PubChem data always takes precedence;
// this only fills in when a request returns nothing. The small molecules also
// carry a hand-built 3D geometry so the stage can still show a model.
import type { MoleculeProps, HazardSeverity, HazardPictogram } from "../store/types.ts";

// a compact GHS summary carried offline for the build_to_constraints seeds, so
// the hazard-aware ranking still differentiates when PubChem's GHS endpoint is
// down. Expanded into a full HazardProfile in pubchem/parse.ts.
export interface BundledGhs {
  signal: "Danger" | "Warning" | null;
  severity: HazardSeverity;
  hcodes: string[];
  pictograms?: HazardPictogram[];
}

type F = MoleculeProps & { aliases: string[]; sdf3d?: string; ghs?: BundledGhs };

// textbook 3D geometries (V2000) for the simplest molecules
const SDF: Record<number, string> = {
  962: "\n     Valence-3D\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n    0.7590    0.5870    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.7590    0.5870    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  1  3  1  0\nM  END\n",
  280: "\n     Valence-3D\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.1600    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n   -1.1600    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  2  0\n  1  3  2  0\nM  END\n",
  297: "\n     Valence-3D\n\n  5  4  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    0.6290    0.6290    0.6290 H   0  0  0  0  0  0  0  0  0  0  0  0\n    0.6290   -0.6290   -0.6290 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.6290    0.6290   -0.6290 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.6290   -0.6290    0.6290 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  1  3  1  0\n  1  4  1  0\n  1  5  1  0\nM  END\n",
  222: "\n     Valence-3D\n\n  4  3  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.1200 N   0  0  0  0  0  0  0  0  0  0  0  0\n    0.9400    0.0000   -0.2700 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.4700    0.8140   -0.2700 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.4700   -0.8140   -0.2700 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  1  3  1  0\n  1  4  1  0\nM  END\n",
  313: "\n     Valence-3D\n\n  2  1  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n    1.2700    0.0000    0.0000 Cl  0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\nM  END\n",
  402: "\n     Valence-3D\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 S   0  0  0  0  0  0  0  0  0  0  0  0\n    0.9640    0.9310    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n   -0.9640    0.9310    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  1  3  1  0\nM  END\n",
};

export const FALLBACK: F[] = [
  { cid: 962, name: "Water", formula: "H2O", smiles: "O", weight: 18.015, tpsa: 1, xlogp: -0.5, hbd: 1, hba: 1, rotatable: 0, complexity: 0, aliases: ["water", "h2o", "ho", "oh", "dihydrogen monoxide"], sdf3d: SDF[962] },
  { cid: 280, name: "Carbon Dioxide", formula: "CO2", smiles: "C(=O)=O", weight: 44.009, tpsa: 34.1, xlogp: 0.8, hbd: 0, hba: 2, rotatable: 0, complexity: 18.3, aliases: ["carbon dioxide", "co2", "coo", "oco"], sdf3d: SDF[280] },
  { cid: 297, name: "Methane", formula: "CH4", smiles: "C", weight: 16.043, tpsa: 0, xlogp: 0.6, hbd: 0, hba: 0, rotatable: 0, complexity: 0, aliases: ["methane", "ch4"], sdf3d: SDF[297] },
  { cid: 702, name: "Ethanol", formula: "C2H6O", smiles: "CCO", weight: 46.07, tpsa: 20.2, xlogp: -0.1, hbd: 1, hba: 1, rotatable: 0, complexity: 2.8, aliases: ["ethanol", "ethyl alcohol", "c2h6o", "alcohol", "cco", "drinking alcohol", "spirits", "surgical spirit", "denatured alcohol", "grain alcohol"] },
  { cid: 222, name: "Ammonia", formula: "H3N", smiles: "N", weight: 17.031, tpsa: 1, xlogp: -1.1, hbd: 1, hba: 1, rotatable: 0, complexity: 0, aliases: ["ammonia", "nh3", "h3n"], sdf3d: SDF[222] },
  { cid: 313, name: "Hydrochloric Acid", formula: "ClH", smiles: "Cl", weight: 36.46, tpsa: 0, xlogp: 0.3, hbd: 1, hba: 0, rotatable: 0, complexity: 0, aliases: ["hydrochloric acid", "hydrogen chloride", "hcl", "clh"], sdf3d: SDF[313] },
  { cid: 402, name: "Hydrogen Sulfide", formula: "H2S", smiles: "S", weight: 34.08, tpsa: 1, xlogp: 0.4, hbd: 1, hba: 0, rotatable: 0, complexity: 0, aliases: ["hydrogen sulfide", "h2s", "hs", "sh2"], sdf3d: SDF[402] },
  { cid: 5234, name: "Sodium Chloride", formula: "ClNa", smiles: "[Na+].[Cl-]", weight: 58.44, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["sodium chloride", "salt", "nacl", "clna", "table salt"] },
  { cid: 241, name: "Benzene", formula: "C6H6", smiles: "c1ccccc1", weight: 78.11, tpsa: 0, xlogp: 2.1, hbd: 0, hba: 0, rotatable: 0, complexity: 15.5, aliases: ["benzene", "c6h6"] },
  { cid: 2519, name: "Caffeine", formula: "C8H10N4O2", smiles: "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", weight: 194.19, tpsa: 58.4, xlogp: -0.1, hbd: 0, hba: 3, rotatable: 0, complexity: 293, aliases: ["caffeine", "c8h10n4o2"] },
  { cid: 2244, name: "Aspirin", formula: "C9H8O4", smiles: "CC(=O)OC1=CC=CC=C1C(=O)O", weight: 180.16, tpsa: 63.6, xlogp: 1.2, hbd: 1, hba: 4, rotatable: 3, complexity: 212, aliases: ["aspirin", "acetylsalicylic acid", "c9h8o4"] },
  { cid: 5793, name: "D-Glucose", formula: "C6H12O6", smiles: "C(C1C(C(C(C(O1)O)O)O)O)O", weight: 180.16, tpsa: 110, xlogp: -2.6, hbd: 5, hba: 6, rotatable: 1, complexity: 151, aliases: ["glucose", "d-glucose", "dextrose", "c6h12o6"] },
  { cid: 10442, name: "1,3-Propanediol", formula: "C3H8O2", smiles: "C(CO)CO", weight: 76.09, tpsa: 40.5, xlogp: -1, hbd: 2, hba: 2, rotatable: 2, complexity: 18.3, aliases: ["1,3-propanediol", "propane-1,3-diol", "trimethylene glycol", "c3h8o2", "pdo"], ghs: { signal: null, severity: "none", hcodes: [] } },
  { cid: 174, name: "Ethylene Glycol", formula: "C2H6O2", smiles: "C(CO)O", weight: 62.07, tpsa: 40.5, xlogp: -1.4, hbd: 2, hba: 2, rotatable: 1, complexity: 8.9, aliases: ["ethylene glycol", "ethane-1,2-diol", "c2h6o2", "occo"], ghs: { signal: "Warning", severity: "moderate", hcodes: ["H302", "H373"], pictograms: ["GHS07", "GHS08"] } },
  { cid: 757, name: "Lactic Acid", formula: "C3H6O3", smiles: "CC(C(=O)O)O", weight: 90.08, tpsa: 57.5, xlogp: -0.7, hbd: 2, hba: 3, rotatable: 1, complexity: 74.9, aliases: ["lactic acid", "2-hydroxypropanoic acid", "c3h6o3"], ghs: { signal: "Danger", severity: "high", hcodes: ["H315", "H318"], pictograms: ["GHS05"] } },
  { cid: 612, name: "Glycolic Acid", formula: "C2H4O3", smiles: "C(C(=O)O)O", weight: 76.05, tpsa: 57.5, xlogp: -1.1, hbd: 2, hba: 3, rotatable: 1, complexity: 51.4, aliases: ["glycolic acid", "hydroxyacetic acid", "c2h4o3"], ghs: { signal: "Danger", severity: "severe", hcodes: ["H302", "H314", "H318", "H332"], pictograms: ["GHS05", "GHS07"] } },
  { cid: 1110, name: "Succinic Acid", formula: "C4H6O4", smiles: "C(CC(=O)O)C(=O)O", weight: 118.09, tpsa: 74.6, xlogp: -0.6, hbd: 2, hba: 4, rotatable: 3, complexity: 92.6, aliases: ["succinic acid", "butanedioic acid", "c4h6o4"], ghs: { signal: "Warning", severity: "moderate", hcodes: ["H319"], pictograms: ["GHS07"] } },
  { cid: 6581, name: "Acrylic Acid", formula: "C3H4O2", smiles: "C=CC(=O)O", weight: 72.06, tpsa: 37.3, xlogp: 0.3, hbd: 1, hba: 2, rotatable: 1, complexity: 71.5, aliases: ["acrylic acid", "prop-2-enoic acid", "c3h4o2"], ghs: { signal: "Danger", severity: "severe", hcodes: ["H226", "H302", "H314", "H332", "H400"], pictograms: ["GHS02", "GHS05", "GHS07", "GHS09"] } },
  { cid: 971, name: "Oxalic Acid", formula: "C2H2O4", smiles: "C(=O)(C(=O)O)O", weight: 90.03, tpsa: 74.6, xlogp: -0.3, hbd: 2, hba: 4, rotatable: 1, complexity: 113, aliases: ["oxalic acid", "ethanedioic acid", "c2h2o4"], ghs: { signal: "Danger", severity: "high", hcodes: ["H302", "H312", "H318"], pictograms: ["GHS05", "GHS07"] } },
  { cid: 712, name: "Formaldehyde", formula: "CH2O", smiles: "C=O", weight: 30.026, tpsa: 17.1, xlogp: 0.4, hbd: 0, hba: 1, rotatable: 0, complexity: 10.3, aliases: ["formaldehyde", "methanal", "ch2o"], ghs: { signal: "Danger", severity: "severe", hcodes: ["H301", "H311", "H314", "H317", "H331", "H350"], pictograms: ["GHS05", "GHS06", "GHS08"] } },
  { cid: 6228, name: "Ethylene", formula: "C2H4", smiles: "C=C", weight: 28.05, tpsa: 0, xlogp: 1.1, hbd: 0, hba: 0, rotatable: 0, complexity: 14.2, aliases: ["ethylene", "ethene", "c2h4"], ghs: { signal: "Danger", severity: "high", hcodes: ["H220", "H336"], pictograms: ["GHS02", "GHS07"] } },
  { cid: 6106, name: "Toluene", formula: "C7H8", smiles: "Cc1ccccc1", weight: 92.14, tpsa: 0, xlogp: 2.7, hbd: 0, hba: 0, rotatable: 0, complexity: 38.9, aliases: ["toluene", "methylbenzene", "c7h8"] },

  // common drugs
  { cid: 3672, name: "Ibuprofen", formula: "C13H18O2", smiles: "CC(C)Cc1ccc(cc1)C(C)C(=O)O", weight: 206.28, tpsa: 37.3, xlogp: 3.5, hbd: 1, hba: 2, rotatable: 4, complexity: 203, aliases: ["ibuprofen", "c13h18o2"] },
  { cid: 1983, name: "Acetaminophen", formula: "C8H9NO2", smiles: "CC(=O)Nc1ccc(O)cc1", weight: 151.16, tpsa: 49.3, xlogp: 0.5, hbd: 2, hba: 2, rotatable: 1, complexity: 139, aliases: ["acetaminophen", "paracetamol", "tylenol", "c8h9no2"] },

  // common solvents
  { cid: 180, name: "Acetone", formula: "C3H6O", smiles: "CC(=O)C", weight: 58.08, tpsa: 17.1, xlogp: -0.2, hbd: 0, hba: 1, rotatable: 0, complexity: 26.3, aliases: ["acetone", "propan-2-one", "nail polish remover", "propanone", "c3h6o"] },
  { cid: 887, name: "Methanol", formula: "CH4O", smiles: "CO", weight: 32.04, tpsa: 20.2, xlogp: -0.5, hbd: 1, hba: 1, rotatable: 0, complexity: 2, aliases: ["methanol", "methyl alcohol", "ch4o", "co"] },
  { cid: 3776, name: "Isopropyl Alcohol", formula: "C3H8O", smiles: "CC(C)O", weight: 60.10, tpsa: 20.2, xlogp: 0.1, hbd: 1, hba: 1, rotatable: 0, complexity: 15.2, aliases: ["isopropanol", "isopropyl alcohol", "2-propanol", "rubbing alcohol", "c3h8o"] },
  { cid: 8857, name: "Ethyl Acetate", formula: "C4H8O2", smiles: "CCOC(C)=O", weight: 88.11, tpsa: 26.3, xlogp: 0.7, hbd: 0, hba: 2, rotatable: 2, complexity: 47.1, aliases: ["ethyl acetate", "c4h8o2"] },
  { cid: 679, name: "Dimethyl Sulfoxide", formula: "C2H6OS", smiles: "CS(=O)C", weight: 78.13, tpsa: 36.3, xlogp: -1.4, hbd: 0, hba: 2, rotatable: 0, complexity: 27.5, aliases: ["dmso", "dimethyl sulfoxide", "c2h6os"] },
  { cid: 8028, name: "Tetrahydrofuran", formula: "C4H8O", smiles: "C1CCOC1", weight: 72.11, tpsa: 9.2, xlogp: 0.5, hbd: 0, hba: 1, rotatable: 0, complexity: 23.4, aliases: ["thf", "tetrahydrofuran", "oxolane", "c4h8o"] },
  { cid: 6342, name: "Acetonitrile", formula: "C2H3N", smiles: "CC#N", weight: 41.05, tpsa: 23.8, xlogp: -0.3, hbd: 0, hba: 1, rotatable: 0, complexity: 27.4, aliases: ["acetonitrile", "c2h3n", "mecn"] },
  { cid: 6212, name: "Chloroform", formula: "CHCl3", smiles: "C(Cl)(Cl)Cl", weight: 119.37, tpsa: 0, xlogp: 1.9, hbd: 0, hba: 0, rotatable: 0, complexity: 8, aliases: ["chloroform", "trichloromethane", "chcl3"] },
  { cid: 6344, name: "Dichloromethane", formula: "CH2Cl2", smiles: "C(Cl)Cl", weight: 84.93, tpsa: 0, xlogp: 1.3, hbd: 0, hba: 0, rotatable: 0, complexity: 8, aliases: ["dichloromethane", "dcm", "methylene chloride", "ch2cl2"] },
  { cid: 8058, name: "Hexane", formula: "C6H14", smiles: "CCCCCC", weight: 86.18, tpsa: 0, xlogp: 3.9, hbd: 0, hba: 0, rotatable: 3, complexity: 22.5, aliases: ["hexane", "n-hexane", "c6h14"] },
  { cid: 3283, name: "Diethyl Ether", formula: "C4H10O", smiles: "CCOCC", weight: 74.12, tpsa: 9.2, xlogp: 0.8, hbd: 0, hba: 1, rotatable: 2, complexity: 15.7, aliases: ["diethyl ether", "ether", "ethoxyethane", "c4h10o"] },

  // acids, salts, small inorganics
  { cid: 1118, name: "Sulfuric Acid", formula: "H2O4S", smiles: "OS(=O)(=O)O", weight: 98.07, tpsa: 88.6, xlogp: null, hbd: 2, hba: 4, rotatable: 0, complexity: 82.2, aliases: ["sulfuric acid", "h2so4", "h2o4s"] },
  { cid: 944, name: "Nitric Acid", formula: "HNO3", smiles: "[N+](=O)(O)[O-]", weight: 63.01, tpsa: 66.1, xlogp: null, hbd: 1, hba: 3, rotatable: 0, complexity: 40.5, aliases: ["nitric acid", "hno3"] },
  { cid: 311, name: "Citric Acid", formula: "C6H8O7", smiles: "OC(=O)CC(O)(CC(=O)O)C(=O)O", weight: 192.12, tpsa: 132, xlogp: -1.7, hbd: 4, hba: 7, rotatable: 5, complexity: 273, aliases: ["citric acid", "c6h8o7"] },
  { cid: 284, name: "Formic Acid", formula: "CH2O2", smiles: "C(=O)O", weight: 46.03, tpsa: 37.3, xlogp: -0.2, hbd: 1, hba: 2, rotatable: 0, complexity: 10.3, aliases: ["formic acid", "methanoic acid", "ch2o2"] },
  { cid: 753, name: "Glycerol", formula: "C3H8O3", smiles: "OCC(O)CO", weight: 92.09, tpsa: 60.7, xlogp: -1.8, hbd: 3, hba: 3, rotatable: 2, complexity: 25.8, aliases: ["glycerol", "glycerine", "propane-1,2,3-triol", "c3h8o3"] },
  { cid: 1176, name: "Urea", formula: "CH4N2O", smiles: "C(=O)(N)N", weight: 60.06, tpsa: 69.1, xlogp: -2.1, hbd: 2, hba: 1, rotatable: 0, complexity: 24.2, aliases: ["urea", "carbamide", "ch4n2o"] },
  { cid: 5988, name: "Sucrose", formula: "C12H22O11", smiles: "OCC1OC(O)(COC2OC(CO)C(O)C(O)C2O)C(O)C1O", weight: 342.30, tpsa: 190, xlogp: -3.7, hbd: 8, hba: 11, rotatable: 5, complexity: 458, aliases: ["sucrose", "sugar", "table sugar", "cane sugar", "saccharose", "c12h22o11"] },
  { cid: 784, name: "Hydrogen Peroxide", formula: "H2O2", smiles: "OO", weight: 34.01, tpsa: 40.5, xlogp: -1.4, hbd: 2, hba: 2, rotatable: 0, complexity: 2, aliases: ["hydrogen peroxide", "h2o2", "oo"] },
  { cid: 977, name: "Oxygen", formula: "O2", smiles: "O=O", weight: 32.00, tpsa: 34.1, xlogp: null, hbd: 0, hba: 2, rotatable: 0, complexity: 2, aliases: ["oxygen", "dioxygen", "o2"] },
  { cid: 947, name: "Nitrogen", formula: "N2", smiles: "N#N", weight: 28.01, tpsa: 23.8, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 6, aliases: ["nitrogen", "dinitrogen", "n2"] },
  { cid: 24617, name: "Calcium Fluoride", formula: "CaF2", smiles: "[F-].[F-].[Ca+2]", weight: 78.07, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["calcium fluoride", "fluorite", "caf2", "caff"] },
  { cid: 14792, name: "Magnesium Oxide", formula: "MgO", smiles: "[Mg]=O", weight: 40.30, tpsa: 17.1, xlogp: null, hbd: 0, hba: 1, rotatable: 0, complexity: 2, aliases: ["magnesium oxide", "mgo", "magnesia"] },
  { cid: 14778, name: "Calcium Oxide", formula: "CaO", smiles: "[Ca]=O", weight: 56.08, tpsa: 17.1, xlogp: null, hbd: 0, hba: 1, rotatable: 0, complexity: 2, aliases: ["calcium oxide", "quicklime", "cao"] },
  { cid: 5235, name: "Sodium Fluoride", formula: "FNa", smiles: "[F-].[Na+]", weight: 41.99, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["sodium fluoride", "naf", "fna"] },

  // common binary compounds a beginner reaches by picking two element keys.
  // Bundled so the Combine flow keeps working when PubChem is 503-storming.
  { cid: 166630, name: "Lithium Oxide", formula: "Li2O", smiles: "[Li+].[Li+].[O-2]", weight: 29.88, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 0, aliases: ["lithium oxide", "li2o", "lithia"] },
  { cid: 73974, name: "Sodium Oxide", formula: "Na2O", smiles: "[O-2].[Na+].[Na+]", weight: 61.98, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 0, aliases: ["sodium oxide", "na2o"] },
  { cid: 25522, name: "Potassium Oxide", formula: "K2O", smiles: "[K+].[K+].[O-2]", weight: 94.20, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 0, aliases: ["potassium oxide", "k2o"] },
  { cid: 9989226, name: "Aluminium Oxide", formula: "Al2O3", smiles: "[O-2].[O-2].[O-2].[Al+3].[Al+3]", weight: 101.96, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 0, aliases: ["aluminium oxide", "aluminum oxide", "alumina", "al2o3", "corundum"] },
  { cid: 4873, name: "Potassium Chloride", formula: "ClK", smiles: "[Cl-].[K+]", weight: 74.55, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["potassium chloride", "kcl", "clk", "sylvite"] },
  { cid: 5284359, name: "Calcium Chloride", formula: "CaCl2", smiles: "[Cl-].[Cl-].[Ca+2]", weight: 110.98, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["calcium chloride", "cacl2", "cl2ca"] },
  { cid: 5360315, name: "Magnesium Chloride", formula: "MgCl2", smiles: "[Cl-].[Cl-].[Mg+2]", weight: 95.21, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["magnesium chloride", "mgcl2", "cl2mg"] },
  { cid: 24564, name: "Aluminium Chloride", formula: "AlCl3", smiles: "[Cl-].[Cl-].[Cl-].[Al+3]", weight: 133.34, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 8, aliases: ["aluminium chloride", "aluminum chloride", "alcl3", "alcl3"] },
  { cid: 253877, name: "Potassium Bromide", formula: "BrK", smiles: "[Br-].[K+]", weight: 119.00, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["potassium bromide", "kbr", "brk"] },
  { cid: 4875, name: "Potassium Iodide", formula: "IK", smiles: "[K+].[I-]", weight: 166.00, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["potassium iodide", "ki", "ik"] },
  { cid: 253881, name: "Sodium Bromide", formula: "BrNa", smiles: "[Na+].[Br-]", weight: 102.89, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["sodium bromide", "nabr", "brna"] },
  { cid: 224478, name: "Lithium Fluoride", formula: "FLi", smiles: "[Li+].[F-]", weight: 25.94, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["lithium fluoride", "lif", "fli"] },
  { cid: 14798, name: "Sodium Hydroxide", formula: "NaOH", smiles: "[OH-].[Na+]", weight: 40.00, tpsa: 1, xlogp: null, hbd: 1, hba: 1, rotatable: 0, complexity: 2, aliases: ["sodium hydroxide", "lye", "caustic soda", "naoh", "hnao"] },
  { cid: 14797, name: "Potassium Hydroxide", formula: "KOH", smiles: "[OH-].[K+]", weight: 56.11, tpsa: 1, xlogp: null, hbd: 1, hba: 1, rotatable: 0, complexity: 2, aliases: ["potassium hydroxide", "caustic potash", "koh", "hko"] },
  { cid: 10112, name: "Calcium Carbonate", formula: "CCaO3", smiles: "C(=O)([O-])[O-].[Ca+2]", weight: 100.09, tpsa: 63.2, xlogp: null, hbd: 0, hba: 3, rotatable: 0, complexity: 18, aliases: ["calcium carbonate", "limestone", "calcite", "chalk", "antacid", "caco3", "ccao3"] },
  { cid: 1119, name: "Sulfur Dioxide", formula: "O2S", smiles: "O=S=O", weight: 64.07, tpsa: 34.8, xlogp: 0.2, hbd: 0, hba: 2, rotatable: 0, complexity: 18.3, aliases: ["sulfur dioxide", "sulphur dioxide", "so2", "o2s"] },
  { cid: 24682, name: "Sulfur Trioxide", formula: "O3S", smiles: "O=S(=O)=O", weight: 80.06, tpsa: 52.2, xlogp: null, hbd: 0, hba: 3, rotatable: 0, complexity: 40.7, aliases: ["sulfur trioxide", "sulphur trioxide", "so3", "o3s"] },
  { cid: 281, name: "Carbon Monoxide", formula: "CO", smiles: "[C-]#[O+]", weight: 28.01, tpsa: 17.1, xlogp: null, hbd: 0, hba: 1, rotatable: 0, complexity: 10, aliases: ["carbon monoxide", "co"] },
  { cid: 948, name: "Nitrous Oxide", formula: "N2O", smiles: "[N-]=[N+]=O", weight: 44.01, tpsa: 28.5, xlogp: null, hbd: 0, hba: 1, rotatable: 0, complexity: 20.5, aliases: ["nitrous oxide", "laughing gas", "n2o", "dinitrogen monoxide"] },
  { cid: 24524, name: "Fluorine", formula: "F2", smiles: "FF", weight: 38.00, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["fluorine", "difluorine", "f2"] },
  { cid: 24526, name: "Chlorine", formula: "Cl2", smiles: "ClCl", weight: 70.90, tpsa: 0, xlogp: null, hbd: 0, hba: 0, rotatable: 0, complexity: 2, aliases: ["chlorine", "dichlorine", "cl2"] },
  { cid: 14917, name: "Hydrogen Fluoride", formula: "FH", smiles: "F", weight: 20.01, tpsa: 0, xlogp: null, hbd: 1, hba: 0, rotatable: 0, complexity: 2, aliases: ["hydrogen fluoride", "hydrofluoric acid", "hf", "fh"] },

  // things people actually have under the sink or in the pantry
  { cid: 176, name: "Acetic Acid", formula: "C2H4O2", smiles: "CC(=O)O", weight: 60.05, tpsa: 37.3, xlogp: -0.2, hbd: 1, hba: 2, rotatable: 0, complexity: 31.3, aliases: ["acetic acid", "vinegar", "white vinegar", "ethanoic acid", "glacial acetic acid", "c2h4o2"] },
  { cid: 516892, name: "Sodium Bicarbonate", formula: "CHNaO3", smiles: "C(=O)(O)[O-].[Na+]", weight: 84.01, tpsa: 60.4, xlogp: null, hbd: 1, hba: 3, rotatable: 0, complexity: 26.8, aliases: ["sodium bicarbonate", "baking soda", "bicarbonate of soda", "sodium hydrogen carbonate", "nahco3", "chnao3"] },
  { cid: 10340, name: "Sodium Carbonate", formula: "CNa2O3", smiles: "C(=O)([O-])[O-].[Na+].[Na+]", weight: 105.99, tpsa: 63.2, xlogp: null, hbd: 0, hba: 3, rotatable: 0, complexity: 18.9, aliases: ["sodium carbonate", "washing soda", "soda ash", "na2co3", "cna2o3"] },
  { cid: 23665760, name: "Sodium Hypochlorite", formula: "ClNaO", smiles: "[O-]Cl.[Na+]", weight: 74.44, tpsa: 23.6, xlogp: null, hbd: 0, hba: 1, rotatable: 0, complexity: 2, aliases: ["sodium hypochlorite", "bleach", "chlorine bleach", "liquid bleach", "naocl", "clnao"] },
  { cid: 3423265, name: "Sodium Dodecyl Sulfate", formula: "C12H25NaO4S", smiles: "CCCCCCCCCCCCOS(=O)(=O)[O-].[Na+]", weight: 288.38, tpsa: 74.8, xlogp: null, hbd: 0, hba: 4, rotatable: 12, complexity: 216, aliases: ["sodium dodecyl sulfate", "sodium lauryl sulfate", "sls", "sds", "sodium laurilsulfate", "detergent", "surfactant"] },
  { cid: 1030, name: "Propylene Glycol", formula: "C3H8O2", smiles: "CC(CO)O", weight: 76.09, tpsa: 40.5, xlogp: -0.9, hbd: 2, hba: 2, rotatable: 1, complexity: 16.3, aliases: ["propylene glycol", "propane-1,2-diol", "1,2-propanediol", "mpg", "e1520", "c3h8o2"] },
  { cid: 54670067, name: "Ascorbic Acid", formula: "C6H8O6", smiles: "C(C(C1C(=C(C(=O)O1)O)O)O)O", weight: 176.12, tpsa: 107, xlogp: -1.6, hbd: 4, hba: 6, rotatable: 2, complexity: 232, aliases: ["ascorbic acid", "vitamin c", "l-ascorbic acid", "e300", "c6h8o6"] },
  { cid: 14791, name: "Magnesium Hydroxide", formula: "H2MgO2", smiles: "[OH-].[OH-].[Mg+2]", weight: 58.32, tpsa: 2, xlogp: null, hbd: 2, hba: 2, rotatable: 0, complexity: 2, aliases: ["magnesium hydroxide", "milk of magnesia", "brucite", "mgoh2", "h2mgo2"] },
  { cid: 931, name: "Naphthalene", formula: "C10H8", smiles: "c1ccc2ccccc2c1", weight: 128.17, tpsa: 0, xlogp: 3.3, hbd: 0, hba: 0, rotatable: 0, complexity: 105, aliases: ["naphthalene", "mothballs", "moth balls", "tar camphor", "c10h8"] },
  { cid: 7628, name: "Boric Acid", formula: "BH3O3", smiles: "OB(O)O", weight: 61.83, tpsa: 60.7, xlogp: null, hbd: 3, hba: 3, rotatable: 0, complexity: 1.7, aliases: ["boric acid", "boracic acid", "hydrogen borate", "roach killer", "bh3o3"] },
  { cid: 24504, name: "Calcium Hypochlorite", formula: "CaCl2O2", smiles: "[O-]Cl.[O-]Cl.[Ca+2]", weight: 142.98, tpsa: 40.1, xlogp: null, hbd: 0, hba: 2, rotatable: 0, complexity: 4, aliases: ["calcium hypochlorite", "pool chlorine", "bleaching powder", "cacl2o2"] },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function fallbackFind(query: string): F | undefined {
  const q = norm(query);
  return FALLBACK.find((f) => norm(f.name) === q || norm(f.formula) === q || f.aliases.includes(q));
}
export function fallbackByCid(cid: number): F | undefined {
  return FALLBACK.find((f) => f.cid === cid);
}
export function fallbackBySmiles(smiles: string): F | undefined {
  const q = smiles.replace(/\s+/g, "");
  return FALLBACK.find((f) => f.smiles.replace(/\s+/g, "") === q);
}
