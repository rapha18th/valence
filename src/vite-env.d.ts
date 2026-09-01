/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBCHEM_PROXY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Minimal ambient shape for the WebMCP polyfill surface we use.
interface WebMcpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (args: any) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;
}
interface WebMcpModelContext {
  provideContext(opts: { tools: WebMcpTool[] }): void;
  registerTool(tool: WebMcpTool): void;
  unregisterTool(name: string): void;
  listTools(): { name: string; description: string; inputSchema?: unknown }[];
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
    content: { type: "text"; text: string }[];
    isError?: boolean;
  }>;
}
interface Navigator {
  modelContext?: WebMcpModelContext;
}
