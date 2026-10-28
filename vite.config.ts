import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    proxy: {
      // xfwd: the server only trusts X-Forwarded-For from loopback, so staff-only routes still see the
      // real station IP in development instead of treating every proxied request as the ticket laptop
      '/sessions': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        xfwd: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        xfwd: true,
      },
      '/website': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
      },
    },
  },
})
