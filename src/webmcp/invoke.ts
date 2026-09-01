// One way to run a Valence tool from inside the app: prefer the live
// document.modelContext.executeTool path (identical to what an external agent
// uses), fall back to the local executor. Used by the operator and by the
// recovery cards.

import { TOOL_EXEC } from "./register.ts";

export async function invokeTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const doc = (document as { modelContext?: any }).modelContext;
  if (doc?.executeTool && doc?.getTools) {
    try {
      const tools = await doc.getTools();
      const descr = tools.find((t: { name: string }) => t.name === name);
      if (descr) {
        const out = await doc.executeTool(descr, JSON.stringify(args));
        const parsed = out == null ? null : JSON.parse(out);
        return parsed?.content?.[0]?.text ?? "";
      }
    } catch {
      /* fall through to the local executor */
    }
  }
  const exec = TOOL_EXEC.get(name);
  if (!exec) throw new Error(`unknown tool ${name}`);
  const r = await exec(args);
  return r.content?.[0]?.text ?? "";
}
