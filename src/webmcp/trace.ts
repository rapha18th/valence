// Wraps a tool call so every invocation is recorded: name, arguments, duration,
// PubChem retries it consumed, and whether it succeeded or threw. The trace
// panel reads this straight off the store.

import { pushTrace, endTrace } from "../store/store.ts";
import { reqStats } from "../pubchem/client.ts";
import type { Actor } from "../store/types.ts";

type AnyResult =
  | { ok: boolean; text?: string }
  | { content?: { type: "text"; text: string }[]; isError?: boolean };

function readResult(res: AnyResult): { ok: boolean; text: string } {
  if (res && typeof res === "object" && "ok" in res) {
    return { ok: !!res.ok, text: (res as { text?: string }).text ?? "" };
  }
  const r = res as { content?: { text: string }[]; isError?: boolean };
  return { ok: !r?.isError, text: r?.content?.[0]?.text ?? "" };
}

export async function withTrace<T extends AnyResult>(
  name: string,
  args: unknown,
  thunk: () => Promise<T> | T,
  actor: Actor = "agent",
): Promise<T> {
  const retries0 = reqStats().retries;
  const id = pushTrace({ name, args, actor });
  try {
    const res = await thunk();
    const { ok, text } = readResult(res);
    endTrace(id, {
      ok,
      output: text.length > 400 ? text.slice(0, 400) + "…" : text,
      retries: reqStats().retries - retries0,
    });
    return res;
  } catch (e) {
    endTrace(id, {
      ok: false,
      error: (e as Error)?.message ?? String(e),
      retries: reqStats().retries - retries0,
    });
    throw e;
  }
}
