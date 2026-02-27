import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { Employee, Compensation, AttendanceRecord } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Parse as local calendar date (avoids UTC-midnight shift for YYYY-MM-DD). */
function parseDateForDisplay(value: string | Date): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string' || !value.trim()) return null;
  const s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  
  try {
    let d: Date | null = null;
    
    if (typeof date === 'string') {
      d = parseDateForDisplay(date);
    } else if (date instanceof Date) {
      d = isNaN(date.getTime()) ? null : date;
    } else if (typeof date === 'object') {
      // Handle Firestore Timestamp-like objects
      const anyDate = date as any;
      if (anyDate._seconds !== undefined) {
        d = new Date(anyDate._seconds * 1000);
      } else if (anyDate.seconds !== undefined) {
        d = new Date(anyDate.seconds * 1000);
      } else if (typeof anyDate.toDate === 'function') {
        d = anyDate.toDate();
      } else {
        return 'N/A';
      }
    } else {
      return 'N/A';
    }
    
    if (!d || isNaN(d.getTime())) return 'N/A';
    
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } catch {
    return 'N/A';
  }
}

/** Format time in the user's local timezone (clock in/out and breaks). Handles ISO strings and Firestore-like timestamps. */
export function formatTime(date: string | Date | Record<string, unknown> | null | undefined): string {
  if (date == null) return 'N/A';
  try {
    let d: Date;
    if (date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else if (typeof date === 'object' && date !== null) {
      const t = date as { _seconds?: number; seconds?: number; toDate?: () => Date };
      if (typeof t._seconds === 'number') d = new Date(t._seconds * 1000);
      else if (typeof t.seconds === 'number') d = new Date(t.seconds * 1000);
      else if (typeof t.toDate === 'function') d = t.toDate();
      else return 'N/A';
    } else {
      return 'N/A';
    }
    if (isNaN(d.getTime())) return 'Invalid Time';
    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
    return d.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch {
    return 'Invalid Time';
  }
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

// ==================== TENURE CALCULATION UTILITIES ====================

export interface TenureInfo {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  label: string;
  shortLabel: string;
}

/**
 * Calculate tenure (time since hire date) - Client-side utility
 */
export function calculateTenure(hireDate: string | Date | undefined | null): TenureInfo | null {
  if (!hireDate) return null;
  
  try {
    const hire = typeof hireDate === 'string' ? new Date(hireDate) : hireDate;
    if (isNaN(hire.getTime())) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const hireClone = new Date(hire);
    hireClone.setHours(0, 0, 0, 0);
    
    // Calculate total days
    const totalDays = Math.floor((today.getTime() - hireClone.getTime()) / (1000 * 60 * 60 * 24));
    
    if (totalDays < 0) return null; // Future hire date
    
    // Calculate years, months, days
    let years = today.getFullYear() - hireClone.getFullYear();
    let months = today.getMonth() - hireClone.getMonth();
    let days = today.getDate() - hireClone.getDate();
    
    // Adjust for negative days
    if (days < 0) {
      months--;
      const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      days += lastMonth.getDate();
    }
    
    // Adjust for negative months
    if (months < 0) {
      years--;
      months += 12;
    }
    
    // Generate labels
    let label = '';
    let shortLabel = '';
    
    if (years > 0) {
      label = `${years} year${years !== 1 ? 's' : ''}`;
      shortLabel = `${years}y`;
      if (months > 0) {
        label += `, ${months} month${months !== 1 ? 's' : ''}`;
        shortLabel += ` ${months}m`;
      }
    } else if (months > 0) {
      label = `${months} month${months !== 1 ? 's' : ''}`;
      shortLabel = `${months}m`;
      if (days > 0 && months < 6) {
        label += `, ${days} day${days !== 1 ? 's' : ''}`;
      }
    } else {
      label = `${days} day${days !== 1 ? 's' : ''}`;
      shortLabel = `${days}d`;
    }
    
    return { years, months, days, totalDays, label, shortLabel };
  } catch (error) {
    console.error('Calculate tenure error:', error);
    return null;
  }
}

/**
 * Get milestone type based on years of service
 */
export function getMilestoneType(years: number): 'none' | 'standard' | 'silver' | 'gold' | 'platinum' | 'diamond' {
  if (years < 1) return 'none';
  if (years >= 25) return 'diamond';
  if (years >= 20) return 'platinum';
  if (years >= 10) return 'gold';
  if (years >= 5) return 'silver';
  return 'standard';
}

/**
 * Get tenure label for display
 */
export function getTenureLabel(years: number): string {
  if (years === 1) return '1 Year';
  if (years < 5) return `${years} Years`;
  if (years === 5) return '5 Years (Silver)';
  if (years < 10) return `${years} Years`;
  if (years === 10) return '10 Years (Gold)';
  if (years < 20) return `${years} Years`;
  if (years === 20) return '20 Years (Platinum)';
  if (years < 25) return `${years} Years`;
  if (years === 25) return '25 Years (Diamond)';
  return `${years} Years (Diamond)`;
}

