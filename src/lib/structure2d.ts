import SmilesDrawer from "smiles-drawer";

// smiles-drawer v2 renders reliably into an <svg> element. We draw there and,
// when a raster is needed (the recipe card), serialise the SVG to an image.

const svgDrawer = new SmilesDrawer.SvgDrawer({
  padding: 26,
  bondThickness: 1.2,
  bondLength: 22,
  atomVisualization: "default",
  compactDrawing: false,
  explicitHydrogens: false,
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
