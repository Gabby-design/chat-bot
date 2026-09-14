import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 3000,
    strictPort: false, // If port 3000 is occupied, automatically increment to 3001, 3002, etc.
    host: true
  }
})
