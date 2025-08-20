import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Quote-of-the-day/", // 👈 must match your repo name
  server: {
    proxy: {
      "/zen": {
        target: "https://zenquotes.io",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zen/, ""),
      },
    },
  },
});
