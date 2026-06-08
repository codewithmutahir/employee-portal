import {
  Employee,
  AttendanceRecord,
  Compensation,
  CompensationHistoryEvent,
  EmployeeDateRangeSchedule,
} from '@/types';
import { resolvePortalTimeZone } from '@/lib/portal-timezone';
import {
  salaryEffectiveOn,
  proratedMonthlySalary,
} from '@/lib/utils/compensation-effective';

export interface EnrichedAttendanceRow {
  employeeName: string;
  employeeId: string;
  record: AttendanceRecord;
  analysis: AttendanceAnalysis;
}

export function enrichEmployeeAttendanceRows(
  employee: Employee,
  scheduleHistory: ScheduleHistoryEntry[] | undefined,
  attendance: AttendanceRecord[],
  dateRangeSchedules?: EmployeeDateRangeSchedule[] | null
): EnrichedAttendanceRow[] {
  const timeZone = resolvePortalTimeZone();
  const allM = attendance
    .filter((r) => r.clockIn)
    .map((r) => clockInToMinutes(r.clockIn!, timeZone));
  const current = {
    scheduleStart: employee.scheduleStart ?? null,
    scheduleEnd: employee.scheduleEnd ?? null,
    dayOff: employee.dayOff ?? null,
  };
  return attendance.map((record) => {
    const resolved = resolveAttendanceSchedule(
      scheduleHistory,
      String(record.date),
      current,
      dateRangeSchedules
    );
    const analysis = computeAttendanceAnalysis({
      date: String(record.date),
      clockIn: record.clockIn,
      totalHours: record.totalHours,
      scheduleStart: resolved.scheduleStart,
      dayOff: resolved.dayOff,
      allClockInMinutes: allM,
      timeZone,
    });
    return {
      employeeName: employee.displayName || '',
      employeeId: employee.id,
      record: { ...record, status: analysis.status },
      analysis,
    };
  });
}

function clockIsoToHHmm(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '';
  }
}

export interface LateExportSummary {
  totalRecords: number;
  onTime: number;
  late: number;
  absent: number;
  totalLateMinutes: number;
  mostLateEmployeeName: string;
  mostLateEmployeeCount: number;
}

export function aggregateLateSummary(rows: EnrichedAttendanceRow[]): LateExportSummary {
  let onTime = 0;
  let late = 0;
  let absent = 0;
  let totalLateMinutes = 0;
  const lateByEmployee = new Map<string, number>();

  for (const row of rows) {
    const { analysis } = row;
    const name = row.employeeName || 'Unknown';
    const isNoSchedule =
      analysis.exportStatus === 'No Schedule' || analysis.lateCategory === 'No Schedule';
    const isAbsent = analysis.exportStatus === 'Absent';
    const isLate =
      analysis.exportStatus === 'Late' ||
      (analysis.exportStatus === 'Half Day' && analysis.isLate);

    if (isAbsent) {
      absent++;
      continue;
    }
    if (isLate) {
      late++;
      totalLateMinutes += analysis.lateMinutes ?? 0;
      lateByEmployee.set(name, (lateByEmployee.get(name) ?? 0) + 1);
      continue;
    }
    if (isNoSchedule) {
      continue;
    }
    onTime++;
  }

  let mostName = '';
  let mostCount = 0;
  for (const [n, c] of lateByEmployee) {
    if (c > mostCount) {
      mostCount = c;
      mostName = n;
    }
  }

  return {
    totalRecords: rows.length,
    onTime,
    late,
    absent,
    totalLateMinutes,
    mostLateEmployeeName: mostName,
    mostLateEmployeeCount: mostCount,
  };
}

function formatLateSummaryBlock(summary: LateExportSummary): string {
  const most =
    summary.mostLateEmployeeName && summary.mostLateEmployeeCount > 0
      ? `${summary.mostLateEmployeeName} (${summary.mostLateEmployeeCount} times late)`
      : 'N/A';
  return [
    '',
    '+------------------------------------------+',
    '| ATTENDANCE LATE SUMMARY (export window)  |',
    '+------------------------------------------+',
    `Total Records: ${summary.totalRecords}`,
    `On Time: ${summary.onTime}`,
    `Late: ${summary.late}`,
    `Absent: ${summary.absent}`,
    `Total Late Minutes: ${summary.totalLateMinutes}`,
    `Most Late Employee: ${most}`,
    '+------------------------------------------+',
    '',
  ].join('\n');
}
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { salaryPerDayForMonth, workingDaysInMonth } from '@/lib/payroll-helpers';
import {
  ScheduleHistoryEntry,
  resolveAttendanceSchedule,
  resolveScheduleForDate,
  resolveScheduleForMonth,
} from '@/lib/schedule-history';
import {
  clockInToMinutes,
  computeAttendanceAnalysis,
  type AttendanceAnalysis,
} from '@/lib/utils/late-calculator';
import {
  calculateRegularHours,
  calculateOTHours,
  calculateUnpaidBreaks,
  calculateTotalPaidHours,
  formatBreakLength,
  formatBreakType,
  formatTime,
  formatPortalGeneratedTimestamp,
} from '@/lib/utils';

