/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBCHEM_PROXY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Ambient shape for the WebMCP surface (document.modelContext) we target.
interface WebMcpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (args: any) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
}
interface WebMcpModelContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void>;
  unregisterTool?(name: string): void;
  getTools?(): Promise<{ name: string; inputSchema?: string }[]>;
  listTools?(): unknown[];
  executeTool?(tool: unknown, inputArgsJson: string): Promise<string | null>;
  provideContext?(opts: { tools: WebMcpTool[] }): void;
}
interface Document {
  modelContext?: WebMcpModelContext;
}
interface Navigator {
  modelContext?: WebMcpModelContext;
}
