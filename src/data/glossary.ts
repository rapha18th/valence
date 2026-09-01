// Teach-mode glossary. Same concept set the chemistry primer (docs/) covers.
export interface GlossaryEntry {
  term: string;
  aliases?: string[];
  short: string;
  more?: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "SMILES",
    aliases: ["smile", "line notation"],
    short: "A one-line text spelling of a molecule. Atoms are letters, bonds are symbols, rings close with matching digits.",
    more: "Example: ethanol is CCO — carbon, carbon, oxygen, with hydrogens implied. Branches sit in parentheses; = is a double bond; lowercase letters mean an aromatic ring.",
  },
  {
    term: "InChIKey",
    aliases: ["inchi"],
    short: "A fixed-length hashed fingerprint of a structure, used as a stable database key.",
    more: "Two molecules with the same InChIKey are the same compound. PubChem's own integer key is the CID.",
  },
  {
    term: "CID",
    short: "PubChem Compound ID. A stable integer that names one specific compound record.",
  },
  {
    term: "conformer",
    aliases: ["3d", "conformation"],
    short: "One particular 3D shape a molecule can fold into by rotating its single bonds.",
    more: "The flat 2D sketch shows which atoms are bonded. A conformer shows where they sit in space. Valence fetches a computed low-energy conformer from PubChem for the 3D view.",
  },
  {
    term: "isomer",
    short: "Molecules with the same formula but a different arrangement of atoms.",
    more: "Different connectivity or different 3D handedness. Isomers can behave completely differently in the body or in a reaction.",
  },
  {
    term: "molecular weight",
    aliases: ["mw", "weight", "molar mass"],
    short: "The mass of one mole of the compound, in grams. The sum of the atomic weights in the formula.",
  },
  {
    term: "TPSA",
    aliases: ["polar surface area", "topological polar surface area"],
    short: "Topological polar surface area: the summed surface of the polar (mostly O and N) parts of the molecule, in square ångströms.",
    more: "A rough predictor of how easily a molecule crosses membranes. Above ~140 Å² it usually does not cross the gut wall well; above ~90 it tends not to enter the brain.",
  },
  {
    term: "logP",
    aliases: ["xlogp", "partition coefficient", "lipophilicity"],
    short: "How a molecule splits between oil and water, on a log scale. Positive means it prefers oil; negative means it prefers water.",
    more: "XLogP is a calculated estimate. High logP (>3) tracks with poor solubility and a tendency to build up in fatty tissue.",
  },
  {
    term: "hydrogen bond donors",
    aliases: ["hbd", "h-bond donor"],
    short: "Count of O-H and N-H groups, which can donate a hydrogen into a hydrogen bond.",
    more: "Part of Lipinski's Rule of 5: drug-like molecules usually have no more than 5 donors and 10 acceptors.",
  },
  {
    term: "hydrogen bond acceptors",
    aliases: ["hba", "h-bond acceptor"],
    short: "Count of oxygen and nitrogen atoms with a lone pair that can accept a hydrogen bond.",
  },
  {
    term: "rotatable bonds",
    short: "The number of single bonds that can freely rotate. A measure of how floppy the molecule is.",
    more: "Fewer rotatable bonds usually means a more rigid, more selective molecule.",
  },
  {
    term: "GHS",
    aliases: ["hazard", "pictogram", "ghs classification"],
    short: "The UN Globally Harmonised System for labelling chemical hazards: nine pictograms, two signal words (Danger, Warning), and coded H-statements.",
    more: "GHS02 flammable, GHS05 corrosive, GHS06 acutely toxic, GHS07 irritant, GHS08 serious health hazard, GHS09 environmental. Valence reads these from PubChem's GHS Classification section.",
  },
  {
    term: "signal word",
    short: "The one-word severity flag on a GHS label. 'Danger' is the serious tier; 'Warning' is the lesser one.",
  },
  {
    term: "Tanimoto",
    aliases: ["similarity", "fingerprint", "similarity coefficient"],
    short: "A 0-to-1 score of how many structural fingerprint bits two molecules share. 1.0 is identical; ~0.85+ is 'similar core'.",
    more: "PubChem's 2D similarity search compares a molecular fingerprint, a bit-string that records which small fragments are present.",
  },
  {
    term: "functional group",
    short: "A small cluster of atoms that gives a molecule a characteristic reactivity, like -OH (alcohol) or -COOH (carboxylic acid).",
    more: "Chemists reason in functional groups because reactions act on the group, largely independent of the rest of the molecule.",
  },
  {
    term: "polymer precursor",
    aliases: ["monomer", "precursor"],
    short: "A small, reactive molecule that gets linked many times over to build a polymer chain.",
    more: "Ethylene is the precursor to polyethylene. A diol plus a diacid gives a polyester. A precursor needs at least two reactive handles so the chain can grow from both ends.",
  },
  {
    term: "oxidation state",
    short: "A bookkeeping charge assigned to an atom in a compound, assuming bonds are fully ionic.",
    more: "It tracks which atoms gained or lost electron control in a reaction. Oxygen is usually -2, hydrogen usually +1.",
  },
  {
    term: "electronegativity",
    short: "How strongly an atom pulls shared electrons toward itself. Fluorine is the strongest; metals are weak.",
    more: "A large difference between two bonded atoms makes an ionic bond; a small difference makes a covalent one.",
  },
  {
    term: "bioassay",
    aliases: ["assay", "bioactivity", "target"],
    short: "A lab test that measures whether a compound acts on a biological target, such as an enzyme or receptor.",
    more: "If a built molecule looks like a known drug, its assay history is a flag that it may be biologically active too.",
  },
];
