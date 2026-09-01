// Vercel Function (Node.js runtime): proxy for PubChem PUG REST / PUG View.
// In production the app calls /api/pug/... (VITE_PUBCHEM_PROXY in
// .env.production) so requests leave from Vercel's network instead of the
// visitor's browser, and successful responses are edge-cached for 24h.

const BASE = "https://pubchem.ncbi.nlm.nih.gov/rest";

export default async function handler(req: any, res: any): Promise<void> {
  const host = req.headers?.host ?? "localhost";
  const full = new URL(req.url ?? "/", `https://${host}`);
  const path = full.pathname.replace(/^\/api\/pug\/?/, "");
  const target = `${BASE}/${path}${full.search}`;

  if (!target.startsWith("https://pubchem.ncbi.nlm.nih.gov/")) {
    res.status(400).send("bad path");
    return;
  }

  res.setHeader("access-control-allow-origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-methods", "GET, OPTIONS");
    res.status(204).end();
    return;
  }

  try {
    const upstream = await fetch(target, {
      headers: { Accept: req.headers?.["accept"] ?? "application/json, text/plain, */*" },
    });
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    res.setHeader("cache-control", upstream.ok ? "public, max-age=86400, s-maxage=86400" : "no-store");
    res.status(upstream.status).send(text);
  } catch {
    res.status(502).send("proxy error reaching PubChem");
  }
}