interface EmployeeExportData {
  employee: Employee;
  compensation: Compensation | null;
  attendance: AttendanceRecord[];
  scheduleHistory?: ScheduleHistoryEntry[];
  dateRangeSchedules?: EmployeeDateRangeSchedule[];
  /** Optional — when provided, per-row wage rates use the salary effective on each work day. */
  compensationHistory?: CompensationHistoryEvent[];
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Sort and dedupe compensation events for display in report headers. */
function sortedCompensationHistory(
  history: CompensationHistoryEvent[] | undefined
): CompensationHistoryEvent[] {
  if (!history || history.length === 0) return [];
  return [...history].sort(
    (a, b) =>
      new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime()
  );
}

/**
 * Display label for a month's monthly salary. Renders "old → new" when the
 * salary changed inside the month so the reader sees both numbers.
 */
function formatMonthlySalaryDisplay(
  currency: string,
  month: MonthlyBreakdown
): string {
  if (
    month.salaryChangedMidMonth &&
    month.monthlySalaryStart !== null &&
    month.monthlySalaryStart !== month.monthlySalary
  ) {
    return `${currency} ${month.monthlySalaryStart.toLocaleString()} → ${month.monthlySalary.toLocaleString()}`;
  }
  return `${currency} ${month.monthlySalary.toLocaleString()}`;
}

/** Display label for a month's per-day rate (renders "old → new" on change). */
function formatPerDayRateDisplay(
  currency: string,
  month: MonthlyBreakdown
): string {
  if (
    month.salaryChangedMidMonth &&
    month.perDayRateStart !== null &&
    month.perDayRateStart !== month.perDayRate
  ) {
    return `${currency} ${month.perDayRateStart.toLocaleString()} → ${month.perDayRate.toLocaleString()}`;
  }
  return `${currency} ${month.perDayRate.toLocaleString()}`;
}

interface MonthlyBreakdown {
  year: number;
  monthIndex: number;
  monthLabel: string;
  /** Days where the employee actually clocked in / had hours, excluding scheduled day-off attendance. */
  daysAttended: number;
  /** Total physical days with any attendance record (including day-off attendance), kept for context. */
  daysAttendedRaw: number;
  workingDaysInMonth: number;
  /** Monthly salary in effect at the END of this month (dominant rate). */
  monthlySalary: number;
  /**
   * Monthly salary in effect at the START of the month — only populated when
   * the salary changed mid-month, so consumers can render "X → Y".
   */
  monthlySalaryStart: number | null;
  perDayRate: number;
  perDayRateStart: number | null;
  /** True when the salary changed mid-month and `monthlySalaryStart` is set. */
  salaryChangedMidMonth: boolean;
  estimatedWages: number;
  totalHours: number;
  dayOff: string;
}

interface MonthMetaForRecord {
  /** Per-day rate based on the salary that was effective on THIS record's date. */
  perDayRate: number;
  workingDays: number;
  /** Salary that was effective on this record's date. */
  monthlySalary: number;
  monthLabel: string;
  dayOff: string;
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function isOnDayOff(record: AttendanceRecord, dayOff: string | null | undefined): boolean {
  if (!dayOff) return false;
  const d = parseRecordDate(record);
  if (!d) return false;
  const idx = WEEKDAY_NAMES.findIndex((name) => name.toLowerCase() === dayOff.toLowerCase());
  if (idx < 0) return false;
  return d.getDay() === idx;
}

function safeFormatDate(
  dateValue: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateValue) return 'N/A';
  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    if (isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', options);
  } catch {
    return 'N/A';
  }
}

function safeFormatTime(
  dateValue: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateValue) return '';
  try {
    const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...options,
      hour12: true,
    });
  } catch {
    return '';
  }
}

function parseRecordDate(record: AttendanceRecord): Date | null {
  const raw = record.date;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(raw as unknown as string);
  return isNaN(dt.getTime()) ? null : dt;
}

/** True if this record represents an actual working day (employee attended). */
function recordIsAttended(record: AttendanceRecord): boolean {
  if (record.clockIn) return true;
  return Boolean(record.totalHours && record.totalHours > 0);
}

/**
 * Group attendance records by year-month and compute the per-day rate using
 * the schedule that was active at the start of that month. Months with no
 * attendance are excluded entirely (item #2 of the spec).
 */
/**
 * Stable key for {@link buildMonthlyBreakdown}'s per-record lookup.
 *
 * Earlier this map was keyed by the live `AttendanceRecord` object reference,
 * which silently broke once {@link enrichEmployeeAttendanceRows} returned
 * spread copies (`{ ...record, status }`). The CSV exporter would then look
 * the new object up, miss every time, fall through to a `perDayRate = 0`
 * branch, and print `"N/A (add monthly salary in compensation)"` for every
 * row even when compensation was set. Keying by the Firestore doc id (or
 * date+employee fallback) keeps the lookup stable across copies.
 */
function recordLookupKey(record: AttendanceRecord): string {
  if (record.id) return record.id;
  const empPart = record.employeeId ?? '';
  const datePart = record.date ?? '';
  return `${empPart}__${datePart}`;
}

