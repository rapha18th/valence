import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/bench.css";

// register the WebMCP tools before anything else touches the DOM, so an agent
// scanning on document-ready already sees document.modelContext populated
import { registerTools } from "./webmcp/register.ts";
const toolNames = registerTools();

import { mountLayout } from "./ui/layout.ts";
import { mountGhostCursor } from "./ui/ghost-cursor.ts";
import { mountToasts } from "./ui/toasts.ts";
import { setStatus } from "./store/store.ts";

const app = document.getElementById("app")!;
mountToasts();
mountLayout(app);
mountGhostCursor();
setStatus(`Ready. ${toolNames.length} WebMCP tools on document.modelContext. Press two element keys, or ask.`);

// catch a native document.modelContext that a runtime injects after us
document.addEventListener("DOMContentLoaded", () => registerTools());
setTimeout(() => registerTools(), 800);
