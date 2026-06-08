---
description: >
  Agentic test — Late-detection & grace period feature.
  Verifies that the portal correctly identifies lateness only when clock-in
  exceeds the 15-minute grace window, displays "X min late" after grace,
  shows the resolved scheduled start time, and raises a schedule-mismatch
  warning when the discrepancy is suspiciously large (>4 h).
tools: ['playwright']
mode: 'agent'
---

You are a senior QA engineer testing an employee portal built with Next.js.
The app runs at http://localhost:3000.

DO NOT fabricate results. Interact with the real UI step by step, take
screenshots at each key state, and only assert what you can observe.

When exploring the app:
1. Navigate to the given URL.
2. Interact with real UI controls (clock-in dialogs, attendance cards).
3. Screenshot key states before asserting.
4. Generate a Playwright TypeScript test in `tests/late-detection.spec.ts`.
5. Run the test with `npx playwright test tests/late-detection.spec.ts`.
6. Iterate on selectors until the test is green.

---

## Scenario 1 — On-time clock-in shows no "Late In" status

### Context
Employee schedule: 09:00 → 18:00, grace period 15 minutes.
Clock-in simulated at 09:10 (within grace).

### Steps
1. Log in as an **employee** whose schedule starts at 09:00.
2. If today's attendance card shows an existing clock-in, open the
   attendance history instead and find a record with clock-in ≤ 09:15.
3. On the attendance history card, confirm that record shows a badge that
   is NOT "Late In" (should be "Clocked In", "On Time", or similar).
4. Confirm the late explanation block (amber or red) is NOT visible for
   that record.

### Expected assertions
```
expect(badge).not.toContainText('Late In')
expect(lateExplanation).not.toBeVisible()
```

---

## Scenario 2 — Clock-in after grace shows "Late In · X min"

### Context
Employee schedule: 09:00 → 18:00.
Clock-in at 09:20 → 5 minutes past the 15-min grace (20 - 15 = 5 min late).

### Steps
1. Log in as the employee.
2. Find an attendance history record where clock-in was after 09:15.
3. Confirm:
   - The status badge shows **"Late In · X min"** where X > 0.
   - The number shown is **minutes past the grace window**, NOT total
     minutes past the schedule start (e.g. for 09:20 → shows "5 min",
     not "20 min").
   - A red/amber late explanation block is visible below the record.
   - The explanation mentions:
     - The resolved scheduled start (e.g. `"Scheduled 9:00 AM"`).
     - The grace period (e.g. `"15-minute grace"`).
     - The actual minutes late after grace.

### Expected assertions
```
expect(badge).toContainText('Late In')
expect(badge).toMatch(/Late In · \d+ min/)
const lateMinFromBadge = parseInt(badge.textContent.match(/(\d+) min/)[1])
// For 09:20 clock-in with 09:00 schedule: grace=15, lateAfterGrace = 5
expect(lateMinFromBadge).toBe(5)
expect(explanationBlock).toContainText('Scheduled')
expect(explanationBlock).toContainText('grace')
```

---

## Scenario 3 — Schedule mismatch shows amber warning, not red "Late In"

### Context
Detects when scheduled 07:00 but clocked in at 19:05 — likely an AM/PM
entry error. The system suspects a schedule mismatch when the gap is > 4 h.

### Steps
1. As an admin, find or create an attendance record where the employee's
   schedule is morning (e.g. 07:00) but the clock-in timestamp is evening
   (e.g. 19:05) — more than 4 hours off.
2. Log in as that employee (or view the record on the management dashboard).
3. In the attendance history, locate that record.
4. Confirm:
   - The badge does NOT show red "Late In · X min".
   - Instead, an **amber warning banner** is visible below the record.
   - The warning text contains something like:
     `"schedule mismatch"` or `"clock-in time is significantly different"`.
5. On the employee dashboard "Today's Attendance" card (if the mismatch is
   today's record), confirm the amber warning block is visible.

### Expected assertions
```
expect(redLateBadge).not.toBeVisible() // or not to contain "Late In · "
expect(amberWarning).toBeVisible()
expect(amberWarning).toContainText(/schedule|mismatch/i)
```

---

## Scenario 4 — Resolved scheduled start is displayed on dashboard

### Steps
1. Log in as an employee with a schedule set (e.g. 07:00 → 15:00).
2. Navigate to the dashboard.
3. Find the **"Today's Attendance"** card.
4. Confirm that the card shows the resolved schedule start time next to
   the clock-in time (e.g. a label like `"Scheduled 7:00 AM"` or
   `"Schedule: 07:00"`).

### Expected assertions
```
expect(todayCard).toContainText(/[Ss]cheduled?\s*\d{1,2}:\d{2}/)
```

---

## Scenario 5 — Late report CSV only includes post-grace minutes

### Steps
1. Log in as **admin**.
2. Open the **Export** dialog from the management dashboard.
3. Select a month that contains at least one attendance record where the
   employee clocked in after the grace window.
4. Click **"Export Late Report CSV"**.
5. Download and read the CSV.
6. For each row in the CSV:
   - The `"Minutes Late"` column value must represent **minutes past grace**
     (not total minutes past schedule start).
   - A clock-in at 09:20 with a 09:00 schedule and 15-min grace must show
     `"5"`, not `"20"`.
7. Confirm the late report does NOT include rows where the employee was
   within the grace window.

### Expected assertions
```
expect(csvText).not.toContain('N/A')  // in minutes late for late rows
// Parse a known late row and compare minutes
const lateRow = parsedRows.find(r => r['Employee Name'] === employeeName)
expect(parseInt(lateRow['Minutes Late'])).toBe(5) // 20 min clock-in - 15 grace
```

---

## Scenario 6 — CSV filename uses correct month (not off-by-one)

### Steps
1. Log in and open the export dialog.
2. Select **May 2026** from the month picker.
3. Click **"Export CSV (Timecard)"**.
4. Check the downloaded filename:
   - It must contain `"2026_05"` (not `"2026_04"`).
   - E.g. `"John_Doe_timecard_2026_05.csv"`.

### Expected assertions
```
expect(download.suggestedFilename()).toContain('2026_05')
expect(download.suggestedFilename()).not.toContain('2026_04')
```

---

## Scenario 7 — Late minutes display on attendance history badge

### Steps
1. Log in as any employee with known late records.
2. Navigate to their attendance history.
3. For each "Late In" badge:
   - Extract the minute count shown.
   - Cross-reference: the clock-in time minus (scheduled start + 15 min)
     should equal the displayed minutes.
4. Confirm the displayed minutes are ≥ 1 (never shows "0 min" late).

### Expected assertions
```
const badges = page.locator('[data-testid="status-badge"]:has-text("Late In · ")')
for (const badge of await badges.all()) {
  const text = await badge.textContent()
  const mins = parseInt(text.match(/(\d+) min/)[1])
  expect(mins).toBeGreaterThan(0)
}
```

---

## Notes for the test file

- Use `@playwright/test` with TypeScript.
- Read test credentials from `process.env.TEST_ADMIN_EMAIL`,
  `TEST_ADMIN_PASSWORD`, `TEST_EMPLOYEE_EMAIL`, `TEST_EMPLOYEE_PASSWORD`.
- For CSV assertions intercept downloads with `page.waitForEvent('download')`.
- Screenshot every attendance card state under `test-results/late-*.png`.
- Use `page.waitForSelector` with a timeout of 10 s for elements that load
  asynchronously after authentication.