function buildMonthlyBreakdown(
  data: EmployeeExportData
): { months: MonthlyBreakdown[]; perRecordMeta: Map<string, MonthMetaForRecord> } {
  const { employee, compensation, attendance, scheduleHistory, compensationHistory } = data;
  const fallbackSalary =
    compensation?.salary !== undefined && compensation?.salary !== null
      ? Number(compensation.salary) || 0
      : 0;

  const groups = new Map<string, AttendanceRecord[]>();
  for (const record of attendance) {
    const d = parseRecordDate(record);
    if (!d) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(record);
  }

  const months: MonthlyBreakdown[] = [];
  const perRecordMeta = new Map<string, MonthMetaForRecord>();

  for (const [, records] of groups) {
    const first = parseRecordDate(records[0]!)!;
    const year = first.getFullYear();
    const monthIndex = first.getMonth();

    const schedule = resolveScheduleForMonth(scheduleHistory, year, monthIndex, {
      scheduleStart: employee.scheduleStart,
      scheduleEnd: employee.scheduleEnd,
      dayOff: employee.dayOff,
    });
    const dayOff = (schedule.dayOff as string) || employee.dayOff || 'Sunday';

    const wd = workingDaysInMonth(year, monthIndex, dayOff);
    const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

    // Salary in effect at the start vs end of this month — drives the
    // "salary changed mid-month" UI in the monthly summary row.
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const salaryAtStart = salaryEffectiveOn(compensationHistory, fallbackSalary, monthStart);
    const salaryAtEnd = salaryEffectiveOn(compensationHistory, fallbackSalary, monthEnd);
    const salaryChangedMidMonth = salaryAtStart !== salaryAtEnd;

    // Per-record meta uses the salary that was effective on THAT specific
    // day, so the CSV per-row wage rate stays accurate across raises.
    for (const r of records) {
      const recordDate = parseRecordDate(r) ?? first;
      const effectiveSalary = salaryEffectiveOn(
        compensationHistory,
        fallbackSalary,
        recordDate
      );
      const recordPerDay = salaryPerDayForMonth(effectiveSalary, year, monthIndex, dayOff);
      perRecordMeta.set(recordLookupKey(r), {
        perDayRate: recordPerDay,
        workingDays: wd,
        monthlySalary: effectiveSalary,
        monthLabel,
        dayOff,
      });
    }

    const payableAttended = records.filter(
      (r) => recordIsAttended(r) && !isOnDayOff(r, dayOff)
    ).length;
    const daysAttended = Math.min(payableAttended, wd);
    const daysAttendedRaw = records.filter(recordIsAttended).length;
    const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);

    const perDayEnd = salaryPerDayForMonth(salaryAtEnd, year, monthIndex, dayOff);
    const perDayStart = salaryChangedMidMonth
      ? salaryPerDayForMonth(salaryAtStart, year, monthIndex, dayOff)
      : null;

    // Estimated Wages preserves the existing "full monthly salary if
    // attended" semantic. When salary changed mid-month, we prorate per
    // working day so the figure reflects the actual blend of old and new
    // rates over that month.
    const estimatedWages = salaryChangedMidMonth
      ? proratedMonthlySalary(compensationHistory, fallbackSalary, year, monthIndex, dayOff, wd)
      : salaryAtEnd;

    months.push({
      year,
      monthIndex,
      monthLabel,
      daysAttended,
      daysAttendedRaw,
      workingDaysInMonth: wd,
      monthlySalary: salaryAtEnd,
      monthlySalaryStart: salaryChangedMidMonth ? salaryAtStart : null,
      perDayRate: perDayEnd,
      perDayRateStart: perDayStart,
      salaryChangedMidMonth,
      estimatedWages,
      totalHours,
      dayOff,
    });
  }

  months.sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex
  );

  return { months, perRecordMeta };
}

