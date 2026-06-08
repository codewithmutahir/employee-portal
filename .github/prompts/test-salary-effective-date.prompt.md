---
description: >
  Agentic test — Salary Effective Date feature.
  Verifies that admins can record dated salary changes, that employees see
  those changes on their dashboard, and that CSV/print exports reflect the
  correct per-day wage rate for each specific work day (before and after a
  retroactive raise).
tools: ['playwright']
mode: 'agent'
---

You are a senior QA engineer testing an employee portal built with Next.js.
The app runs at http://localhost:3000.

DO NOT write fake assertions. DO run Playwright steps one by one, inspect
what is actually rendered, and fail loudly if anything is wrong.

When exploring the app:
1. Navigate to the given URL.
2. Interact with real UI controls (buttons, inputs, dropdowns).
3. Screenshot key states before making assertions.
4. Generate a Playwright TypeScript test that reproduces every scenario.
5. Save the test to `tests/salary-effective-date.spec.ts`.
6. Run the test with `npx playwright test tests/salary-effective-date.spec.ts --headed`.
7. Iterate until the test passes (fix selectors if the DOM changes).
8. Include descriptive `test.describe` blocks and `expect` assertions for
   every observable outcome listed below.

---

## Prerequisites

Before running scenarios, confirm the dev server is up:
- Navigate to http://localhost:3000
- The page should redirect to `/login` or show the dashboard.

---

## Scenario 1 — Admin adds a retroactive salary raise

### Steps
1. Log in as an **admin** user (credentials are in `.env.local` or `.env`
   under `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`).
2. Navigate to the **Management Dashboard** (`/dashboard`).
3. Select any active employee from the employee list.
4. Open the **Compensation** tab for that employee.
5. Confirm the existing **Compensation History** section is visible with
   at least 0 rows (even an empty state is acceptable).
6. Click **"Add Compensation Event"** button.
7. In the dialog that opens:
   - Select event type **"Merit Increase"**.
   - Enter a new salary that is higher than the current one (e.g. current +
     24 %).
   - Set the effective date to the **1st of the previous calendar month**
     (i.e. if today is June 8 2026, set May 1 2026).
   - Enter a reason: `"Retroactive performance raise Q1"`.
   - Click **Save**.
8. After saving:
   - The dialog should close.
   - A success toast / notification should appear.
   - The **Compensation History** list should now show the new event with:
     - The correct effective date.
     - A badge reading **"Active"**.
     - A badge reading **"Backdated"** (because the effective date is in the
       past).
     - The previous salary and new salary displayed as `"OLD → NEW"`.
     - A positive percent-change label (e.g. `"+24%"`).

### Expected assertions
```
expect(historyRow).toContainText('Merit Increase')
expect(historyRow).toContainText('Active')
expect(historyRow).toContainText('Backdated')
expect(historyRow).toContainText('→')
expect(historyRow).toContainText('Retroactive performance raise Q1')
```

---

## Scenario 2 — Employee sees Salary Changes card on their dashboard

### Steps
1. Log **out** of the admin account.
2. Log **in** as the employee whose salary was just changed.
3. Navigate to `/dashboard`.
4. Scroll to the **Salary slip** card.
5. Confirm the footer of the salary slip now shows an **"Effective from:"**
   line that mentions:
   - The effective date (e.g. `"May 01, 2026"`).
   - The event type (`"Merit Increase"`).
   - The previous salary (e.g. `"previously PKR 50,000"`).
6. Scroll further down to find the **"Salary changes"** card.
7. Confirm the card shows:
   - The event: `"Merit Increase"`.
   - Status badge: `"Active"`.
   - Status badge: `"Backdated"`.
   - A salary transition line: `"50,000 → 62,000"` (or the actual values).
   - A positive percent-change label in green text.
   - The reason text: `"Retroactive performance raise Q1"`.

### Expected assertions
```
expect(salarySlipFooter).toContainText('Effective from:')
expect(salarySlipFooter).toContainText('Merit Increase')
expect(salaryChangesCard).toBeVisible()
expect(salaryChangesCard).toContainText('Active')
expect(salaryChangesCard).toContainText('Backdated')
expect(salaryChangesCard).toContainText('→')
expect(salaryChangesCard).toContainText('Retroactive performance raise Q1')
```

---

## Scenario 3 — Timecard CSV reflects per-day-accurate wage rate

### Steps
1. Remain logged in as the employee OR switch back to admin and open that
   employee's export.
2. In the **Export** dialog, select **the previous month** (e.g. May 2026).
3. Click **"Export CSV (Timecard)"**.
4. Download and read the generated CSV file from the `Downloads` folder
   (or capture the Blob URL content).
