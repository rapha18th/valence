// URL builders for every PubChem call Valence makes. All routed through an
// optional proxy base so we can flip to the bundled edge function if a
// browser-CORS issue ever appears on a specific endpoint.

const PROXY = (import.meta.env.VITE_PUBCHEM_PROXY ?? "").replace(/\/$/, "");
const REST = PROXY ? `${PROXY}` : "https://pubchem.ncbi.nlm.nih.gov/rest";

const enc = encodeURIComponent;

export const PROPS =
  "MolecularFormula,MolecularWeight,SMILES,ConnectivitySMILES,TPSA,XLogP," +
  "HBondDonorCount,HBondAcceptorCount,RotatableBondCount,Complexity,Title";

export const ep = {
  cidsByName: (name: string) =>
    `${REST}/pug/compound/name/${enc(name)}/cids/JSON`,
  cidsBySmiles: (smiles: string) =>
    `${REST}/pug/compound/smiles/${enc(smiles)}/cids/JSON`,
  cidsByInchiKey: (key: string) =>
    `${REST}/pug/compound/inchikey/${enc(key)}/cids/JSON`,
  cidsByFormula: (formula: string) =>
    `${REST}/pug/compound/fastformula/${enc(formula)}/cids/JSON?MaxRecords=50`,

  properties: (cids: number[]) =>
    `${REST}/pug/compound/cid/${cids.join(",")}/property/${PROPS}/JSON`,

  sdf3d: (cid: number) =>
    `${REST}/pug/compound/cid/${cid}/SDF?record_type=3d`,
  sdf2d: (cid: number) =>
    `${REST}/pug/compound/cid/${cid}/SDF?record_type=2d`,
  png2d: (cid: number) =>
    `${REST}/pug/compound/cid/${cid}/PNG`,

  similarity2d: (smiles: string, threshold: number, max: number) =>
    `${REST}/pug/compound/fastsimilarity_2d/smiles/${enc(smiles)}/cids/JSON` +
    `?Threshold=${threshold}&MaxRecords=${max}`,

  ghs: (cid: number) =>
    `${REST}/pug_view/data/compound/${cid}/JSON?heading=${enc("GHS Classification")}`,
  vendors: (cid: number) =>
    `${REST}/pug_view/data/compound/${cid}/JSON?heading=${enc("Chemical Vendors")}`,
  patents: (cid: number) =>
    `${REST}/pug/compound/cid/${cid}/xrefs/PatentID/JSON`,
  assaySummary: (cid: number) =>
    `${REST}/pug/compound/cid/${cid}/assaysummary/JSON`,
  pharmacology: (cid: number) =>
    `${REST}/pug_view/data/compound/${cid}/JSON?heading=${enc("Pharmacology and Biochemistry")}`,

  // Human-facing links for notebook citations.
  page: (cid: number) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
} as const;
