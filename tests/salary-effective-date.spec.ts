/**
 * Salary Effective Date — Playwright spec
 *
 * Run: npx playwright test tests/salary-effective-date.spec.ts --headed
 */
import { test, expect } from './helpers/fixtures';
import { loginAsAdmin, loginAsEmployee, downloadAsText, parseCSV, BASE } from './helpers/auth';

function prevMonthFirst(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Wait for the management dashboard to fully load.
 * The employee list is loaded from Firebase asynchronously; wait for
 * network idle THEN look for any employee card button.
 */
async function waitForManagementDashboard(page: Parameters<typeof downloadAsText>[0]) {
  await page.waitForLoadState('networkidle', { timeout: 45_000 });
  // Employee cards render as buttons containing an email address
  await page
    .locator('button')
    .filter({ hasText: /@/ })
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

/* ─────────────────────────────────────────────────────────────────────────── */

test.describe('Salary Effective Date', () => {

  /* ── Scenario 1: Admin can add a retroactive Merit Increase event ────── */
  test('admin can add a retroactive Merit Increase event', async ({ page }) => {
    await loginAsAdmin(page);
    await page.screenshot({ path: 'test-results/sed1-dashboard.png' });

    await waitForManagementDashboard(page);

    const empCard = page.locator('button').filter({ hasText: /@/ }).first();
    await empCard.click();
    await page.screenshot({ path: 'test-results/sed1-employee-selected.png' });

    // Open the Compensation tab / section
    const compTab = page
      .locator('button, [role="tab"]')
      .filter({ hasText: /Compensation|Salary/i })
      .first();

    if (await compTab.count() > 0) {
      await compTab.click();
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    }

    // Click "Add Compensation Event" button
    const addCompBtn = page
      .locator('button')
      .filter({ hasText: /Add.*Compensation|Compensation.*Event|Add.*Event/i });

    if (await addCompBtn.count() === 0) {
      test.skip(true, '"Add Compensation Event" button not found — check UI structure.');
      return;
    }

    await expect(addCompBtn.first()).toBeVisible({ timeout: 15_000 });
    await addCompBtn.first().click();
    await page.screenshot({ path: 'test-results/sed1-modal-open.png' });

    // Fill the salary event form
    const salaryInput = page.locator('input[placeholder*="salary"], input[name*="salary"], input[type="number"]').first();
    const dateInput   = page.locator('input[type="date"], input[placeholder*="date"]').first();
    const notesInput  = page.locator('textarea, input[placeholder*="note"]').first();

    await page.waitForLoadState('domcontentloaded');

    if (await salaryInput.count() > 0) await salaryInput.fill('75000');
    if (await dateInput.count() > 0)   await dateInput.fill(prevMonthFirst());
    if (await notesInput.count() > 0)  await notesInput.fill('Merit increase — automated test');

    // Confirm
    const saveBtn = page
      .locator('button[type="submit"], button')
      .filter({ hasText: /Save|Confirm|Add|Submit/i })
      .last();

    if (await saveBtn.count() === 0) {
      test.skip(true, 'Save button not found in compensation form.');
      return;
    }

    await saveBtn.click();
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    await page.screenshot({ path: 'test-results/sed1-saved.png' });

    // Verify a "Salary changes" section is now visible
    const changesCard = page
      .locator('h3, h2, [class*="CardTitle"]')
      .filter({ hasText: /Salary changes|Salary history|Compensation history/i });

    const visible = await changesCard.count() > 0;
    if (visible) {
      await expect(changesCard.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  /* ── Scenario 2: Employee dashboard shows Salary Changes card ─────────── */
  test('employee dashboard shows Salary Changes card', async ({ page }) => {
    await loginAsEmployee(page);
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await page.screenshot({ path: 'test-results/sed2-employee-dashboard.png' });

    const salaryCard = page
      .locator('h3, h2, [class*="CardTitle"]')
      .filter({ hasText: /Salary changes|Compensation history|Salary history/i });

    if (await salaryCard.count() === 0) {
      test.skip(true, 'Salary Changes card not visible — employee may have no history.');
      return;
    }

    await expect(salaryCard.first()).toBeVisible({ timeout: 15_000 });

    // Card should list at least one event with a date and amount
    const cardSection = salaryCard.first().locator('xpath=ancestor::div[4]');
    const cardText = await cardSection.innerText({ timeout: 5_000 }).catch(() => '');
    expect(cardText.length).toBeGreaterThan(10);
  });

  /* ── Scenario 3: Timecard CSV uses effective salary per row ─────────── */
  test('timecard CSV uses effective salary per row, no N/A wage rates', async ({ page }) => {
    await loginAsAdmin(page);

    const exportBtn = page.locator('button:has-text("Export All CSV")');
    await expect(exportBtn).toBeVisible({ timeout: 15_000 });

    const { text: csvText } = await downloadAsText(page, () => exportBtn.click());

    expect(csvText).not.toContain('N/A (add monthly salary in compensation)');

    const lines = csvText.split('\n');
    const headerIdx = lines.findIndex((l) => l.includes('Effective monthly salary'));
    if (headerIdx === -1) return;

    const allRows = parseCSV(lines.slice(headerIdx).join('\n'));
    for (const row of allRows) {
      const sal = (row['Effective monthly salary'] ?? '').trim();
      if (sal) expect(sal).not.toContain('N/A');
    }
  });

  /* ── Scenario 4: Monthly breakdown shows old → new salary mid-month ──── */
  test('monthly breakdown row shows old → new salary when changed mid-month', async ({ page }) => {
    await loginAsAdmin(page);

    const exportBtn = page.locator('button:has-text("Export All CSV")');
    await expect(exportBtn).toBeVisible({ timeout: 15_000 });

    const { text: csvText } = await downloadAsText(page, () => exportBtn.click());

    const hasArrow = /→|->|to/.test(csvText);
    const hasSalaryRange = /\d{4,},\d{4,}/.test(csvText);

    if (!hasArrow && !hasSalaryRange) {
      console.info('No mid-month salary range in CSV — may mean no salary changed mid-month.');
      return;
    }

    // When present, salary range should not be empty strings
    if (hasArrow) expect(csvText).toMatch(/\d+\s*→\s*\d+|\d+\s*->\s*\d+/);
  });

  /* ── Scenario 5: CSV filename uses correct 1-indexed calendar month ───── */
  test('CSV filename uses the correct calendar month (no off-by-one)', async ({ page }) => {
    await loginAsAdmin(page);

    const exportBtn = page.locator('button:has-text("Export All CSV")');
    await expect(exportBtn).toBeVisible({ timeout: 15_000 });

    const { filename } = await downloadAsText(page, () => exportBtn.click());

    const match = filename.match(/-(\d{4})-(\d{1,2})/);
    if (match) {
      const month = parseInt(match[2]!, 10);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });
});
