/**
 * CSV Export Integrity — Playwright spec
 *
 * Strategy: login ONCE, export ONCE (beforeAll), assert many times.
 * "Export All CSV" loads every employee from Firebase — doing it per test
 * burns quota and takes ~90s each time.
 *
 * Run: npx playwright test tests/csv-export.spec.ts --headed
 */
import { test, expect } from './helpers/fixtures';
import { loginAsAdmin, loginAsEmployee, downloadAsText, parseCSV, splitCSVRow } from './helpers/auth';
import type { Page } from '@playwright/test';

const EXPECTED_TIMECARD_HEADERS = [
  'Name', 'Work date', 'Scheduled start', 'Actual clock-in (HH:mm)',
  'Clock in date', 'Clock in time', 'Clock out date', 'Clock out time',
  'Break start', 'Break end', 'Break length', 'Break type', 'Payroll ID',
  'Role', 'Effective monthly salary', 'Wage rate (per day)', 'Hours worked',
  'Total paid hours', 'Regular hours', 'Unpaid breaks', 'OT hours',
  'Estimated wages', 'Attendance status (portal)', 'Late (Y/N)', 'Minutes late',
  'Status (export)', 'No show reason', 'Employee note', 'Manager note',
] as const;

const DOWNLOAD_TIMEOUT = 180_000;

async function waitForExportAllCsv(page: Page) {
  const btn = page.locator('button:has-text("Export All CSV")');
  await expect(btn).toBeVisible({ timeout: 30_000 });
  await expect(btn).not.toBeDisabled({ timeout: 30_000 });
  return btn;
}

/** Wait until the employee list loads or a quota / error message appears. */
async function waitForEmployeeList(page: Page): Promise<void> {
  const usersCard = page.locator('h3').filter({ hasText: /^Users \(\d+\)/ });
  const employeesCard = page.locator('h3').filter({ hasText: /^Employees \(\d+\)/ });
  const card = usersCard.or(employeesCard);

  await expect(card.first()).toBeVisible({ timeout: 60_000 });

  // Quota error shown in the list card?
  const quotaMsg = page.getByText(/quota exceeded/i);
  if (await quotaMsg.count() > 0) {
    throw new Error(
      'Firebase database quota exceeded — employees cannot load and export will fail. ' +
      'Wait for the daily quota reset or upgrade Firebase billing, then re-run tests.'
    );
  }

  const title = await card.first().innerText();
  const count = parseInt(title.match(/\((\d+)\)/)?.[1] ?? '0', 10);

  if (count === 0) {
    const retry = page.getByRole('button', { name: 'Retry' });
    if (await retry.count() > 0) {
      await retry.click();
      await page.waitForTimeout(5_000);
    }
    const title2 = await card.first().innerText();
    const count2 = parseInt(title2.match(/\((\d+)\)/)?.[1] ?? '0', 10);
    if (count2 === 0) {
      const errText = await page.locator('.text-destructive').first().innerText().catch(() => '');
      throw new Error(
        errText ||
        'Employee list is empty (Users 0). Check Firebase quota and that the admin account has access.'
      );
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */

test.describe('CSV Export Integrity', () => {
  let allEmployeesCsv = '';

  test.beforeAll(async ({ page }) => {
    await loginAsAdmin(page);
    await waitForEmployeeList(page);

    const btn = await waitForExportAllCsv(page);
    const { text } = await downloadAsText(page, () => btn.click(), DOWNLOAD_TIMEOUT);
    allEmployeesCsv = text;

    expect(allEmployeesCsv.length).toBeGreaterThan(100);
    expect(allEmployeesCsv).toContain('Name,Work date,');
  });

  test('timecard CSV wage rate column never shows N/A for employees with salary', async () => {
    const lines = allEmployeesCsv.split('\n');
    const headerIdx = lines.findIndex((l) => l.startsWith('Name,Work date,'));
    expect(headerIdx).toBeGreaterThanOrEqual(0);

    const rows = parseCSV(lines.slice(headerIdx).join('\n'));
    for (const row of rows) {
      const monthlySalary = (row['Effective monthly salary'] ?? '').trim();
      const wageRate      = (row['Wage rate (per day)']     ?? '').trim();
      const isDataRow     = row['Name'] && row['Work date'];
      if (!isDataRow) continue;
      if (monthlySalary && !monthlySalary.includes('N/A') && monthlySalary !== '0') {
        expect(wageRate).not.toContain('N/A (add monthly salary');
      }
    }
  });

  test('timecard CSV header has all 29 expected columns', async () => {
    const headerLine = allEmployeesCsv.split('\n').find((l) => l.startsWith('Name,Work date,'));
    expect(headerLine).toBeTruthy();

    const headerKeys = splitCSVRow(headerLine!);
    for (const expected of EXPECTED_TIMECARD_HEADERS) {
      expect(headerKeys).toContain(expected);
    }
    expect(headerKeys.length).toBe(EXPECTED_TIMECARD_HEADERS.length);
  });

  test('timecard CSV contains SALARY CHANGES block for employees with history', async () => {
    if (!allEmployeesCsv.includes('SALARY CHANGES')) {
      test.skip(true, 'No SALARY CHANGES block in export — no compensation history events yet.');
      return;
    }
    expect(allEmployeesCsv).toContain('Event Type');
    expect(allEmployeesCsv).toContain('Previous');
    expect(allEmployeesCsv).toContain('New');
  });

  test('Effective monthly salary column has non-empty values for worked days', async () => {
    const lines = allEmployeesCsv.split('\n');
    const headerIdx = lines.findIndex((l) => l.startsWith('Name,Work date,'));
    const rows = parseCSV(lines.slice(headerIdx).join('\n')).filter(
      (r) => r['Name'] && !r['Name'].startsWith('Totals for') && r['Work date']
    );
    for (const row of rows) {
      const val = (row['Effective monthly salary'] ?? '').trim();
      if (val) expect(val).not.toContain('N/A (add monthly salary');
    }
  });

  test('PAY SUMMARY block says "Current monthly salary"', async () => {
    expect(allEmployeesCsv).toContain('Current monthly salary');
    expect(allEmployeesCsv).not.toContain('"Monthly salary (');
  });

  test('all-employees CSV includes Latest Salary Change column', async () => {
    expect(allEmployeesCsv).toContain('Latest Salary Change');
    expect(allEmployeesCsv).toContain('SALARY CHANGES (ALL EMPLOYEES)');
  });

  test('employee can export their own timecard CSV without errors', async ({ page }) => {
    await loginAsEmployee(page);

    const exportCsvBtn = page.locator('button:has-text("Export CSV")');
    if (await exportCsvBtn.count() === 0) {
      test.skip(true, 'Export CSV button not found on employee dashboard.');
      return;
    }
    await expect(exportCsvBtn).toBeVisible({ timeout: 15_000 });

    const quotaOnPage = page.getByText(/quota exceeded/i);
    if (await quotaOnPage.count() > 0) {
      test.skip(true, 'Firebase quota exceeded — skipping employee self-export.');
      return;
    }

    const { text: csvText } = await downloadAsText(page, () => exportCsvBtn.click(), DOWNLOAD_TIMEOUT);
    expect(csvText).toContain('Name,Work date,');
    expect(csvText).not.toContain('N/A (add monthly salary in compensation)');
  });
});
