import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Must match your repo name exactly
const repoName = 'Quote-of-the-day'

export default defineConfig({
  base: `/${repoName}/`,
  plugins: [react()],
  server: {
    proxy: {
      '/zen': {
        target: 'https://zenquotes.io',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/zen/, ''),
      },
    },
  },
})
