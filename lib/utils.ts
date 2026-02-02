import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Employee, Compensation, AttendanceRecord } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)} at ${formatTime(date)}`;
}

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function isToday(dateString: string): boolean {
  return dateString === getTodayDateString();
}

export function calculateHours(clockIn: string, clockOut: string, breaks: Array<{ startTime: string; endTime?: string }>): number {
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  const totalMs = end - start;
  
  let breakMs = 0;
  breaks.forEach(breakRecord => {
    if (breakRecord.endTime) {
      breakMs += new Date(breakRecord.endTime).getTime() - new Date(breakRecord.startTime).getTime();
    }
  });
  
  const workMs = totalMs - breakMs;
  return Math.round((workMs / (1000 * 60 * 60)) * 100) / 100; // Round to 2 decimal places
}

export function formatEmployeeDataForPrint(data: {
  employee: Employee;
  compensation: Compensation | null;
  attendance: AttendanceRecord[];
}): string {
  let output = `
EMPLOYEE REPORT
===============

EMPLOYEE INFORMATION
--------------------
Name: ${data.employee.displayName}
Email: ${data.employee.email}
Department: ${data.employee.department || 'N/A'}
Position: ${data.employee.position || 'N/A'}
Status: ${data.employee.status}
Hire Date: ${formatDate(data.employee.hireDate)}
${data.employee.dateOfBirth ? `Date of Birth: ${formatDate(data.employee.dateOfBirth)}` : ''}

COMPENSATION
------------
`;

  if (data.compensation) {
    output += `
Salary: ${data.compensation.currency} ${data.compensation.salary.toLocaleString()}
${data.compensation.allowance ? `Allowance: ${data.compensation.currency} ${data.compensation.allowance.toLocaleString()}` : ''}
${data.compensation.bonus ? `Bonus: ${data.compensation.currency} ${data.compensation.bonus.toLocaleString()}` : ''}
Last Updated: ${formatDate(data.compensation.updatedAt)}
`;
  } else {
    output += 'No compensation data available\n';
  }

  output += `
ATTENDANCE RECORDS (Last 365 days)
-----------------------------------
`;

  if (data.attendance.length > 0) {
    data.attendance.forEach((record) => {
      output += `
Date: ${formatDate(record.date)}
${record.clockIn ? `Clock In: ${new Date(record.clockIn).toLocaleTimeString()}` : 'No clock in'}
${record.clockOut ? `Clock Out: ${new Date(record.clockOut).toLocaleTimeString()}` : 'No clock out'}
${record.totalHours !== undefined ? `Total Hours: ${record.totalHours}` : ''}
${record.isEditedByManagement ? 'Edited by Management' : ''}
---`;
    });
  } else {
    output += 'No attendance records\n';
  }

  output += `\n\nGenerated: ${new Date().toLocaleString()}\n`;

  return output;
}

// Timecard calculation utilities
export function calculateRegularHours(totalHours: number, otThreshold: number = 8): number {
  return Math.min(totalHours, otThreshold);
}

export function calculateOTHours(totalHours: number, otThreshold: number = 8): number {
  return Math.max(0, totalHours - otThreshold);
}

export function calculateUnpaidBreaks(breaks: Array<{ isPaid?: boolean; duration?: number }>): number {
  let unpaidMinutes = 0;
  breaks.forEach(breakRecord => {
    if (breakRecord.isPaid === false && breakRecord.duration) {
      unpaidMinutes += breakRecord.duration;
    }
  });
  return Math.round((unpaidMinutes / 60) * 100) / 100; // Convert to hours, round to 2 decimals
}

export function calculateTotalPaidHours(totalHours: number, unpaidBreaks: number): number {
  return Math.max(0, totalHours - unpaidBreaks);
}

export function calculateEstimatedWages(
  regularHours: number,
  otHours: number,
  hourlyRate?: number,
  otMultiplier: number = 1.5
): number {
  if (!hourlyRate) return 0;
  const regularWages = regularHours * hourlyRate;
  const otWages = otHours * hourlyRate * otMultiplier;
  return Math.round((regularWages + otWages) * 100) / 100;
}

export function formatBreakLength(breakRecord: { startTime: string; endTime?: string; duration?: number }): string {
  if (breakRecord.duration !== undefined) {
    const hours = Math.floor(breakRecord.duration / 60);
    const minutes = breakRecord.duration % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}min`;
    }
    return `${minutes} min`;
  }
  if (breakRecord.endTime) {
    const start = new Date(breakRecord.startTime).getTime();
    const end = new Date(breakRecord.endTime).getTime();
    const minutes = Math.round((end - start) / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins} min`;
  }
  return '';
}

export function formatBreakType(breakRecord: { type?: string; isPaid?: boolean; duration?: number }): string {
  if (breakRecord.type) {
    return breakRecord.type;
  }
  // Generate default break type based on duration and paid status
  if (breakRecord.duration !== undefined) {
    const paidStatus = breakRecord.isPaid ? 'Paid' : 'Unpaid';
    if (breakRecord.duration <= 15) {
      return `${breakRecord.duration} min - ${paidStatus}`;
    } else if (breakRecord.duration <= 30) {
      return `30 min - ${paidStatus}`;
    } else {
      return `Lunch - ${paidStatus}`;
    }
  }
  return '';
}

