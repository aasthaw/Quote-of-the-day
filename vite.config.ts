import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/zen': {
        target: 'https://zenquotes.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/zen/, ''),
      },
    },
  },
})