import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { planFilePlugin } from './vite/planFilePlugin'

// The hosted home serves the old planner next to the new one, as legacy.html (the top bar's Old planner link).
const legacyPage = (): Plugin => ({
  name: 'islandale-legacy-page',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'legacy.html', source: readFileSync('legacy/islandale-planner.html', 'utf8') })
  },
})

export default defineConfig({
  // relative asset paths, so the build also runs as files inside the hosted claude.ai artifact
  base: './',
  // end-to-end tests run their own server with their own plan folder, so they never touch the real plan
  plugins: [react(), legacyPage(), planFilePlugin(process.env.ISLANDALE_PLAN_DIR || 'data/plans')],
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'vite/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