export function formatEmployeeDataForPrint(data: EmployeeExportData): string {
  const { employee, compensation, attendance } = data;
  const cur = compensation?.currency || DEFAULT_CURRENCY;
  const { months } = buildMonthlyBreakdown(data);

  let output = '';

  output += '========================================\n';
  output += 'EMPLOYEE REPORT\n';
  output += `Generated: ${formatPortalGeneratedTimestamp()}\n`;
  output += '========================================\n\n';

  output += 'EMPLOYEE INFORMATION\n';
  output += '----------------------------------------\n';
  output += `Name: ${employee.displayName || 'N/A'}\n`;
  output += `Email: ${employee.email || 'N/A'}\n`;
  output += `Employee ID: ${employee.id || 'N/A'}\n`;
  output += `Department: ${employee.department || 'N/A'}\n`;
  output += `Position: ${employee.position || 'N/A'}\n`;
  output += `Status: ${employee.status || 'N/A'}\n`;
  output += `Hire Date: ${safeFormatDate(employee.hireDate)}\n`;
  if (employee.phoneNumber) {
    output += `Phone: ${employee.phoneNumber}\n`;
  }
  output += '\n';

  if (compensation) {
    output += 'COMPENSATION\n';
    output += '----------------------------------------\n';
    if (compensation.salary !== undefined && compensation.salary !== null) {
      output += `Current Monthly Salary: ${cur} ${Number(compensation.salary).toLocaleString()}\n`;
    }
    if (compensation.allowance !== undefined && compensation.allowance !== null) {
      output += `Allowance: ${cur} ${Number(compensation.allowance).toLocaleString()}\n`;
    }
    if (compensation.bonus !== undefined && compensation.bonus !== null) {
      output += `Bonus: ${cur} ${Number(compensation.bonus).toLocaleString()}\n`;
    }
    if (!compensation.salary && !compensation.allowance && !compensation.bonus) {
      output += 'No compensation data available\n';
    }
    output += '\n';
  }

  const sortedHistory = sortedCompensationHistory(data.compensationHistory);
  if (sortedHistory.length > 0) {
    output += 'SALARY CHANGES\n';
    output += '----------------------------------------\n';
    output += 'Effective Date | Type            | Previous     | New          | Change   | Status\n';
    output += '---------------|-----------------|--------------|--------------|----------|------------\n';
    for (const evt of sortedHistory) {
      const date = safeFormatDate(evt.effectiveDate, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      }).padEnd(14);
      const type = (evt.eventType || '').padEnd(15);
      const prev = (
        evt.previousSalary === null
          ? '—'
          : `${cur} ${evt.previousSalary.toLocaleString()}`
      ).padEnd(12);
      const next = (
        evt.newSalary === null ? '—' : `${cur} ${evt.newSalary.toLocaleString()}`
      ).padEnd(12);
      const change = (
        evt.percentChange === null ? '—' : `${evt.percentChange > 0 ? '+' : ''}${evt.percentChange}%`
      ).padEnd(8);
      const statusBits: string[] = [evt.status];
      if (evt.isRetroactive) statusBits.push('retroactive');
      if (evt.isAmended) statusBits.push('amended');
      output += `${date} | ${type} | ${prev} | ${next} | ${change} | ${statusBits.join(', ')}\n`;
    }
    output += '\n';
  }

  output += 'ATTENDANCE SUMMARY\n';
  output += '----------------------------------------\n';
  const totalDaysRecorded = attendance.length;
  const totalDaysAttended = months.reduce((s, m) => s + m.daysAttended, 0);
  const totalHours = months.reduce((s, m) => s + m.totalHours, 0);
  const avgHours = totalDaysAttended > 0 ? (totalHours / totalDaysAttended).toFixed(2) : '0.00';
  const totalEstimated = months.reduce((s, m) => s + m.estimatedWages, 0);

  output += `Total Days Recorded: ${totalDaysRecorded}\n`;
  output += `Working Days Attended: ${totalDaysAttended}\n`;
  output += `Total Hours Worked: ${totalHours.toFixed(2)}\n`;
  output += `Average Hours/Day (attended): ${avgHours}\n`;
  output += `Estimated Wages: ${cur} ${totalEstimated.toFixed(2)}\n`;
  output += `  Estimated Wages = Monthly Salary for each month with attendance.\n`;
  output += `  Per-Day Rate (Monthly Salary ÷ Working Days in Month) is shown below for reference;\n`;
  output += `  per-day deductions (leaves, late, loan) are applied separately on the salary slip.\n`;
  output += '\n';

  if (months.length > 0) {
    output += 'MONTHLY BREAKDOWN\n';
    output += '----------------------------------------\n';
    output +=
      'Month            | Days Attended | Working Days | Monthly Salary               | Per-Day Rate                 | Estimated Wages\n';
    output +=
      '-----------------|---------------|--------------|------------------------------|------------------------------|-----------------\n';
    months.forEach((m) => {
      const monthCol = m.monthLabel.padEnd(16);
      const daysCol = String(m.daysAttended).padStart(13);
      const wdCol = String(m.workingDaysInMonth).padStart(12);
      const salaryCol = formatMonthlySalaryDisplay(cur, m).padEnd(28);
      const rateCol = formatPerDayRateDisplay(cur, m).padEnd(28);
      const wagesCol = `${cur} ${m.estimatedWages.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`.padStart(15);
      output += `${monthCol} | ${daysCol} | ${wdCol} | ${salaryCol} | ${rateCol} | ${wagesCol}\n`;
    });
    if (months.some((m) => m.salaryChangedMidMonth)) {
      output += '\n';
      output += '  * "→" indicates the salary changed mid-month; left value was effective at the start, right value at the end.\n';
      output += '  * Estimated wages for those months are prorated across the salary change so the full-month figure reflects both rates.\n';
    }
    output += '\n';
  }

  if (attendance.length > 0) {
    const recentDesc = [...attendance]
      .filter((r) => parseRecordDate(r) !== null)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 30);
    const enrichedPrint = enrichEmployeeAttendanceRows(
      employee,
      data.scheduleHistory,
      recentDesc,
      data.dateRangeSchedules
    );

    output += 'RECENT ATTENDANCE (Last 30 Records)\n';
    output += '------------------------------------------------------------------\n';
    output +=
      'Date       | Sched | Actual in | Out     | Hrs  | Late | Min | Status\n';
    output +=
      '-----------|-------|-----------|---------|------|------|-----|------------\n';

    enrichedPrint.forEach(({ record, analysis }) => {
      const date = (record.date || 'N/A').padEnd(10);
      const sched = (analysis.scheduledStartDisplay || '').padEnd(5);
      const actualIn = (clockIsoToHHmm(record.clockIn) || '').padEnd(9);
      const cout = (record.clockOut ? formatTime(record.clockOut) : 'N/A').padEnd(7);
      const hours = record.totalHours ? record.totalHours.toFixed(2) : 'N/A';
      const late = analysis.isLate ? 'Yes ' : 'No  ';
      const mins =
        analysis.lateMinutes === null || analysis.lateMinutes === undefined
          ? 'N/A'
          : String(analysis.lateMinutes);
      output += `${date} | ${sched} | ${actualIn} | ${cout} | ${String(hours).padEnd(4)} | ${late} | ${mins.padEnd(3)} | ${analysis.exportStatus}\n`;
    });

    const sum = aggregateLateSummary(enrichedPrint);
    output += formatLateSummaryBlock(sum);
  }

  output += '\n';
  output += '========================================\n';

  return output;
}

