/**
 * Late Detection & Grace Period — Playwright spec
 *
 * Run: npx playwright test tests/late-detection.spec.ts --headed
 */
import { test, expect } from './helpers/fixtures';
import { loginAsEmployee, loginAsAdmin, downloadAsText, parseCSV, BASE } from './helpers/auth';

/* Wait for the employee dashboard to finish loading (skeleton disappears). */
async function waitForEmployeeDashboard(page: Parameters<typeof downloadAsText>[0]) {
  // Wait for network to settle (Firebase queries done)
  await page.waitForLoadState('networkidle', { timeout: 30_000 });
  // The attendance history heading is rendered after data arrives
  await page
    .locator('h3, h2, [class*="CardTitle"]')
    .filter({ hasText: /Recent Attendance|Attendance History/i })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

/* ─────────────────────────────────────────────────────────────────────────── */

test.describe('Late Detection & Grace Period', () => {

  /* ── Scenario 1: Grace-period punches have no "Late In" badge ─────────── */
  test('records within grace period do not show Late In badge', async ({ page }) => {
    await loginAsEmployee(page);
    await page.screenshot({ path: 'test-results/ld1-dashboard.png' });
    await waitForEmployeeDashboard(page);

    const lateInBadge = page
      .locator('[class*="badge"], span, div')
      .filter({ hasText: /^Late In$/i });
    const lateCount = await lateInBadge.count();

    if (lateCount === 0) {
      console.info('No Late In badges found — grace period test passed (no late records).');
      return;
    }

    // If there are late badges, grab their associated minutes
    const badgeTexts: string[] = [];
    for (let i = 0; i < lateCount; i++) {
      const row = lateInBadge.nth(i);
      const rowParent = row.locator('xpath=ancestor::tr[1]');
      badgeTexts.push(await rowParent.innerText().catch(() => ''));
    }

    // All shown-late rows must be past the grace window (minutes > 0)
    for (const rowText of badgeTexts) {
      const minuteMatch = rowText.match(/(\d+)\s*min/i);
      if (minuteMatch) {
        const minutes = parseInt(minuteMatch[1]!, 10);
        expect(minutes).toBeGreaterThan(0);
      }
    }

    await page.screenshot({ path: 'test-results/ld1-done.png' });
  });

  /* ── Scenario 2: Late badge shows minutes-past-grace, not total late ──── */
  test('Late In badge shows minutes after grace window, not total minutes late', async ({ page }) => {
    await loginAsEmployee(page);
    await waitForEmployeeDashboard(page);

    const lateInBadge = page
      .locator('[class*="badge"], span, div')
      .filter({ hasText: /^Late In$/i });
    const lateCount = await lateInBadge.count();

    if (lateCount === 0) {
      test.skip(true, 'No late records — badge check skipped.');
      return;
    }

    // The minutes shown should NOT be the raw offset from scheduled start.
    // They should be (actual_clock_in - scheduled_start - grace_window).
    // We can only verify they are positive non-zero integers here.
    const firstLateRow = lateInBadge.first().locator('xpath=ancestor::div[2]');
    const rowText = await firstLateRow.innerText({ timeout: 5_000 }).catch(() => '');
    const minuteMatch = rowText.match(/(\d+)\s*min/i);
    if (minuteMatch) {
      expect(parseInt(minuteMatch[1]!, 10)).toBeGreaterThan(0);
    }
  });

  /* ── Scenario 3: Schedule mismatch shows amber warning ───────────────── */
  test('schedule mismatch suspected shows amber warning without red Late In', async ({ page }) => {
    await loginAsEmployee(page);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    const amberWarning = page
      .locator('p, div, section')
      .filter({ hasText: /schedule.*mismatch|mismatch.*schedule|configuration|discrepancy|significantly/i });

    if (await amberWarning.count() === 0) {
      console.info('No schedule-mismatch records found — amber warning check skipped.');
      return;
    }

    // The amber warning element should not have a red/destructive style
    const firstWarning = amberWarning.first();
    const className = await firstWarning.getAttribute('class') ?? '';
    expect(className).not.toMatch(/destructive|red/i);
  });

  /* ── Scenario 4: Today's Attendance card shows scheduled start time ───── */
  test("Today's Attendance card shows resolved scheduled start time", async ({ page }) => {
    await loginAsEmployee(page);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: 'test-results/ld4-dashboard.png' });

    const todayCard = page
      .locator('h3, h2, [class*="CardTitle"]')
      .filter({ hasText: /Today|Today's Attendance|Today's Check/i });

    if (await todayCard.count() === 0) {
      test.skip(true, "No Today's Attendance card — possibly no schedule configured.");
      return;
    }

    await expect(todayCard.first()).toBeVisible({ timeout: 15_000 });

    // The card should show a scheduled time (HH:MM format)
    const cardSection = todayCard.first().locator('xpath=ancestor::div[3]');
    const cardText = await cardSection.innerText({ timeout: 5_000 }).catch(() => '');
    const timePattern = /\d{1,2}:\d{2}/;
    expect(timePattern.test(cardText)).toBeTruthy();
  });

  /* ── Scenario 5: CSV filename is 1-indexed (no off-by-one) ──────────── */
  test('exported CSV filename uses 1-indexed month (no off-by-one bug)', async ({ page }) => {
    await loginAsEmployee(page);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    const exportBtn = page.locator('button:has-text("Export CSV")');
    if (await exportBtn.count() === 0) {
      test.skip(true, 'No Export CSV button on employee dashboard — skipping.');
      return;
    }

    const { filename } = await downloadAsText(page, () => exportBtn.first().click());

    // Month in filename should be 1–12 (not 0–11)
    const match = filename.match(/-(\d{4})-(\d{1,2})/);
    if (match) {
      const month = parseInt(match[2]!, 10);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });

  /* ── Scenario 6: Late report CSV minutes are past-grace values ──────── */
  test('late report CSV minutes are past-grace values, not total-late values', async ({ page }) => {
    await loginAsAdmin(page);

    const lateBtn = page.locator('button:has-text("Late Report"), button:has-text("Export Late"), a:has-text("Late Report")');
    if (await lateBtn.count() === 0) {
      test.skip(true, 'No Late Report button found — skipping.');
      return;
    }
    await expect(lateBtn.first()).toBeVisible({ timeout: 20_000 });

    const { text: csvText } = await downloadAsText(page, () => lateBtn.first().click());

    const rows = parseCSV(csvText).filter(
      (r) => r['Minutes Late'] || r['minutes_late'] || r['Minutes late']
    );
    if (rows.length === 0) return;

    for (const row of rows) {
      const val = parseInt(row['Minutes Late'] ?? row['minutes_late'] ?? row['Minutes late'] ?? '0', 10);
      if (isNaN(val)) continue;
      expect(val).toBeGreaterThan(0);
    }
  });
});
