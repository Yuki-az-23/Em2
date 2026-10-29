// The browser test for the local demo. `npm run test:e2e` starts the whole
// demo (npm run demo) unless one is already running, then drives the door, the
// simulator and the wall in Chromium. Set DEMO_DATABASE_URL when running as root.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'he-IL',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node demo/run.mjs',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe'
  }
});
