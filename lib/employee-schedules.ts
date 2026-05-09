import type {
  EmployeeDateRangeSchedule,
  EmployeeScheduleDays,
  EmployeeScheduleStatus,
  ScheduleWeekdayKey,
} from '@/types';

export const SCHEDULE_WEEKDAYS: ScheduleWeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export function emptyScheduleDays(): EmployeeScheduleDays {
  return {
    monday: { active: false, shiftStart: '09:00', shiftEnd: '18:00' },
    tuesday: { active: false, shiftStart: '09:00', shiftEnd: '18:00' },
    wednesday: { active: false, shiftStart: '09:00', shiftEnd: '18:00' },
    thursday: { active: false, shiftStart: '09:00', shiftEnd: '18:00' },
    friday: { active: false, shiftStart: '09:00', shiftEnd: '18:00' },
    saturday: { active: false, shiftStart: '09:00', shiftEnd: '18:00' },
    sunday: { active: false, shiftStart: '09:00', shiftEnd: '18:00' },
  };
}

function atStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function computeScheduleStatus(
  startDate: Date,
  endDate: Date | null | undefined,
  refDate: Date = new Date()
): EmployeeScheduleStatus {
  const start = atStartOfDay(startDate);
  const ref = atStartOfDay(refDate);
  const end = endDate ? atStartOfDay(endDate) : null;
  if (start > ref) return 'upcoming';
  if (end && end < ref) return 'expired';
  return 'active';
}

export function scheduleRangesOverlap(
  startA: Date,
  endA: Date | null,
  startB: Date,
  endB: Date | null
): boolean {
  const aStart = atStartOfDay(startA).getTime();
  const bStart = atStartOfDay(startB).getTime();
  const aEnd = endA ? atStartOfDay(endA).getTime() : Number.POSITIVE_INFINITY;
  const bEnd = endB ? atStartOfDay(endB).getTime() : Number.POSITIVE_INFINITY;
  return aStart <= bEnd && bStart <= aEnd;
}

export function overlappingDays(
  a: EmployeeScheduleDays,
  b: EmployeeScheduleDays
): ScheduleWeekdayKey[] {
  return SCHEDULE_WEEKDAYS.filter((k) => a[k].active && b[k].active);
}

export function formatWeekdayLabel(day: ScheduleWeekdayKey): string {
  return `${day[0].toUpperCase()}${day.slice(1)}`;
}

export function activeDaysCount(days: EmployeeScheduleDays): number {
  return SCHEDULE_WEEKDAYS.filter((k) => days[k].active).length;
}

export function dominantScheduleForDate(
  schedules: EmployeeDateRangeSchedule[],
  date: Date = new Date()
): EmployeeDateRangeSchedule | null {
  const active = schedules.filter((s) => s.status === 'active');
  if (active.length === 0) return null;
  const target = atStartOfDay(date).getTime();
  const todays = active.filter((s) => {
    const start = new Date(s.startDate);
    const end = s.endDate ? new Date(s.endDate) : null;
    const startsOk = atStartOfDay(start).getTime() <= target;
    const endsOk = !end || atStartOfDay(end).getTime() >= target;
    return startsOk && endsOk;
  });
  if (todays.length === 0) return null;
  return [...todays].sort((a, b) => {
    const dayDiff = activeDaysCount(b.days) - activeDaysCount(a.days);
    if (dayDiff !== 0) return dayDiff;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  })[0];
}

export function resolveActiveScheduleForDate(
  schedules: EmployeeDateRangeSchedule[],
  date: Date = new Date()
): EmployeeDateRangeSchedule[] {
  const target = atStartOfDay(date).getTime();
  return schedules.filter((s) => {
    if (s.status !== 'active') return false;
    const start = atStartOfDay(new Date(s.startDate)).getTime();
    const end = s.endDate ? atStartOfDay(new Date(s.endDate)).getTime() : Number.POSITIVE_INFINITY;
    return start <= target && target <= end;
  });
}
