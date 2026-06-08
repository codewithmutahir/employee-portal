import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '.env.test' });

/**
 * Playwright config for the Employee Portal.
 *
 * Auth strategy:
 *   globalSetup calls Firebase REST API ONCE to get real tokens.
 *   Each test injects those tokens directly into the browser's IndexedDB
 *   (via loginAsAdmin / loginAsEmployee in helpers/auth.ts).
 *   Firebase restores the session from IndexedDB — the login page is
 *   never shown during the test run.
 *
 * Window strategy:
 *   A custom worker-scoped fixture (helpers/fixtures.ts) keeps ONE Chrome
 *   window open for the entire run.  Each test opens a new tab, runs, then
 *   closes the tab.  You watch the whole run in one window.
 *
 * Run:   npx playwright test --headed
 * UI:    npx playwright test --ui
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',

  /* Auth tokens fetched once before any browser opens. */
  globalSetup: './tests/setup/global-setup.ts',

  /* One worker = one Chrome process = one window. */
  workers: 1,
  fullyParallel: false,

  retries: process.env.CI ? 1 : 0,
  maxFailures: process.env.CI ? 5 : undefined,

  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',

    /* Headed locally; headless in CI. slowMo goes in launchOptions, not use root. */
    headless: !!process.env.CI,
    launchOptions: {
      slowMo: process.env.CI ? 0 : 400,
    },
    acceptDownloads: true,

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    navigationTimeout: 30_000,
    actionTimeout: 20_000,
  },

  /* Per-test timeout — "Export All CSV" fetches 17 employees from Firebase
     which can take 90-150 s on the first load. 5 minutes is the safe ceiling. */
  timeout: 300_000,

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
