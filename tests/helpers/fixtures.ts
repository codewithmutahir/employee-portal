/**
 * Custom Playwright fixtures.
 *
 * Goal: ONE Chrome window, ONE tab, ALL tests run in it sequentially.
 *
 * Why one tab instead of one-tab-per-test:
 *   Firebase stores auth in IndexedDB, but its in-memory state is what the app
 *   actually uses for every render check.  When Playwright opens a new tab,
 *   Firebase starts fresh and needs ~500ms–2s to re-read IndexedDB before the
 *   app knows the user is logged in.  During that window the app redirects to
 *   /login, so every new-tab test sees the login page.
 *
 *   With a SINGLE PERSISTENT PAGE Firebase auth stays in memory across tests.
 *   loginAsAdmin / loginAsEmployee navigate to /dashboard; Firebase is already
 *   initialised and the dashboard loads instantly — no login redirect.
 *
 * Usage — import from here instead of '@playwright/test':
 *   import { test, expect } from './helpers/fixtures';
 */
import { test as base, BrowserContext, Page, expect } from '@playwright/test';

export { expect };

type WorkerFixtures = {
  sharedContext: BrowserContext;
  sharedPage: Page;
};

export const test = base.extend<{}, WorkerFixtures>({
  /* ── ONE browser context for the whole worker (= whole test run) ─────── */
  sharedContext: [
    async ({ browser }, use) => {
      const context = await browser.newContext({ acceptDownloads: true });
      await use(context);
      await context.close();
    },
    { scope: 'worker' },
  ],

  /* ── ONE page (tab) for the whole worker — never closed between tests ── */
  sharedPage: [
    async ({ sharedContext }, use) => {
      const page = await sharedContext.newPage();
      await use(page);
      // Context close above will clean up the page
    },
    { scope: 'worker' },
  ],

  /**
   * Override the default `page` fixture to hand the same persistent page to
   * every test.  Tests must navigate explicitly (loginAsAdmin etc.) — they
   * cannot rely on starting on any particular URL.
   */
  page: async ({ sharedPage }, use) => {
    await use(sharedPage);
    // Do NOT close the page — it must survive to the next test.
  },
});
