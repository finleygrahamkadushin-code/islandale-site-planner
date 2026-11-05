import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // each page is a full 3D scene; in parallel, headless Chromium can take longer than the waits to draw its first frame
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
    // every spec starts as a seasoned browser (Advanced, tour seen); the Beginner spec clears this itself
    storageState: {
      cookies: [],
      origins: [{ origin: 'http://localhost:5174', localStorage: [{ name: 'islandale-mode', value: 'advanced' }, { name: 'islandale-tour', value: 'done' }] }],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // a separate server and plan folder, so tests never write to data/plans/islandale.plan.json
    command: 'npm run dev',
    env: { PORT: '5174', ISLANDALE_PLAN_DIR: 'test-results/plan-home' },
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