export function formatEmployeeDataAsCSV(data: EmployeeExportData): string {
  const { employee, compensation } = data;
  const cur = compensation?.currency || DEFAULT_CURRENCY;

  let csv = '';

  csv += 'EMPLOYEE INFORMATION\n';
  csv += 'Field,Value\n';
  csv += `Name,"${employee.displayName || 'N/A'}"\n`;
  csv += `Email,"${employee.email || 'N/A'}"\n`;
  csv += `Employee ID,"${employee.id || 'N/A'}"\n`;
  csv += `Department,"${employee.department || 'N/A'}"\n`;
  csv += `Position,"${employee.position || 'N/A'}"\n`;
  csv += `Status,"${employee.status || 'N/A'}"\n`;
  csv += `Hire Date,"${safeFormatDate(employee.hireDate)}"\n`;
  csv += `Phone,"${employee.phoneNumber || 'N/A'}"\n`;
  csv += '\n';

  if (compensation) {
    csv += 'COMPENSATION\n';
    csv += 'Field,Value\n';
    if (compensation.salary !== undefined && compensation.salary !== null) {
      csv += `Current Monthly Salary,"${cur} ${Number(compensation.salary).toLocaleString()}"\n`;
    }
    if (compensation.allowance !== undefined && compensation.allowance !== null) {
      csv += `Allowance,"${cur} ${Number(compensation.allowance).toLocaleString()}"\n`;
    }
    if (compensation.bonus !== undefined && compensation.bonus !== null) {
      csv += `Bonus,"${cur} ${Number(compensation.bonus).toLocaleString()}"\n`;
    }
    csv += '\n';
  }

  const sortedHistory = sortedCompensationHistory(data.compensationHistory);
  if (sortedHistory.length > 0) {
    csv += 'SALARY CHANGES\n';
    csv += 'Effective Date,Event Type,Previous Salary,New Salary,Change %,Status,Reason\n';
    for (const evt of sortedHistory) {
      const date = safeFormatDate(evt.effectiveDate, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
      const prev =
        evt.previousSalary === null ? '' : `${cur} ${evt.previousSalary.toLocaleString()}`;
      const next = evt.newSalary === null ? '' : `${cur} ${evt.newSalary.toLocaleString()}`;
      const change =
        evt.percentChange === null
          ? ''
          : `${evt.percentChange > 0 ? '+' : ''}${evt.percentChange}%`;
      const statusBits: string[] = [evt.status];
      if (evt.isRetroactive) statusBits.push('retroactive');
      if (evt.isAmended) statusBits.push('amended');
      const reason = (evt.reason || '').replace(/"/g, '""');
      csv += `"${date}","${evt.eventType}","${prev}","${next}","${change}","${statusBits.join(', ')}","${reason}"\n`;
    }
    csv += '\n';
  }

  return csv;
}

export function formatAllEmployeesDataAsCSV(data: EmployeeExportData[]): string {
  let csv = '';

  csv += 'ALL EMPLOYEES REPORT\n';
  csv += `Generated: ${formatPortalGeneratedTimestamp()}\n`;
  csv += '\n';

  csv +=
    'Employee Name,Email,Department,Position,Status,Hire Date,Current Monthly Salary,Currency,Latest Salary Change,Working Days Attended,Total Hours,Estimated Wages\n';

  data.forEach((employeeData) => {
    const { employee, compensation } = employeeData;
    const cur = compensation?.currency || DEFAULT_CURRENCY;
    const { months } = buildMonthlyBreakdown(employeeData);

    const totalDaysAttended = months.reduce((s, m) => s + m.daysAttended, 0);
    const totalHours = months.reduce((s, m) => s + m.totalHours, 0);
    const totalEstimated = months.reduce((s, m) => s + m.estimatedWages, 0);

    const sal = compensation?.salary;
    const salStr =
      compensation != null && sal !== undefined && sal !== null && Number(sal) !== 0
        ? String(compensation.salary)
        : '';

    const history = sortedCompensationHistory(employeeData.compensationHistory);
    const latestActiveSalaryChange = (() => {
      const candidates = history.filter(
        (e) => e.newSalary !== null && e.newSalary !== undefined && e.status !== 'superseded'
      );
      if (candidates.length === 0) return '';
      const latest = candidates[candidates.length - 1];
      const dateStr = safeFormatDate(latest.effectiveDate, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
      const prev = latest.previousSalary === null ? '—' : latest.previousSalary.toLocaleString();
      const next = latest.newSalary === null ? '—' : latest.newSalary.toLocaleString();
      return `${dateStr}: ${prev} → ${next}`;
    })();

    csv += `"${employee.displayName || 'N/A'}",`;
    csv += `"${employee.email || 'N/A'}",`;
    csv += `"${employee.department || 'N/A'}",`;
    csv += `"${employee.position || 'N/A'}",`;
    csv += `"${employee.status || 'N/A'}",`;
    csv += `"${safeFormatDate(employee.hireDate)}",`;
    csv += `${salStr},`;
    csv += `"${cur}",`;
    csv += `"${latestActiveSalaryChange}",`;
    csv += `${totalDaysAttended},`;
    csv += `${totalHours.toFixed(2)},`;
    csv += `"${cur} ${totalEstimated.toFixed(2)}"\n`;
  });

  csv += '\n\n';

  const anyHistory = data.some(
    (d) => (d.compensationHistory?.length ?? 0) > 0
  );
  if (anyHistory) {
    csv += 'SALARY CHANGES (ALL EMPLOYEES)\n';
    csv += 'Employee Name,Effective Date,Event Type,Previous Salary,New Salary,Change %,Status,Reason\n';
    data.forEach((employeeData) => {
      const { employee, compensation } = employeeData;
      const cur = compensation?.currency || DEFAULT_CURRENCY;
      for (const evt of sortedCompensationHistory(employeeData.compensationHistory)) {
        const date = safeFormatDate(evt.effectiveDate, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        });
        const prev =
          evt.previousSalary === null ? '' : `${cur} ${evt.previousSalary.toLocaleString()}`;
        const next =
          evt.newSalary === null ? '' : `${cur} ${evt.newSalary.toLocaleString()}`;
        const change =
          evt.percentChange === null
            ? ''
            : `${evt.percentChange > 0 ? '+' : ''}${evt.percentChange}%`;
        const statusBits: string[] = [evt.status];
        if (evt.isRetroactive) statusBits.push('retroactive');
        if (evt.isAmended) statusBits.push('amended');
        const reason = (evt.reason || '').replace(/"/g, '""');
        csv += `"${employee.displayName || 'N/A'}","${date}","${evt.eventType}","${prev}","${next}","${change}","${statusBits.join(', ')}","${reason}"\n`;
      }
    });
    csv += '\n\n';
  }

  csv += 'DETAILED ATTENDANCE RECORDS\n';
  csv +=
    'Employee Name,Date,Scheduled Start,Actual Clock In,Clock In,Clock Out,Hours Worked,Late (Y/N),Minutes Late,Status (export),Breaks\n';

  data.forEach((employeeData) => {
    const { employee, attendance, scheduleHistory } = employeeData;
    const enriched = enrichEmployeeAttendanceRows(
      employee,
      scheduleHistory,
      attendance,
      employeeData.dateRangeSchedules
    );

    enriched.forEach(({ record, analysis }) => {
      const date = record.date || '';
      const clockIn = record.clockIn ? formatTime(record.clockIn) : '';
      const clockOut = record.clockOut ? formatTime(record.clockOut) : '';
      const hours = record.totalHours ? record.totalHours.toFixed(2) : '';
      const breaks = record.breaks ? record.breaks.length : 0;
      const lateYN = analysis.isLate ? 'Yes' : 'No';
      const mins =
        analysis.lateMinutes === null || analysis.lateMinutes === undefined
          ? ''
          : String(analysis.lateMinutes);

      csv += `"${employee.displayName}",${date},"${analysis.scheduledStartDisplay || ''}","${clockIsoToHHmm(record.clockIn)}","${clockIn}","${clockOut}",${hours},"${lateYN}","${mins}","${analysis.exportStatus}",${breaks}\n`;
    });
  });

  const allEnriched = data.flatMap((empData) =>
    enrichEmployeeAttendanceRows(
      empData.employee,
      empData.scheduleHistory,
      empData.attendance,
      empData.dateRangeSchedules
    )
  );
  csv += formatLateSummaryBlock(aggregateLateSummary(allEnriched));

  return csv;
}

const TIMECARD_HEADERS = [
  'Name',
  'Work date',
  'Scheduled start',
  'Actual clock-in (HH:mm)',
  'Clock in date',
  'Clock in time',
  'Clock out date',
  'Clock out time',
  'Break start',
  'Break end',
  'Break length',
  'Break type',
  'Payroll ID',
  'Role',
  'Effective monthly salary',
  'Wage rate (per day)',
  'Hours worked',
  'Total paid hours',
  'Regular hours',
  'Unpaid breaks',
  'OT hours',
  'Estimated wages',
  'Attendance status (portal)',
  'Late (Y/N)',
  'Minutes late',
  'Status (export)',
  'No show reason',
  'Employee note',
  'Manager note',
];

/**
 * Formats employee data as a timecard CSV. Estimated wages and wage rate use
 * the per-day formula (Monthly Salary ÷ Working Days in Month). Hourly logic
 * has been removed entirely.
 */
export function formatEmployeeDataAsTimecardCSV(data: EmployeeExportData): string {
  const { employee, compensation, attendance } = data;
  const cur = compensation?.currency || DEFAULT_CURRENCY;
  const { months, perRecordMeta } = buildMonthlyBreakdown(data);

  const sortedAttendance = [...attendance]
    .filter((r) => parseRecordDate(r) !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const enrichedRows = enrichEmployeeAttendanceRows(
    employee,
    data.scheduleHistory,
    sortedAttendance,
    data.dateRangeSchedules
  );

  const totalActualHours = sortedAttendance.reduce((s, r) => s + (r.totalHours || 0), 0);
  const totalDaysAttended = months.reduce((s, m) => s + m.daysAttended, 0);
  const totalEstimated = months.reduce((s, m) => s + m.estimatedWages, 0);

  let csv = '';

  const monthlySalary =
    compensation?.salary !== undefined && compensation?.salary !== null
      ? Number(compensation.salary) || 0
      : 0;
  const salaryLabel = monthlySalary > 0 ? monthlySalary.toLocaleString() : 'N/A';

  const empties = (n: number) => Array.from({ length: n }, () => '""').join(',');
  csv +=
    `"PAY SUMMARY (per-day formula)",` +
    `"Current monthly salary (${cur}) ${salaryLabel}",` +
    `"Working days attended ${totalDaysAttended}",` +
    `"Estimated wages (${cur}) ${totalEstimated.toFixed(2)}",` +
    `${empties(TIMECARD_HEADERS.length - 4)}\n`;

  const sortedHistory = sortedCompensationHistory(data.compensationHistory);
  if (sortedHistory.length > 0) {
    csv +=
      `"SALARY CHANGES","Effective Date","Event Type","Previous","New","Change %","Status","Reason",${empties(TIMECARD_HEADERS.length - 8)}\n`;
    for (const evt of sortedHistory) {
      const date = safeFormatDate(evt.effectiveDate, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
      const prev =
        evt.previousSalary === null ? '' : `${cur} ${evt.previousSalary.toLocaleString()}`;
      const next =
        evt.newSalary === null ? '' : `${cur} ${evt.newSalary.toLocaleString()}`;
      const change =
        evt.percentChange === null
          ? ''
          : `${evt.percentChange > 0 ? '+' : ''}${evt.percentChange}%`;
        const statusBits: string[] = [evt.status];
        if (evt.isRetroactive) statusBits.push('retroactive');
        if (evt.isAmended) statusBits.push('amended');
        const reason = (evt.reason || '').replace(/"/g, '""');
        csv +=
          `"",` +
          `"${date}",` +
          `"${evt.eventType}",` +
          `"${prev}",` +
          `"${next}",` +
          `"${change}",` +
          `"${statusBits.join(', ')}",` +
          `"${reason}",` +
          `${empties(TIMECARD_HEADERS.length - 8)}\n`;
      }
    }

  if (months.length > 0) {
    csv +=
      `"MONTHLY BREAKDOWN","Month","Days Attended","Working Days","Monthly Salary","Per-Day Rate","Estimated Wages",${empties(TIMECARD_HEADERS.length - 7)}\n`;
    months.forEach((m) => {
      csv +=
        `"",` +
        `"${m.monthLabel}",` +
        `${m.daysAttended},` +
        `${m.workingDaysInMonth},` +
        `"${formatMonthlySalaryDisplay(cur, m)}",` +
        `"${formatPerDayRateDisplay(cur, m)}",` +
        `"${cur} ${m.estimatedWages.toFixed(2)}",` +
        `${empties(TIMECARD_HEADERS.length - 7)}\n`;
    });
  }

  csv += TIMECARD_HEADERS.join(',') + '\n';

  enrichedRows.forEach(({ record, analysis }) => {
    const clockInDateStr = safeFormatDate(record.clockIn, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const clockInTimeStr =
      safeFormatTime(record.clockIn, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })?.toLowerCase() || '';
    const clockOutDateStr = safeFormatDate(record.clockOut, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const clockOutTimeStr =
      safeFormatTime(record.clockOut, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })?.toLowerCase() || '';

    const firstBreak = record.breaks && record.breaks.length > 0 ? record.breaks[0] : null;
    const breakStartStr =
      firstBreak && firstBreak.startTime
        ? safeFormatTime(firstBreak.startTime, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          })?.toLowerCase() || ''
        : '';
    const breakEndStr =
      firstBreak && firstBreak.endTime
        ? new Date(firstBreak.endTime)
            .toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })
            .toLowerCase()
        : '';
    const breakLengthStr = firstBreak ? formatBreakLength(firstBreak) : '';
    const breakTypeStr = firstBreak ? formatBreakType(firstBreak) : '';

    const actualHours = record.totalHours || 0;
    const unpaidBreaks = calculateUnpaidBreaks(record.breaks || []);
    const totalPaidHours = calculateTotalPaidHours(actualHours, unpaidBreaks);
    const regularHours = calculateRegularHours(totalPaidHours);
    const otHours = calculateOTHours(totalPaidHours);

    const meta = perRecordMeta.get(recordLookupKey(record));
    const perDayRate = meta?.perDayRate ?? 0;
    const effectiveSalary = meta?.monthlySalary ?? 0;
    const effectiveSalaryStr =
      effectiveSalary > 0
        ? `${cur} ${effectiveSalary.toLocaleString()}`
        : 'N/A (add monthly salary in compensation)';
    const wageRateStr =
      perDayRate > 0
        ? `${cur} ${perDayRate.toLocaleString()}/day`
        : 'N/A (add monthly salary in compensation)';
    const attended = recordIsAttended(record);
    const onDayOff = isOnDayOff(record, meta?.dayOff);
    const recordEstimated = attended && !onDayOff ? perDayRate : 0;

    const attendanceStatus = record.status || '';
    const lateYN = analysis.isLate ? 'Yes' : 'No';
    const minutesLateStr =
      analysis.lateMinutes === null || analysis.lateMinutes === undefined
        ? ''
        : String(analysis.lateMinutes);
    const schedDisplay = analysis.scheduledStartDisplay || '';
    const workDate = record.date || '';

    const row = [
      `"${employee.displayName || ''}"`,
      `"${workDate}"`,
      `"${schedDisplay}"`,
      `"${clockIsoToHHmm(record.clockIn)}"`,
      `"${clockInDateStr}"`,
      `"${clockInTimeStr}"`,
      `"${clockOutDateStr}"`,
      `"${clockOutTimeStr}"`,
      `"${breakStartStr}"`,
      `"${breakEndStr}"`,
      `"${breakLengthStr}"`,
      `"${breakTypeStr}"`,
      `"${record.payrollId || ''}"`,
      `"${employee.position || employee.role || ''}"`,
      `"${effectiveSalaryStr}"`,
      `"${wageRateStr}"`,
      actualHours.toFixed(2),
      totalPaidHours.toFixed(2),
      regularHours.toFixed(2),
      unpaidBreaks.toFixed(2),
      otHours.toFixed(2),
      `"${cur} ${recordEstimated.toFixed(2)}"`,
      `"${attendanceStatus}"`,
      `"${lateYN}"`,
      `"${minutesLateStr}"`,
      `"${analysis.exportStatus}"`,
      `"${record.noShowReason || ''}"`,
      `"${record.employeeNote || ''}"`,
      `"${record.managerNote || ''}"`,
    ];

    csv += row.join(',') + '\n';
  });

  const totalUnpaidBreaks = sortedAttendance.reduce(
    (sum, r) => sum + calculateUnpaidBreaks(r.breaks || []),
    0
  );
  const totalPaidHours = sortedAttendance.reduce(
    (sum, r) => sum + calculateTotalPaidHours(r.totalHours || 0, calculateUnpaidBreaks(r.breaks || [])),
    0
  );
  const totalRegularHours = sortedAttendance.reduce(
    (sum, r) =>
      sum +
      calculateRegularHours(
        calculateTotalPaidHours(r.totalHours || 0, calculateUnpaidBreaks(r.breaks || []))
      ),
    0
  );
  const totalOTHours = sortedAttendance.reduce(
    (sum, r) =>
      sum +
      calculateOTHours(
        calculateTotalPaidHours(r.totalHours || 0, calculateUnpaidBreaks(r.breaks || []))
      ),
    0
  );

  const totalsRow = [
    `"Totals for ${employee.displayName || ''}"`,
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    totalActualHours.toFixed(2),
    totalPaidHours.toFixed(2),
    totalRegularHours.toFixed(2),
    totalUnpaidBreaks.toFixed(2),
    totalOTHours.toFixed(2),
    `"${cur} ${totalEstimated.toFixed(2)}"`,
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
    '""',
  ];

  csv += totalsRow.join(',') + '\n';

  const summary = aggregateLateSummary(enrichedRows);
  csv += formatLateSummaryBlock(summary);

  return csv;
}

/**
 * Exports only Late + Absent rows for the provided attendance window.
 * Running late count = cumulative late incidents for that employee in date order within the export.
 */
export function formatLateReportCSV(data: EmployeeExportData[]): string {
  type Kind = 'late' | 'absent';

  const raw: {
    employeeName: string;
    date: string;
    scheduledStart: string;
    actualClockIn: string;
    minutesLate: string;
    kind: Kind;
  }[] = [];

  for (const empData of data) {
    const enriched = enrichEmployeeAttendanceRows(
      empData.employee,
      empData.scheduleHistory,
      empData.attendance,
      empData.dateRangeSchedules
    );
    const sorted = [...enriched].sort((a, b) =>
      String(a.record.date).localeCompare(String(b.record.date))
    );

    for (const row of sorted) {
      const { analysis, record } = row;
      const isLateRow =
        analysis.exportStatus === 'Late' ||
        (analysis.exportStatus === 'Half Day' && analysis.isLate);
      const isAbsentRow = analysis.exportStatus === 'Absent';
      if (!isLateRow && !isAbsentRow) continue;

      const minutesLate =
        analysis.lateMinutes === null || analysis.lateMinutes === undefined
          ? 'N/A'
          : String(analysis.lateMinutes);

      raw.push({
        employeeName: empData.employee.displayName || 'Unknown',
        date: String(record.date),
        scheduledStart: analysis.scheduledStartDisplay || '',
        actualClockIn: clockIsoToHHmm(record.clockIn),
        minutesLate: isAbsentRow ? 'N/A' : minutesLate,
        kind: isLateRow ? 'late' : 'absent',
      });
    }
  }

  raw.sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName) || a.date.localeCompare(b.date)
  );

  let csv = 'LATE REPORT (Late + Absent only)\n';
  csv += `Generated: ${formatPortalGeneratedTimestamp()}\n\n`;
  csv +=
    'Employee Name,Date,Scheduled Start,Actual Clock In,Minutes Late,Running Late Count\n';

  for (const r of raw) {
    const running = raw.filter(
      (x) =>
        x.employeeName === r.employeeName &&
        x.kind === 'late' &&
        x.date <= r.date
    ).length;
    csv += `"${r.employeeName}",${r.date},"${r.scheduledStart}","${r.actualClockIn}","${r.minutesLate}",${running}\n`;
  }

  return csv;
}

/** Aggregate timecard CSV for many employees: shared header, per-employee data rows. */
export function formatAllEmployeesDataAsTimecardCSV(data: EmployeeExportData[]): string {
  let csv = TIMECARD_HEADERS.join(',') + '\n';

  const allEnrichedAggregate: EnrichedAttendanceRow[] = [];

  data.forEach((employeeData) => {
    allEnrichedAggregate.push(
      ...enrichEmployeeAttendanceRows(
        employeeData.employee,
        employeeData.scheduleHistory,
        employeeData.attendance,
        employeeData.dateRangeSchedules
      )
    );

    const employeeCSV = formatEmployeeDataAsTimecardCSV(employeeData);
    const lines = employeeCSV.split('\n');
    const headerIdx = lines.findIndex((line) => line.startsWith('Name,Work date,'));
    if (headerIdx === -1) return;

    const dataLines: string[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('+---')) break;
      if (t.includes('ATTENDANCE LATE SUMMARY')) break;
      dataLines.push(line);
      if (t.startsWith('"Totals for')) break;
    }
    if (dataLines.length === 0) return;
    csv += dataLines.join('\n') + '\n';
  });

  csv += formatLateSummaryBlock(aggregateLateSummary(allEnrichedAggregate));

  return csv;
}
