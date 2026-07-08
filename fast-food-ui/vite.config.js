import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // jsdom gives the helper tests a window.localStorage for the history loaders.
  test: {
    environment: 'jsdom',
  },
})
