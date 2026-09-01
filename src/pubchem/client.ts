// Throttled, cached PubChem client. Honours the published usage policy
// (<= 5 requests/second) by spacing requests ~260 ms apart, and caches
// every response in memory + localStorage so repeated lookups are free.

import { setQueueDepth } from "../store/store.ts";

const MIN_GAP_MS = 240;
const MAX_CACHE = 300;
const TIMEOUT_MS = 22000;

type Pending<T> = { run: () => Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const queue: Pending<any>[] = [];
let draining = false;
let lastAt = 0;

const mem = new Map<string, { at: number; body: string }>();

// tracks whether PubChem is currently answering, so tools can tell
// "no data exists" apart from "the source is down right now".
const health = { ok: true, lastFailAt: 0, lastOkAt: 0, lastStatus: 0 };
export function pubchemHealthy(): boolean {
  // treat a failure within the last 20s as "still down"
  return health.ok || Date.now() - health.lastFailAt > 20000;
}
export function pubchemStatusNote(): string {
  if (pubchemHealthy()) return "";
  const s = health.lastStatus;
  return s ? `PubChem is unreachable right now (HTTP ${s}).` : "PubChem is unreachable right now.";
}

function cacheGet(key: string): string | null {
  const hit = mem.get(key);
  if (hit) return hit.body;
  try {
    const raw = localStorage.getItem("valence.cache:" + key);
    if (raw) {
      mem.set(key, { at: Date.now(), body: raw });
      return raw;
    }
  } catch { /* ignore */ }
  return null;
}

function cacheSet(key: string, body: string) {
  mem.set(key, { at: Date.now(), body });
  if (mem.size > MAX_CACHE) {
    const oldest = [...mem.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) mem.delete(oldest[0]);
  }
  try { localStorage.setItem("valence.cache:" + key, body); } catch { /* quota */ }
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    setQueueDepth(queue.length);
    const job = queue.shift()!;
    const wait = Math.max(0, MIN_GAP_MS - (Date.now() - lastAt));
    if (wait) await sleep(wait);
    lastAt = Date.now();
    try {
      job.resolve(await job.run());
    } catch (e) {
      job.reject(e);
    }
  }
  setQueueDepth(0);
  draining = false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ run, resolve, reject });
    void drain();
  });
}

async function raw(url: string, accept: string): Promise<string> {
  const cached = cacheGet(url);
  if (cached !== null) return cached;
  return enqueue(async () => {
    // If PubChem just failed, don't retry-storm: try once, fail fast, let the
    // caller fall back to the bundled set.
    const maxAttempts = pubchemHealthy() ? 4 : 1;
    // PubChem returns 503 / 429 under load; back off and retry a couple times.
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, { headers: { Accept: accept }, signal: ctrl.signal });
        if (res.status === 404) { health.ok = true; health.lastOkAt = Date.now(); cacheSet(url, ""); return ""; }
        if ((res.status === 503 || res.status === 429 || res.status === 500) && attempt < maxAttempts - 1) {
          health.ok = false; health.lastFailAt = Date.now(); health.lastStatus = res.status;
          await sleep(500 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          health.ok = false; health.lastFailAt = Date.now(); health.lastStatus = res.status;
          throw new Error(`PubChem ${res.status} for ${url}`);
        }
        const body = await res.text();
        health.ok = true; health.lastOkAt = Date.now();
        cacheSet(url, body);
        return body;
      } catch (e) {
        if (attempt < maxAttempts - 1 && (e as Error)?.name === "AbortError") { await sleep(400); continue; }
        health.ok = false; health.lastFailAt = Date.now();
        throw e;
      } finally {
        clearTimeout(t);
      }
    }
  });
}

export async function getJSON<T = any>(url: string): Promise<T | null> {
  let body: string;
  try {
    body = await raw(url, "application/json");
  } catch (e) {
    console.warn("PubChem request failed", e);
    return null;
  }
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    return null;
  }
}

export async function getText(url: string): Promise<string> {
  try {
    return await raw(url, "chemical/x-mdl-sdfile, text/plain, */*");
  } catch (e) {
    console.warn("PubChem request failed", e);
    return "";
  }
}

export function clearPubchemCache() {
  mem.clear();
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("valence.cache:")) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
}
