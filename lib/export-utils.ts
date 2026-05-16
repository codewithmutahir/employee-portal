import { Employee, AttendanceRecord, Compensation } from '@/types';
import { resolvePortalTimeZone } from '@/lib/portal-timezone';

export interface EnrichedAttendanceRow {
  employeeName: string;
  employeeId: string;
  record: AttendanceRecord;
  analysis: AttendanceAnalysis;
}

export function enrichEmployeeAttendanceRows(
  employee: Employee,
  scheduleHistory: ScheduleHistoryEntry[] | undefined,
  attendance: AttendanceRecord[]
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
    const resolved = resolveScheduleForDate(scheduleHistory, String(record.date), current);
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

interface MonthlyBreakdown {
  year: number;
  monthIndex: number;
  monthLabel: string;
  /** Days where the employee actually clocked in / had hours, excluding scheduled day-off attendance. */
  daysAttended: number;
  /** Total physical days with any attendance record (including day-off attendance), kept for context. */
  daysAttendedRaw: number;
  workingDaysInMonth: number;
  monthlySalary: number;
  perDayRate: number;
  estimatedWages: number;
  totalHours: number;
  dayOff: string;
}

interface MonthMetaForRecord {
  perDayRate: number;
  workingDays: number;
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
function buildMonthlyBreakdown(
  data: EmployeeExportData
): { months: MonthlyBreakdown[]; perRecordMeta: Map<AttendanceRecord, MonthMetaForRecord> } {
  const { employee, compensation, attendance, scheduleHistory } = data;
  const monthlySalary =
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
  const perRecordMeta = new Map<AttendanceRecord, MonthMetaForRecord>();

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
    const perDay = salaryPerDayForMonth(monthlySalary, year, monthIndex, dayOff);

    const payableAttended = records.filter(
      (r) => recordIsAttended(r) && !isOnDayOff(r, dayOff)
    ).length;
    const daysAttended = Math.min(payableAttended, wd);
    const daysAttendedRaw = records.filter(recordIsAttended).length;
    const totalHours = records.reduce((sum, r) => sum + (r.totalHours || 0), 0);
    const monthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

    const meta: MonthMetaForRecord = {
      perDayRate: perDay,
      workingDays: wd,
      monthlySalary,
      monthLabel,
      dayOff,
    };
    for (const r of records) perRecordMeta.set(r, meta);

    // Estimated Wages mirrors the portal's salary slip: the employee's full
    // monthly salary for any month they have attendance. Per-day rate and
    // days-attended numbers stay as informational context. Day-by-day
    // deductions (leaves/late) are tracked separately on the dashboard.
    months.push({
      year,
      monthIndex,
      monthLabel,
      daysAttended,
      daysAttendedRaw,
      workingDaysInMonth: wd,
      monthlySalary,
      perDayRate: perDay,
      estimatedWages: monthlySalary,
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
      output += `Monthly Salary: ${cur} ${Number(compensation.salary).toLocaleString()}\n`;
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
    output += 'Month            | Days Attended | Working Days | Per-Day Rate | Estimated Wages\n';
    output += '-----------------|---------------|--------------|--------------|-----------------\n';
    months.forEach((m) => {
      const monthCol = m.monthLabel.padEnd(16);
      const daysCol = String(m.daysAttended).padStart(13);
      const wdCol = String(m.workingDaysInMonth).padStart(12);
      const rateCol = `${cur} ${m.perDayRate.toLocaleString()}`.padStart(12);
      const wagesCol = `${cur} ${m.estimatedWages.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`.padStart(15);
      output += `${monthCol} | ${daysCol} | ${wdCol} | ${rateCol} | ${wagesCol}\n`;
    });
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
      recentDesc
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
      csv += `Monthly Salary,"${cur} ${Number(compensation.salary).toLocaleString()}"\n`;
    }
    if (compensation.allowance !== undefined && compensation.allowance !== null) {
      csv += `Allowance,"${cur} ${Number(compensation.allowance).toLocaleString()}"\n`;
    }
    if (compensation.bonus !== undefined && compensation.bonus !== null) {
      csv += `Bonus,"${cur} ${Number(compensation.bonus).toLocaleString()}"\n`;
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
    'Employee Name,Email,Department,Position,Status,Hire Date,Monthly Salary,Currency,Working Days Attended,Total Hours,Estimated Wages\n';

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

    csv += `"${employee.displayName || 'N/A'}",`;
    csv += `"${employee.email || 'N/A'}",`;
    csv += `"${employee.department || 'N/A'}",`;
    csv += `"${employee.position || 'N/A'}",`;
    csv += `"${employee.status || 'N/A'}",`;
    csv += `"${safeFormatDate(employee.hireDate)}",`;
    csv += `${salStr},`;
    csv += `"${cur}",`;
    csv += `${totalDaysAttended},`;
    csv += `${totalHours.toFixed(2)},`;
    csv += `"${cur} ${totalEstimated.toFixed(2)}"\n`;
  });

  csv += '\n\n';

  csv += 'DETAILED ATTENDANCE RECORDS\n';
  csv +=
    'Employee Name,Date,Scheduled Start,Actual Clock In,Clock In,Clock Out,Hours Worked,Late (Y/N),Minutes Late,Status (export),Breaks\n';

  data.forEach((employeeData) => {
    const { employee, attendance, scheduleHistory } = employeeData;
    const enriched = enrichEmployeeAttendanceRows(employee, scheduleHistory, attendance);

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
    enrichEmployeeAttendanceRows(empData.employee, empData.scheduleHistory, empData.attendance)
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
    sortedAttendance
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
    `"Monthly salary (${cur}) ${salaryLabel}",` +
    `"Working days attended ${totalDaysAttended}",` +
    `"Estimated wages (${cur}) ${totalEstimated.toFixed(2)}",` +
    `${empties(TIMECARD_HEADERS.length - 4)}\n`;

  if (months.length > 0) {
    csv +=
      `"MONTHLY BREAKDOWN","Month","Days Attended","Working Days","Per-Day Rate","Estimated Wages",${empties(TIMECARD_HEADERS.length - 6)}\n`;
    months.forEach((m) => {
      csv +=
        `"",` +
        `"${m.monthLabel}",` +
        `${m.daysAttended},` +
        `${m.workingDaysInMonth},` +
        `"${cur} ${m.perDayRate.toLocaleString()}",` +
        `"${cur} ${m.estimatedWages.toFixed(2)}",` +
        `${empties(TIMECARD_HEADERS.length - 6)}\n`;
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

    const meta = perRecordMeta.get(record);
    const perDayRate = meta?.perDayRate ?? 0;
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
      empData.attendance
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
        employeeData.attendance
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
