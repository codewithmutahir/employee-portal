---
description: >
  Agentic test — CSV and print export integrity.
  Verifies all export types (timecard CSV, print TXT, late report CSV,
  all-employees CSV) produce correct data: no N/A wage rates, correct
  column counts, proper monthly salary display, and accurate salary history
  blocks.
tools: ['playwright']
mode: 'agent'
---

You are a senior QA engineer testing an employee portal built with Next.js.
The app runs at http://localhost:3000.

DO NOT fabricate results. Navigate the real UI, intercept real file
downloads, and parse the actual content before asserting.

Steps for every scenario:
1. Navigate to the given URL.
2. Authenticate and interact with real UI controls.
3. Intercept downloads with `page.waitForEvent('download')`.
4. Read the buffer and convert to string.
5. Parse CSV rows where needed using a simple split-on-newline strategy.
6. Screenshot the UI state before downloading.
7. Save the spec to `tests/csv-export.spec.ts`.
8. Run with `npx playwright test tests/csv-export.spec.ts`.
9. Iterate until green.

---

## Scenario 1 — Timecard CSV wage rate is never "N/A"

### Steps
1. Log in as admin.
2. Open the management dashboard and select any employee who has
   compensation set (salary > 0).
3. Open the Export dialog.
4. Select all available months (or leave filter empty = all months).
5. Click **"Export CSV (Timecard)"**.
6. Read the downloaded CSV.
7. Split by newlines and find the header row that starts with `"Name"`.
8. For every data row after the header (that is not a Totals row or blank):
   - Find the **"Wage rate (per day)"** column value.
   - Assert it does NOT equal `"N/A (add monthly salary in compensation)"`.
   - Assert it contains `"/day"`.

### Expected assertions
```
const rows = parseCSV(csvText)
for (const row of rows) {
  if (row['Name'] && row['Name'] !== 'Totals for ...') {
    expect(row['Wage rate (per day)']).not.toContain('N/A')
    expect(row['Wage rate (per day)']).toContain('/day')
  }
}
```

---

## Scenario 2 — Timecard CSV has the correct column count

### Steps
1. Download the timecard CSV for any employee (same as Scenario 1).
2. Find the header row (starts with `"Name,Work date,"`).
3. Count the columns by splitting on `,` (accounting for quoted fields).
4. Confirm there are exactly **29 columns** (the list now includes
   `"Effective monthly salary"` as a new column):

   `Name, Work date, Scheduled start, Actual clock-in (HH:mm),
   Clock in date, Clock in time, Clock out date, Clock out time,
   Break start, Break end, Break length, Break type, Payroll ID,
   Role, Effective monthly salary, Wage rate (per day), Hours worked,
   Total paid hours, Regular hours, Unpaid breaks, OT hours,
   Estimated wages, Attendance status (portal), Late (Y/N),
   Minutes late, Status (export), No show reason, Employee note,
   Manager note`

5. Confirm `"Effective monthly salary"` exists in the header row.

### Expected assertions
```
expect(headers).toContain('Effective monthly salary')
expect(headers).toContain('Wage rate (per day)')
expect(headers.length).toBe(29)
```

---

## Scenario 3 — SALARY CHANGES block appears in timecard CSV

### Steps
1. Use an employee with at least one compensation history event.
2. Download the timecard CSV.
3. Check that before the main `"Name,Work date,"` header row there is a
   block starting with the text `"SALARY CHANGES"`.
4. The block must have at least one data row with:
   - A date value.
   - An event type (e.g. `"Merit Increase"`).
   - A previous salary value.
   - A new salary value.
   - A percent-change value (e.g. `"+24%"`).
   - A status (e.g. `"active, retroactive"`).
5. If the employee has NO history, confirm the `"SALARY CHANGES"` block
   is absent.

### Expected assertions
```
expect(csvText).toContain('SALARY CHANGES')
expect(csvText).toContain('Merit Increase')
expect(csvText).toContain('+')   // positive percent change
```

---

## Scenario 4 — Monthly breakdown shows "X → Y" when salary changed mid-month

### Steps
1. Use an employee with a mid-month salary change in a past month
   (e.g. changed from 50,000 to 62,000 effective May 15 2026).
2. Download the timecard CSV for **May 2026**.
3. Find the `"MONTHLY BREAKDOWN"` block.
4. Find the row for May 2026.
5. The `"Monthly Salary"` cell must contain the `"→"` arrow character
   (not a single number).
