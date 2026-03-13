import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Read .env from repo root when running locally; fall back to current dir
// (used during Docker build where the parent directory doesn't exist).
const repoRoot = path.resolve(__dirname, '..')
const envDir = fs.existsSync(path.join(repoRoot, '.env')) ? repoRoot : __dirname

// https://vitejs.dev/config/
export default defineConfig({
  envDir,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_WS_BASE_URL || 'ws://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