5. Parse the CSV content and verify:

   a. **Header block** — a "SALARY CHANGES" section appears before the
      timecard headers and contains at least one row with:
      - The effective date of the raise.
      - `"Merit Increase"`.
      - The old salary and new salary.
      - A positive percent change.

   b. **Monthly breakdown block** — the row for May 2026 shows the salary
      as `"OLD → NEW"` (e.g. `"50,000 → 62,000"`) in the "Monthly Salary"
      column when the salary changed mid-month, OR the single new salary if
      effective from day 1.

   c. **Per-row data** — in the timecard rows:
      - Rows dated **before** the effective date (e.g. May 1–14 if effective
        May 15) must show the **old** salary in "Effective monthly salary"
        and the correspondingly **lower** wage rate in "Wage rate (per day)".
      - Rows dated **on or after** the effective date must show the **new**
        salary and the correspondingly **higher** wage rate.

   d. The **"Effective monthly salary"** column exists in the CSV header row.
   e. The **"Wage rate (per day)"** column contains `"/day"` suffix values,
      NOT the string `"N/A (add monthly salary in compensation)"`.

### Expected assertions
```
expect(csvText).toContain('SALARY CHANGES')
expect(csvText).toContain('Merit Increase')
expect(csvText).toContain('Effective monthly salary')
expect(csvText).not.toContain('N/A (add monthly salary in compensation)')
// Pre-raise rows:
expect(preRaiseRows[0]['Effective monthly salary']).toContain(oldSalary)
// Post-raise rows:
expect(postRaiseRows[0]['Effective monthly salary']).toContain(newSalary)
```

---

## Scenario 4 — Print / TXT report includes salary changes section

### Steps
1. Open the export dialog again for the same employee and month.
2. Click **"Export TXT (Print)"**.
3. Capture the downloaded `.txt` content.
4. Confirm the text contains:
   - A `"SALARY CHANGES"` section header.
   - A table row with columns:
     `Effective Date | Type | Previous | New | Change | Status`.
   - At least one row with `"Merit Increase"` and `"retroactive"` in the
     status column.
   - The Monthly Breakdown table includes a row for the tested month with
     the salary displayed as `"X → Y"` in the Monthly Salary column.
   - A footnote starting with `"* "→" indicates the salary changed
     mid-month"` (if the raise was mid-month).

### Expected assertions
```
expect(txtContent).toContain('SALARY CHANGES')
expect(txtContent).toContain('Merit Increase')
expect(txtContent).toContain('retroactive')
expect(txtContent).toContain('→')
```

---

## Scenario 5 — All-employees CSV shows salary change column

### Steps
1. Log in as **admin**.
2. Open the **Export All** option (if available in the management dashboard).
3. Download the all-employees CSV.
4. Check the employee summary table:
   - Column **"Latest Salary Change"** must exist.
   - The tested employee's row must contain a non-empty value in that column
     (e.g. `"May 01, 2026: 50,000 → 62,000"`).
5. Check the **"SALARY CHANGES (ALL EMPLOYEES)"** section at the bottom:
   - The tested employee's name must appear.
   - At least one row with `"Merit Increase"` and the correct salaries.

### Expected assertions
```
expect(csvText).toContain('Latest Salary Change')
expect(csvText).toContain('SALARY CHANGES (ALL EMPLOYEES)')
expect(employeeRow['Latest Salary Change']).not.toBe('')
```

---

## Scenario 6 — Edge case: effective date exactly on a work day

### Steps
1. Add a second compensation event for the same employee.
2. Set the effective date to a specific attendance record date that already
   exists (e.g. pick a day from the last 30 days where the employee clocked
   in — visible in attendance history).
3. Export a CSV covering that month.
4. Confirm the row for that exact date uses the **new** salary (not the
   old), proving the `<=` comparison is calendar-day-accurate.

### Expected assertions
```
// Row for the effective date should show new salary, not old
expect(effectiveDateRow['Effective monthly salary']).toContain(newSalary)
```

---

## Scenario 7 — Compensation history survives month filter

### Steps
1. Export the timecard CSV with **a different month selected** (e.g. a month
   where the salary had NOT changed).
2. Confirm:
   - The "SALARY CHANGES" block still appears in the CSV header (the history
     is not filtered away when you filter attendance by month).
   - The per-row wage rates for that month reflect the salary that was
     effective at that time.

---

## Notes for the test file

- Use `@playwright/test` with TypeScript.
- Use `test.beforeEach` to handle login and navigation.
- Credentials: read from `process.env.TEST_ADMIN_EMAIL`,
  `TEST_ADMIN_PASSWORD`, `TEST_EMPLOYEE_EMAIL`, `TEST_EMPLOYEE_PASSWORD`.
- For CSV/TXT assertions, intercept the download with
  `page.waitForEvent('download')` and read the file buffer.
- Add a `data-testid` attribute to key elements only if absolutely needed;
  prefer text selectors and ARIA roles first.
- Use `page.screenshot({ path: 'test-results/<scenario>-<step>.png' })` at
  each major state so failures are diagnosable.
