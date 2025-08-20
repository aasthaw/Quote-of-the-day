import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Quote-of-the-day/',   
  server: {
    proxy: {
      '/zen': {
        target: 'https://zenquotes.io',
        changeOrigin: true,
        secure: true,
        rewrite: p => p.replace(/^\/zen/, ''),
      },
    },
  },
})
