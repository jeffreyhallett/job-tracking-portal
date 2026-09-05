import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// In local dev, `npm run dev` serves the SPA and proxies /api/* to `vercel dev`
// (default port 3000), which runs the functions in /api. Override the target
// with API_PROXY_TARGET if you run `vercel dev --listen` on another port.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
