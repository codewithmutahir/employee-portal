/**
 * Monthly salary ÷ working days in calendar month (days minus scheduled day-off occurrences).
 */

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function countDayOffOccurrencesInMonth(
  year: number,
  monthIndex: number,
  dayOffName?: string | null
): number {
  const name = (dayOffName || 'Sunday').trim();
  const idx = WEEKDAY_NAMES.findIndex((d) => d.toLowerCase() === name.toLowerCase());
  if (idx < 0) return 0;
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= dim; day++) {
    if (new Date(year, monthIndex, day).getDay() === idx) count++;
  }
  return count;
}

export function workingDaysInMonth(
  year: number,
  monthIndex: number,
  dayOff?: string | null
): number {
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  return dim - countDayOffOccurrencesInMonth(year, monthIndex, dayOff);
}

/** Rounded to whole units like sample slips (e.g. 2,404). */
export function salaryPerDayForMonth(
  monthlySalary: number,
  year: number,
  monthIndex: number,
  dayOff?: string | null
): number {
  const wd = workingDaysInMonth(year, monthIndex, dayOff);
  if (wd <= 0 || !monthlySalary) return 0;
  return Math.round(monthlySalary / wd);
}
