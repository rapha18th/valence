import SmilesDrawer from "smiles-drawer";

// smiles-drawer v2 renders reliably into an <svg> element. We draw there and,
// when a raster is needed (the recipe card), serialise the SVG to an image.

// Metal atoms (the cations in an ionic structure) aren't in smiles-drawer's
// default palette, so they fall back to the carbon colour and disappear
// against the dark stage. Give every metal an explicit light blue so the
// positive ion reads at a glance, in both themes.
const METALS = [
  "Li", "Na", "K", "Rb", "Cs", "Fr",
  "Be", "Mg", "Ca", "Sr", "Ba", "Ra",
  "Al", "Ga", "In", "Sn", "Tl", "Pb", "Bi",
  "Sc", "Ti", "V", "Cr", "Mn", "Fe", "Co", "Ni", "Cu", "Zn",
  "Y", "Zr", "Nb", "Mo", "Ag", "Cd",
  "La", "Hf", "Ta", "W", "Pt", "Au", "Hg",
];
const metalColors = (hex: string) =>
  Object.fromEntries(METALS.map((m) => [m.toUpperCase(), hex]));

const BASE_DARK = {
  FOREGROUND: "#ffffff", BACKGROUND: "#141414", C: "#ffffff", O: "#e74c3c",
  N: "#3498db", F: "#27ae60", CL: "#16a085", BR: "#d35400", I: "#8e44ad",
  P: "#d35400", S: "#f1c40f", B: "#e67e22", SI: "#e67e22", H: "#aaaaaa",
};
const BASE_LIGHT = {
  FOREGROUND: "#222222", BACKGROUND: "#ffffff", C: "#222222", O: "#e74c3c",
  N: "#3498db", F: "#27ae60", CL: "#16a085", BR: "#d35400", I: "#8e44ad",
  P: "#d35400", S: "#f1c40f", B: "#e67e22", SI: "#e67e22", H: "#666666",
};

const svgDrawer = new SmilesDrawer.SvgDrawer({
  padding: 26,
  bondThickness: 1.2,
  bondLength: 22,
  atomVisualization: "default",
  compactDrawing: false,
  explicitHydrogens: false,
  themes: {
    dark: { ...BASE_DARK, ...metalColors("#8ab4ff") },
    light: { ...BASE_LIGHT, ...metalColors("#2563c9") },
  },
});

export function drawStructureSvg(smiles: string, svg: SVGSVGElement, theme: "light" | "dark") {
  if (!smiles) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  try {
    SmilesDrawer.parse(
      smiles,
      (tree: unknown) => {
        try { svgDrawer.draw(tree, svg, theme, false); }
        catch (e) { console.warn("2D draw failed", e); }
      },
      (err: unknown) => console.warn("SMILES parse failed", err),
    );
  } catch (e) {
    console.warn("SMILES draw threw", e);
  }
}

/** Render a SMILES to a PNG data URL at the given pixel size. */
export function structureToPng(smiles: string, w: number, h: number, theme: "light" | "dark"): Promise<string> {
  return new Promise((resolve) => {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg") as SVGSVGElement;
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    document.body.appendChild(svg);
    drawStructureSvg(smiles, svg, theme);
    const xml = new XMLSerializer().serializeToString(svg);
    document.body.removeChild(svg);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));
  });
}
