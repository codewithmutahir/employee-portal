import { Employee, AttendanceRecord, Compensation } from '@/types';
import {
  calculateRegularHours,
  calculateOTHours,
  calculateUnpaidBreaks,
  calculateTotalPaidHours,
  calculateEstimatedWages,
  formatBreakLength,
  formatBreakType,
} from '@/lib/utils';

interface EmployeeExportData {
  employee: Employee;
  compensation: Compensation | null;
  attendance: AttendanceRecord[];
}

export function formatEmployeeDataForPrint(data: EmployeeExportData): string {
  const { employee, compensation, attendance } = data;
  
  let output = '';
  
  // Header
  output += '========================================\n';
  output += 'EMPLOYEE REPORT\n';
  output += `Generated: ${new Date().toLocaleString()}\n`;
  output += '========================================\n\n';
  
  // Employee Information
  output += 'EMPLOYEE INFORMATION\n';
  output += '----------------------------------------\n';
  output += `Name: ${employee.displayName || 'N/A'}\n`;
  output += `Email: ${employee.email || 'N/A'}\n`;
  output += `Employee ID: ${employee.id || 'N/A'}\n`;
  output += `Department: ${employee.department || 'N/A'}\n`;
  output += `Position: ${employee.position || 'N/A'}\n`;
  output += `Status: ${employee.status || 'N/A'}\n`;
  output += `Hire Date: ${employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : 'N/A'}\n`;
  if (employee.phoneNumber) {
    output += `Phone: ${employee.phoneNumber}\n`;
  }
  output += '\n';
  
  // Compensation Information
  if (compensation) {
    output += 'COMPENSATION\n';
    output += '----------------------------------------\n';
    
    if (compensation.salary !== undefined && compensation.salary !== null) {
      output += `Base Salary: ${compensation.salary.toLocaleString()}\n`;
    }
    
    if (compensation.allowance !== undefined && compensation.allowance !== null) {
      output += `Allowance: ${compensation.allowance.toLocaleString()}\n`;
    }
    
    if (compensation.bonus !== undefined && compensation.bonus !== null) {
      output += `Bonuses: ${compensation.bonus.toLocaleString()}\n`;
    }
    
    // Only show if we have at least one compensation field
    if (!compensation.salary && !compensation.allowance && !compensation.bonus) {
      output += 'No compensation data available\n';
    }
    output += '\n';
  }
  
  // Attendance Summary
  output += 'ATTENDANCE SUMMARY\n';
  output += '----------------------------------------\n';
  const totalDays = attendance.length;
  const totalHours = attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0);
  const avgHours = totalDays > 0 ? (totalHours / totalDays).toFixed(2) : '0.00';
  
  output += `Total Days Recorded: ${totalDays}\n`;
  output += `Total Hours Worked: ${totalHours.toFixed(2)}\n`;
  output += `Average Hours/Day: ${avgHours}\n`;
  output += '\n';
  
  // Recent Attendance Records (Last 30 days)
  if (attendance.length > 0) {
    output += 'RECENT ATTENDANCE (Last 30 Records)\n';
    output += '----------------------------------------\n';
    output += 'Date         | Clock In | Clock Out | Hours  | Breaks\n';
    output += '-------------|----------|-----------|--------|--------\n';
    
    attendance.slice(0, 30).forEach(record => {
      const date = record.date || 'N/A';
      const clockIn = record.clockIn ? new Date(record.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
      const clockOut = record.clockOut ? new Date(record.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
      const hours = record.totalHours ? record.totalHours.toFixed(2) : 'N/A';
      const breaks = record.breaks ? record.breaks.length : 0;
      
      output += `${date.padEnd(12)} | ${clockIn.padEnd(8)} | ${clockOut.padEnd(9)} | ${String(hours).padEnd(6)} | ${breaks}\n`;
    });
  }
  
  output += '\n';
  output += '========================================\n';
  
  return output;
}

export function formatEmployeeDataAsCSV(data: EmployeeExportData): string {
  const { employee, compensation, attendance } = data;
  
  let csv = '';
  
  // Employee Information Section
  csv += 'EMPLOYEE INFORMATION\n';
  csv += 'Field,Value\n';
  csv += `Name,"${employee.displayName || 'N/A'}"\n`;
  csv += `Email,"${employee.email || 'N/A'}"\n`;
  csv += `Employee ID,"${employee.id || 'N/A'}"\n`;
  csv += `Department,"${employee.department || 'N/A'}"\n`;
  csv += `Position,"${employee.position || 'N/A'}"\n`;
  csv += `Status,"${employee.status || 'N/A'}"\n`;
  csv += `Hire Date,"${employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : 'N/A'}"\n`;
  csv += `Phone,"${employee.phoneNumber || 'N/A'}"\n`;
  csv += '\n';
  
  // Compensation Section
  if (compensation) {
    csv += 'COMPENSATION\n';
    csv += 'Field,Value\n';
    
    if (compensation.salary !== undefined && compensation.salary !== null) {
      csv += `Salary,"${compensation.salary.toLocaleString()}"\n`;
    }
    
    if (compensation.allowance !== undefined && compensation.allowance !== null) {
      csv += `Allowance,"${compensation.allowance.toLocaleString()}"\n`;
    }
    
    if (compensation.bonus !== undefined && compensation.bonus !== null) {
      csv += `Bonus,"${compensation.bonus.toLocaleString()}"\n`;
    }
    csv += '\n';
  }
  
  return csv;
}

export function formatAllEmployeesDataAsCSV(data: EmployeeExportData[]): string {
  let csv = '';
  
  // Header
  csv += 'ALL EMPLOYEES REPORT\n';
  csv += `Generated: ${new Date().toLocaleString()}\n`;
  csv += '\n';
  
  // Combined Employee & Attendance Data
  csv += 'Employee Name,Email,Department,Position,Status,Hire Date,Total Days,Total Hours,Average Hours\n';
  
  data.forEach(employeeData => {
    const { employee, attendance } = employeeData;
    
    const totalDays = attendance.length;
    const totalHours = attendance.reduce((sum, record) => sum + (record.totalHours || 0), 0);
    const avgHours = totalDays > 0 ? (totalHours / totalDays).toFixed(2) : '0.00';
    
    csv += `"${employee.displayName || 'N/A'}",`;
    csv += `"${employee.email || 'N/A'}",`;
    csv += `"${employee.department || 'N/A'}",`;
    csv += `"${employee.position || 'N/A'}",`;
    csv += `"${employee.status || 'N/A'}",`;
    csv += `"${employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : 'N/A'}",`;
    csv += `${totalDays},`;
    csv += `${totalHours.toFixed(2)},`;
    csv += `${avgHours}\n`;
  });
  
  csv += '\n\n';
  
  // Detailed Attendance for All Employees
  csv += 'DETAILED ATTENDANCE RECORDS\n';
  csv += 'Employee Name,Date,Clock In,Clock Out,Total Hours,Breaks\n';
  
  data.forEach(employeeData => {
    const { employee, attendance } = employeeData;
    
    attendance.forEach(record => {
      const date = record.date || '';
      const clockIn = record.clockIn ? new Date(record.clockIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const clockOut = record.clockOut ? new Date(record.clockOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
      const hours = record.totalHours ? record.totalHours.toFixed(2) : '';
      const breaks = record.breaks ? record.breaks.length : 0;
      
      csv += `"${employee.displayName}",${date},"${clockIn}","${clockOut}",${hours},${breaks}\n`;
    });
  });
  
  return csv;
}

/**
 * Formats employee data as a timecard CSV matching the standard timecard format
 * Each row represents one day's attendance record
 */
export function formatEmployeeDataAsTimecardCSV(data: EmployeeExportData): string {
  const { employee, compensation, attendance } = data;
  
  // Get hourly rate (use hourlyRate if available, otherwise calculate from salary assuming 40h/week)
  const hourlyRate = compensation?.hourlyRate || 
    (compensation?.salary ? compensation.salary / (40 * 52) : undefined);
  
  // CSV Header
  const headers = [
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
    'Wage rate',
    'Actual hours',
    'Total paid hours',
    'Regular hours',
    'Unpaid breaks',
    'OT hours',
    'Estimated wages',
    'No show reason',
    'Employee note',
    'Manager note'
  ];
  
  let csv = headers.join(',') + '\n';
  
  // Sort attendance by date
  const sortedAttendance = [...attendance].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  
  // Process each attendance record
  sortedAttendance.forEach((record) => {
    const clockInDate = record.clockIn ? new Date(record.clockIn) : null;
    const clockOutDate = record.clockOut ? new Date(record.clockOut) : null;
    
    // Format dates
    const clockInDateStr = clockInDate 
      ? clockInDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    const clockInTimeStr = clockInDate 
      ? clockInDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
      : '';
    const clockOutDateStr = clockOutDate 
      ? clockOutDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '';
    const clockOutTimeStr = clockOutDate 
      ? clockOutDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
      : '';
    
    // Get first break (or empty if no breaks)
    const firstBreak = record.breaks && record.breaks.length > 0 ? record.breaks[0] : null;
    const breakStartStr = firstBreak && firstBreak.startTime
      ? new Date(firstBreak.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
      : '';
    const breakEndStr = firstBreak && firstBreak.endTime
      ? new Date(firstBreak.endTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
      : '';
    const breakLengthStr = firstBreak ? formatBreakLength(firstBreak) : '';
    const breakTypeStr = firstBreak ? formatBreakType(firstBreak) : '';
    
    // Calculate hours
    const actualHours = record.totalHours || 0;
    const unpaidBreaks = calculateUnpaidBreaks(record.breaks || []);
    const totalPaidHours = calculateTotalPaidHours(actualHours, unpaidBreaks);
    const regularHours = calculateRegularHours(totalPaidHours);
    const otHours = calculateOTHours(totalPaidHours);
    const estimatedWages = calculateEstimatedWages(regularHours, otHours, hourlyRate);
    
    // Format wage rate
    const wageRateStr = hourlyRate ? `$${hourlyRate.toFixed(2)}` : '$0.00';
    
    // Build row
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
      `"$${estimatedWages.toFixed(2)}"`,
      `"${record.noShowReason || ''}"`,
      `"${record.employeeNote || ''}"`,
      `"${record.managerNote || ''}"`
    ];
    
    csv += row.join(',') + '\n';
  });
  
  // Add totals row
  const totalActualHours = sortedAttendance.reduce((sum, r) => sum + (r.totalHours || 0), 0);
  const totalUnpaidBreaks = sortedAttendance.reduce((sum, r) => 
    sum + calculateUnpaidBreaks(r.breaks || []), 0
  );
  const totalPaidHours = sortedAttendance.reduce((sum, r) => 
    sum + calculateTotalPaidHours(r.totalHours || 0, calculateUnpaidBreaks(r.breaks || [])), 0
  );
  const totalRegularHours = sortedAttendance.reduce((sum, r) => 
    sum + calculateRegularHours(calculateTotalPaidHours(r.totalHours || 0, calculateUnpaidBreaks(r.breaks || []))), 0
  );
  const totalOTHours = sortedAttendance.reduce((sum, r) => 
    sum + calculateOTHours(calculateTotalPaidHours(r.totalHours || 0, calculateUnpaidBreaks(r.breaks || []))), 0
  );
  const totalEstimatedWages = calculateEstimatedWages(totalRegularHours, totalOTHours, hourlyRate);
  
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
    `"$${totalEstimatedWages.toFixed(2)}"`,
    '""',
    '""',
    '""'
  ];
  
  csv += totalsRow.join(',') + '\n';
  
  return csv;
}

/**
 * Formats all employees data as timecard CSV with all employees' records
 */
export function formatAllEmployeesDataAsTimecardCSV(data: EmployeeExportData[]): string {
  // CSV Header
  const headers = [
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
    'Wage rate',
    'Actual hours',
    'Total paid hours',
    'Regular hours',
    'Unpaid breaks',
    'OT hours',
    'Estimated wages',
    'No show reason',
    'Employee note',
    'Manager note'
  ];
  
  let csv = headers.join(',') + '\n';
  
  // Process each employee
  data.forEach((employeeData) => {
    const employeeCSV = formatEmployeeDataAsTimecardCSV(employeeData);
    // Remove header from employee CSV and add rows
    const rows = employeeCSV.split('\n').slice(1).filter(row => row.trim() !== '');
    csv += rows.join('\n') + '\n';
  });
  
  return csv;
}