import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/bench.css";

import { mountLayout } from "./ui/layout.ts";
import { mountGhostCursor } from "./ui/ghost-cursor.ts";
import { mountToasts } from "./ui/toasts.ts";
import { registerTools } from "./webmcp/register.ts";
import { setStatus } from "./store/store.ts";

const app = document.getElementById("app")!;
mountToasts();
mountLayout(app);
mountGhostCursor();

registerTools()
  .then((names) => {
    if (names.length) {
      setStatus(`Ready. ${names.length} WebMCP tools on document.modelContext. Press two element keys, or ask.`);
    } else {
      setStatus("Ready. WebMCP runtime not detected; the built-in operator still drives the same tools.");
    }
  })
  .catch((e) => {
    console.error("WebMCP registration failed", e);
    setStatus("Ready (WebMCP registration failed; UI still works).");
  });
