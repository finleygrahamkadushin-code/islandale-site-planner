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
  build: {
    rollupOptions: {
      output: {
        // Libraries in their own chunks, so the app's chunk stays small and they cache between releases (4E).
        // Each group may only import from groups listed after it (never from the app's own chunks), or the
        // chunks load each other in a loop and a library starts before what it needs ("x is not a function").
        advancedChunks: {
          // a group takes only what its test names, not everything its imports pull along
          includeDependenciesRecursively: false,
          groups: [
            // post-processing loads after the first frame (Scene's lazy Effects)
            { name: 'effects', test: /node_modules[\\/](postprocessing|n8ao|@react-three[\\/]postprocessing)[\\/]/, priority: 4 },
            // every other library: React Three Fiber, drei, Radix, cmdk, zustand …
            { name: 'vendor', test: /node_modules[\\/](?!three[\\/]|react[\\/]|react-dom[\\/]|scheduler[\\/])/, priority: 3 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: 'three', test: /node_modules[\/]three[\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'vite/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
})
