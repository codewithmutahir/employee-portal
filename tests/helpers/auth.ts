/**
 * Auth helpers for Playwright tests.
 *
 * Strategy: ONE UI login per user-role for the entire test run.
 *
 * The custom shared-context fixture (fixtures.ts) keeps a single BrowserContext
 * open for all 18 tests.  Firebase stores auth in IndexedDB, which is scoped
 * to the BrowserContext — so once we log in, the session persists across every
 * subsequent tab/page in that context.
 *
 * We track which role is currently active in a module-level variable.
 * loginAsAdmin / loginAsEmployee:
 *   – If the right role is already active  → just navigate to /dashboard  (fast)
 *   – If a different role is active        → UI login to switch           (one-time)
 */
import { Page } from '@playwright/test';

export const BASE = process.env.BASE_URL ?? 'http://localhost:3001';

/** Which Firebase user is currently signed in across the shared context. */
let _activeRole: 'admin' | 'employee' | null = null;

/* ─────────────────────────────────────────────────────────────────────────── */
/* Core login                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

async function _uiLogin(page: Page, email: string, password: string): Promise<void> {
  console.log(`[auth] UI login → ${email}`);
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 20_000 });

  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // Wait until we are no longer on /login (redirect to dashboard)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
}

/**
 * Ensure the page is logged in as admin and on the management dashboard.
 *
 * KEY OPTIMISATION: if we are ALREADY on /dashboard as admin, do NOT navigate.
 * A full page.goto() wipes the React component tree — including the ExportDialog's
 * cached allData — forcing every subsequent export to re-fetch from Firebase
 * (~60-90 s per test). By staying on the same URL the cache stays warm and tests
 * run in seconds instead of minutes.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  if (_activeRole === 'admin') {
    const url = page.url();
    // Already on the admin dashboard — keep the React state alive, don't navigate.
    if (url.includes('/dashboard') && !url.includes('/login')) return;

    // Navigated away (e.g. opened a modal or visited another page), come back.
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/login')) {
      // Session somehow expired — fall back to UI login.
      await _uiLogin(page, adminEmail(), adminPassword());
      _activeRole = 'admin';
    }
    return;
  }

  _activeRole = null;
  await _uiLogin(page, adminEmail(), adminPassword());
  _activeRole = 'admin';
}

/**
 * Ensure the page is logged in as employee and on the employee dashboard.
 * Same "skip navigation if already there" optimisation as loginAsAdmin.
 */
export async function loginAsEmployee(page: Page): Promise<void> {
  if (_activeRole === 'employee') {
    const url = page.url();
    if (url.includes('/dashboard') && !url.includes('/login')) return;

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/login')) {
      await _uiLogin(page, empEmail(), empPassword());
      _activeRole = 'employee';
    }
    return;
  }

  _activeRole = null;
  await _uiLogin(page, empEmail(), empPassword());
  _activeRole = 'employee';
}

export async function logout(page: Page): Promise<void> {
  _activeRole = null;
  const btn = page.locator(
    'button:has-text("Sign Out"), button:has-text("Logout"), button:has-text("Sign out")'
  );
  if (await btn.count() > 0) {
    await btn.first().click();
    await page.waitForURL(/\/login/, { timeout: 10_000 }).catch(() => {});
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Credential helpers                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */

function adminEmail()    { return mustEnv('TEST_ADMIN_EMAIL'); }
function adminPassword() { return mustEnv('TEST_ADMIN_PASSWORD'); }
function empEmail()      { return mustEnv('TEST_EMPLOYEE_EMAIL'); }
function empPassword()   { return mustEnv('TEST_EMPLOYEE_PASSWORD'); }

function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} is not set in .env.test`);
  return v;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Download capture — Blob URL / URL.createObjectURL                            */
/* ─────────────────────────────────────────────────────────────────────────── */

export async function setupDownloadCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Reset captures (the same page is reused across tests).
    (window as any).__exportCaptures = [];

    // Only install the hooks once — avoid wrapping already-wrapped functions.
    if ((window as any).__downloadCaptureInstalled) return;
    (window as any).__downloadCaptureInstalled = true;

    // Delay blob URL revocation so our fetch can still read it.
    const origRevoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) =>
      url.startsWith('blob:')
        ? setTimeout(() => origRevoke(url), 10_000)
        : origRevoke(url);

    // Intercept programmatic <a download>.click() to capture blob content.
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.download && this.href.startsWith('blob:')) {
        const { href: url, download: filename } = this;
        fetch(url)
          .then((r) => r.text())
          .then((text) => {
            (window as any).__exportCaptures.push({ filename, text });
          })
          .catch(() => {});
      }
      return origClick.call(this);
    };
  });
}

export async function waitForCapturedDownload(
  page: Page,
  timeoutMs = 90_000,
): Promise<{ text: string; filename: string }> {
  // NOTE: waitForFunction(fn, arg, options) — pass `undefined` as arg so the
  // third parameter is correctly interpreted as options (not arg).
  await page.waitForFunction(
    () =>
      Array.isArray((window as any).__exportCaptures) &&
      (window as any).__exportCaptures.length > 0,
    undefined,
    { timeout: timeoutMs },
  );
  const captures: Array<{ filename: string; text: string }> = await page.evaluate(
    () => (window as any).__exportCaptures,
  );
  return captures[captures.length - 1]!;
}

/**
 * Set up download capture, run `trigger`, wait for the captured blob content.
 */
export async function downloadAsText(
  page: Page,
  trigger: () => Promise<void>,
  timeoutMs = 90_000,
): Promise<{ text: string; filename: string }> {
  await setupDownloadCapture(page);
  await trigger();
  return waitForCapturedDownload(page, timeoutMs);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* CSV utilities                                                                */
/* ─────────────────────────────────────────────────────────────────────────── */

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVRow(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = splitCSVRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

export function splitCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
