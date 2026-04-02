import type { AttendanceRecord, AttendanceStatus } from '@/types';

/**
 * Single display rule for attendance rows: prefer server `status`, handle open shifts,
 * and match mobile app fallbacks.
 */
export function resolveAttendanceStatusLabel(record: AttendanceRecord): AttendanceStatus | 'Partial' {
  if (!record.clockIn) {
    return record.status ?? 'Absent';
  }
  if (!record.clockOut) {
    return 'Partial';
  }
  return record.status ?? 'On Time';
}
