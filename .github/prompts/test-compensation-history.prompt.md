---
description: >
  Agentic test — Compensation history management (admin side).
  Verifies the "Add Compensation Event" dialog, retroactive / scheduled
  events, status badges (Active, Scheduled, Superseded, Backdated, Amended),
  same-day override, and the read-only history list in the management
  dashboard.
tools: ['playwright']
mode: 'agent'
---

You are a senior QA engineer testing an employee portal built with Next.js.
The app runs at http://localhost:3000.

DO NOT fabricate. Run real steps, observe real UI, assert on actual content.

Steps for every scenario:
1. Log in and navigate.
2. Interact with actual form controls.
3. Screenshot before and after each action.
4. Write assertions on visible text, badges, and element states.
5. Save to `tests/compensation-history.spec.ts`.
6. Run with `npx playwright test tests/compensation-history.spec.ts`.
7. Iterate until green.

---

## Scenario 1 — Compensation History section renders correctly

### Steps
1. Log in as **admin**.
2. Select any active employee from the management dashboard.
3. Click the **Compensation** tab (or scroll to the Compensation card).
4. Find the **"Compensation History"** section.
5. Confirm it renders one of:
   - `"No compensation events yet."` if the employee has no history.
   - A list of rows if history exists.
6. Each history row must contain exactly 6 columns:
   - Effective date, Event type, `previous → new` salary, percent change,
     position change, status badge.

### Expected assertions
```
const historySection = page.locator('text=Compensation History')
await expect(historySection).toBeVisible()
```

---

## Scenario 2 — Add Compensation Event dialog opens and closes

### Steps
1. Click **"Add Compensation Event"** button.
2. Confirm the dialog opens with:
   - A "Event type" select defaulting to some value.
   - A "New salary" number input.
   - An "Effective date" date input.
   - A "Reason" textarea.
3. Click **Cancel** and confirm the dialog closes without saving.
4. Confirm the Compensation History list is unchanged.

### Expected assertions
```
await expect(dialog).toBeVisible()
await expect(page.getByLabel('New salary')).toBeVisible()
await expect(page.getByLabel('Effective date')).toBeVisible()
await page.click('text=Cancel')
await expect(dialog).not.toBeVisible()
```

---

## Scenario 3 — Saving a future-dated event creates "Scheduled" status

### Steps
1. Click **"Add Compensation Event"**.
2. Select event type `"Merit Increase"`.
3. Enter a new salary (e.g. current + 10 %).
4. Set the effective date to **30 days from today** (a future date).
5. Leave reason empty.
6. Click **Save**.
7. Confirm a success toast appears.
8. In the history list, find the new row.
9. Confirm its status badge reads **"Scheduled"** with blue styling.
10. Confirm a clock icon (⏰) is visible in the badge.

### Expected assertions
```
const newRow = page.locator('.compensation-event-row').first()
await expect(newRow).toContainText('Scheduled')
await expect(newRow.locator('[aria-hidden="true"]')).toBeVisible() // clock icon
```

---

## Scenario 4 — Saving a past-dated event creates "Active" + "Backdated"

### Steps
1. Click **"Add Compensation Event"** (override any conflicting events if
   needed by checking "Allow same-day override").
2. Select event type `"Merit Increase"`.
3. Enter a new salary.
4. Set effective date to **60 days ago**.
5. Enter reason `"Back-pay adjustment"`.
6. Click **Save**.
7. In the history list, the saved row must have:
   - Status badge: **"Active"** with green styling.
   - An amber **"Backdated"** tag noting retroactive entry.
   - `"Back-pay adjustment"` in a reason field or tooltip.

### Expected assertions
```
await expect(newRow).toContainText('Active')
await expect(newRow.locator('text=Backdated')).not.toBeVisible() // Badge only in employee view
// OR check "isRetroactive" is rendered as Amended / retroactive note
await expect(newRow).not.toContainText('Scheduled')
```

Note: The management dashboard history list shows the raw event data.
The amber "Backdated" badge is shown on the **employee-facing** Salary
Changes card. On the admin side, `isRetroactive: true` is stored but the
badge depends on the current implementation — inspect what's actually shown.

---

## Scenario 5 — Same-day conflict blocked without override

### Steps
1. Note today's date.
2. Add an event with today's effective date.
3. Try to add a **second** event with today's effective date without
   checking "Allow same-day override".
4. Click **Save**.
5. Confirm an error toast or inline error appears containing the text
   `"Another compensation event is already"` or similar.
6. Confirm no new row was added to the history list.

### Expected assertions
```
await expect(page.locator('[role="alert"]')).toContainText(/already.*scheduled|Another.*event/i)
```

---

## Scenario 6 — Same-day override allows two events on same date

### Steps
1. After the block in Scenario 5, re-open the dialog.
2. Fill in the same date again.
3. Check **"Allow same-day override"**.
4. Click **Save**.
5. Confirm no error appears and the event is added.

### Expected assertions
```
await expect(toast).toContainText(/success|saved/i)
const rows = page.locator('.compensation-event-row')
expect(await rows.count()).toBeGreaterThanOrEqual(2)
```

---

## Scenario 7 — Payroll preview updates live when salary input changes

### Steps
1. In the Compensation form (NOT the Add Event dialog), change the
   **Salary** input value.
2. Observe the **"Payroll preview (this month)"** box below the form.
3. Confirm the "Salary per day" value updates to reflect the new salary
   divided by the number of working days shown.

### Expected assertions
```
await page.fill('#salary', '60000')
const preview = page.locator('text=Payroll preview')
await expect(preview).toContainText('60,000')
// Salary per day = 60000 / workingDays
```

---

## Scenario 8 — Amended events display "Amended" tag and strikethrough

### Steps
1. Find an existing event ID from the history list (look at DOM / network).
2. Add a new event of type `"Correction/Amendment"` and paste the old
   event ID into the "Amends event id" field.
3. Save.
4. In the history list:
   - The original event row should now show a strikethrough style and
     an **"Amended"** badge.
   - The new Correction event should be visible as Active.

### Expected assertions
```
const amendedRow = page.locator('.compensation-event-row.line-through')
await expect(amendedRow).toBeVisible()
await expect(amendedRow).toContainText('Amended')
```

---

## Notes for the test file

- Use `@playwright/test` with TypeScript.
- Store credentials in `.env.test` or read from `process.env`.
- The dialog selector is likely `[role="dialog"]:has-text("Add Compensation Event")`.
- Screenshot at each dialog state: open, filled, error, saved.
- Save screenshots to `test-results/comp-history-*.png`.
