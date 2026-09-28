import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // relative asset paths so the build works under a GitHub Pages sub-path
  base: "./",
  server: { port: 5173 },
});
