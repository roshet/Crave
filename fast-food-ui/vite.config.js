import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // jsdom gives the helper tests a window.localStorage for the history loaders, and the
  // React Testing Library render tests a DOM. setup.js registers jest-dom matchers and
  // stubs browser APIs jsdom lacks (matchMedia).
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
})
