// Vercel Edge proxy for PubChem PUG REST / PUG View.
// Only needed if a specific endpoint ever rejects browser CORS. Enable by
// setting VITE_PUBCHEM_PROXY=/api/pug at build time.
export const config = { runtime: "edge" };

const BASE = "https://pubchem.ncbi.nlm.nih.gov/rest";

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/pug\/?/, "");
  const target = `${BASE}/${path}${url.search}`;

  if (!/^https:\/\/pubchem\.ncbi\.nlm\.nih\.gov\//.test(target)) {
    return new Response("bad path", { status: 400 });
  }

  const upstream = await fetch(target, {
    headers: { Accept: req.headers.get("accept") ?? "application/json" },
  });

  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", "public, max-age=86400");

  return new Response(upstream.body, { status: upstream.status, headers });
}
