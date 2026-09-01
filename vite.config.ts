import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5199, host: true, strictPort: true },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks: {
          "3dmol": ["3dmol"],
        },
      },
    },
  },
});
