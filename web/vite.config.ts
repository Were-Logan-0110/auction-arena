import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Backend port must match server.py (AUCTION_PORT override supported).
const BACKEND_PORT = process.env.AUCTION_PORT ?? "8137";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8138,
    proxy: {
      "/socket.io": {
        target: `http://localhost:${BACKEND_PORT}`,
        ws: false,
      },
      "/api": {
        target: `http://localhost:${BACKEND_PORT}`,
      },
    },
  },
});
