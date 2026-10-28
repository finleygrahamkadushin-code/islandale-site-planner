import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { planFilePlugin } from './vite/planFilePlugin'

export default defineConfig({
  // end-to-end tests run their own server with their own plan folder, so they never touch the real plan
  plugins: [react(), planFilePlugin(process.env.ISLANDALE_PLAN_DIR || 'data/plans')],
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'vite/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
