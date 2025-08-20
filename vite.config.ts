import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/Quote-of-the-day/',   // 👈 IMPORTANT for GitHub Pages
  server: {
    port: 5173,                 // local dev server
    open: true,                 // auto-open browser
  },
  build: {
    outDir: 'dist',             // GitHub Pages expects `dist`
    sourcemap: true,            // helps debugging deployed code
  },
})
