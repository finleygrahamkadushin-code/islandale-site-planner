// ESLint for the planner (R11.1): typescript-eslint's recommended rules and the
// two React hooks rules. Run it with `npm run lint` (after `npm run lint:install`).
//
// ESLint and its plugins live in tools/lint/, with their own lockfile, not in the
// app's devDependencies: typescript-eslint parses with TypeScript's JS API, which
// TypeScript 7 (the app's compiler) no longer has, so tools/lint pins TypeScript
// 6.0 as the parser only. The typecheck still runs the app's TypeScript 7.
import { createRequire } from 'node:module'

const fromLint = createRequire(new URL('./tools/lint/package.json', import.meta.url))
const tseslint = fromLint('typescript-eslint')
const reactHooks = fromLint('eslint-plugin-react-hooks')

export default tseslint.config(
  {
    ignores: ['dist/', 'build/', 'legacy/', 'node_modules/', 'tools/lint/node_modules/', 'test-results/', 'playwright-report/', 'coverage/', '.claude/', '.scratch/'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'vite/**/*.ts', 'e2e/**/*.ts', 'vite.config.ts', 'playwright.config.ts'],
    extends: [tseslint.configs.recommended],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
)
