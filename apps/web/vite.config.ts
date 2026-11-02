import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3300";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "localhost",
    port: 5373,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
      "/socket.io": { target: apiTarget.replace(/^http/, "ws"), ws: true }
    }
  }
});
