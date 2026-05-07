import { Employee, AttendanceRecord, Compensation } from '@/types';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { salaryPerDayForMonth, workingDaysInMonth } from '@/lib/payroll-helpers';
import {
  ScheduleHistoryEntry,
  resolveScheduleForMonth,
} from '@/lib/schedule-history';
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

    // Day-off attendance does not add to base pay (employee can't earn more
    // than their monthly salary). Only count attendance on scheduled working
    // days, and cap at the working days in the month as a safety belt.
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

    months.push({
      year,
      monthIndex,
      monthLabel,
      daysAttended,
      daysAttendedRaw,
      workingDaysInMonth: wd,
      monthlySalary,
      perDayRate: perDay,
      estimatedWages: daysAttended * perDay,
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
  output += `  Formula: Working Days Attended × (Monthly Salary ÷ Working Days in Month)\n`;
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
    output += 'RECENT ATTENDANCE (Last 30 Records)\n';
    output += '----------------------------------------\n';
    output += 'Date         | Clock In | Clock Out | Hours  | Status     | Breaks\n';
    output += '-------------|----------|-----------|--------|------------|--------\n';

    attendance.slice(0, 30).forEach((record) => {
      const date = record.date || 'N/A';
      const clockIn = record.clockIn ? formatTime(record.clockIn) : 'N/A';
      const clockOut = record.clockOut ? formatTime(record.clockOut) : 'N/A';
      const hours = record.totalHours ? record.totalHours.toFixed(2) : 'N/A';
      const status = record.status || '';
      const breaks = record.breaks ? record.breaks.length : 0;
      output += `${date.padEnd(12)} | ${clockIn.padEnd(8)} | ${clockOut.padEnd(9)} | ${String(hours).padEnd(6)} | ${status.padEnd(10)} | ${breaks}\n`;
    });
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
  csv += 'Employee Name,Date,Clock In,Clock Out,Total Hours,Status,Breaks\n';

  data.forEach((employeeData) => {
    const { employee, attendance } = employeeData;

    attendance.forEach((record) => {
      const date = record.date || '';
      const clockIn = record.clockIn ? formatTime(record.clockIn) : '';
      const clockOut = record.clockOut ? formatTime(record.clockOut) : '';
      const hours = record.totalHours ? record.totalHours.toFixed(2) : '';
      const status = record.status || '';
      const breaks = record.breaks ? record.breaks.length : 0;

      csv += `"${employee.displayName}",${date},"${clockIn}","${clockOut}",${hours},"${status}",${breaks}\n`;
    });
  });

  return csv;
}

const TIMECARD_HEADERS = [
  'Name',
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
  'Actual hours',
  'Total paid hours',
  'Regular hours',
  'Unpaid breaks',
  'OT hours',
  'Estimated wages',
  'Attendance status',
  'Late',
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

  sortedAttendance.forEach((record) => {
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
    const lateFlag = attendanceStatus === 'Late In' ? 'Late In' : '';

    const row = [
      `"${employee.displayName || ''}"`,
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
      `"${lateFlag}"`,
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
  ];

  csv += totalsRow.join(',') + '\n';

  return csv;
}

/** Aggregate timecard CSV for many employees: shared header, per-employee data rows. */
export function formatAllEmployeesDataAsTimecardCSV(data: EmployeeExportData[]): string {
  let csv = TIMECARD_HEADERS.join(',') + '\n';

  data.forEach((employeeData) => {
    const employeeCSV = formatEmployeeDataAsTimecardCSV(employeeData);
    const lines = employeeCSV.split('\n');
    const headerIdx = lines.findIndex((line) => line.startsWith('Name,Clock in date,'));
    if (headerIdx === -1) return;
    const dataLines = lines.slice(headerIdx + 1).filter((line) => line.trim() !== '');
    if (dataLines.length === 0) return;
    csv += dataLines.join('\n') + '\n';
  });

  return csv;
}
