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
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
    },
    proxy: {
      '/sessions': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
      },
      '/website': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
      },
    },
  },
})