6. The `"Per-Day Rate"` cell must also contain `"→"`.
7. For a month where salary did NOT change: both columns must show a
   single number (no `"→"`).

### Expected assertions
```
const mayRow = monthlyRows.find(r => r['Month'] === 'May 2026')
expect(mayRow['Monthly Salary']).toContain('→')
expect(mayRow['Per-Day Rate']).toContain('→')
```

---

## Scenario 5 — Print TXT report contains SALARY CHANGES section

### Steps
1. Download the **TXT (print)** report for the same employee.
2. Confirm the text contains, in order:
   - `"SALARY CHANGES"` as a section heading.
   - A table header line: `"Effective Date | Type | Previous | New | Change | Status"`.
   - At least one data row with `"|"` separators.
3. Confirm the `"MONTHLY BREAKDOWN"` section's table header now includes
   `"Monthly Salary"` and `"Per-Day Rate"` columns.
4. If a mid-month change exists, confirm `"→"` appears in at least one
   Monthly Breakdown data row.
5. If a mid-month change exists, confirm a footnote line starting with
   `"  * "→" indicates"` appears after the Monthly Breakdown table.

### Expected assertions
```
expect(txt).toContain('SALARY CHANGES')
expect(txt).toContain('Effective Date | Type')
expect(txt).toContain('Monthly Salary')
expect(txt).toContain('Per-Day Rate')
```

---

## Scenario 6 — All-employees CSV has "Latest Salary Change" column

### Steps
1. Log in as admin.
2. From the management dashboard, open the **Export All** dialog
   (the option for exporting all employees at once).
3. Click **"Export CSV (All Employees)"** or equivalent.
4. Find the employee summary table in the CSV.
5. Confirm the header row contains `"Latest Salary Change"`.
6. For an employee with history, the value in that column is non-empty
   (e.g. `"May 01, 2026: 50,000 → 62,000"`).
7. Confirm the `"SALARY CHANGES (ALL EMPLOYEES)"` block exists at the
   bottom of the CSV.

### Expected assertions
```
expect(csvText).toContain('Latest Salary Change')
expect(csvText).toContain('SALARY CHANGES (ALL EMPLOYEES)')
const empRow = parsedSummaryRows.find(r => r['Employee Name'] === name)
expect(empRow['Latest Salary Change']).not.toBe('')
```

---

## Scenario 7 — CSV month filter preserves salary history

### Steps
1. Download the timecard CSV for a specific single month.
2. Even though attendance is filtered to that month, the `"SALARY CHANGES"`
   block in the CSV header must still list ALL events for that employee
   (not just changes in that month).
3. This verifies that `compensationHistory` is not accidentally filtered
   when `applyMonthFilter` is called on the export data.

### Expected assertions
```
const salaryChangesBlock = /* extract SALARY CHANGES lines from csv */
expect(salaryChangesBlock.length).toBeGreaterThan(0)
// All historical events should still be present
expect(salaryChangesBlock).toContain('Merit Increase')
```

---

## Scenario 8 — Employee self-export works (no 403)

### Steps
1. Log in as a regular **employee** (not admin/management).
2. Navigate to the dashboard.
3. Find the **Export** button on the employee dashboard.
4. Click it and select a month.
5. Click **"Export CSV (Timecard)"**.
6. Confirm no error toast appears and the download starts.
7. Confirm the downloaded CSV contains `"SALARY CHANGES"` block if the
   employee has any history events, and does NOT contain
   `"N/A (add monthly salary in compensation)"` in any wage rate column.

### Expected assertions
```
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('[aria-label="Export CSV"]'),
])
expect(download).toBeTruthy()
const csvText = (await download.createReadStream()).read().toString()
expect(csvText).not.toContain('N/A (add monthly salary in compensation)')
```

---

## Notes for the test file

- Use `@playwright/test` with TypeScript.
- Credentials from env: `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`,
  `TEST_EMPLOYEE_EMAIL`, `TEST_EMPLOYEE_PASSWORD`.
- Parse CSVs with a helper that handles quoted fields (values may contain
  commas inside quotes).
- Screenshot the export dialog state before clicking download.
- Place screenshots in `test-results/csv-*.png`.
- If selectors need IDs, add `data-testid` attributes only as a last resort.
