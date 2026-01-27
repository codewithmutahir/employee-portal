export type UserRole = 'employee' | 'management';

export type EmployeeStatus = 'active' | 'terminated';

export interface Department {
  id: string;
  name: string;
  description?: string;
  managerId?: string; // ID of department manager
  createdAt: string;
  updatedAt: string;
}

export interface Employee {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: EmployeeStatus;
  department?: string; // Department name (can reference Department.id)
  departmentId?: string; // Reference to Department document
  position?: string;
  phoneNumber?: string;
  dateOfBirth?: string; // ISO date string
  hireDate: string; // ISO date string
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface Compensation {
  employeeId: string;
  salary: number;
  allowance?: number;
  bonus?: number;
  currency: string;
  updatedAt: string; // ISO date string
  updatedBy: string; // User ID
  hourlyRate?: number; // Hourly wage rate for timecard calculations
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD format
  clockIn?: string; // ISO timestamp
  clockOut?: string; // ISO timestamp
  breaks: BreakRecord[];
  totalHours?: number; // Calculated
  editedBy?: string; // User ID - tracks who edited (employee or management)
  editedAt?: string; // ISO timestamp
  isEditedByManagement: boolean;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  payrollId?: string; // Payroll identifier
  noShowReason?: string; // Reason for no-show
  employeeNote?: string; // Note from employee
  managerNote?: string; // Note from manager
}

export interface BreakRecord {
  startTime: string; // ISO timestamp
  endTime?: string; // ISO timestamp
  duration?: number; // minutes
  type?: string; // e.g., "10 min - Paid", "30 min - Unpaid", "Lunch - Unpaid"
  isPaid?: boolean; // Whether the break is paid
}

export interface Note {
  id: string;
  employeeId: string;
  content: string;
  createdBy: string; // User ID
  createdAt: string; // ISO timestamp
  isInternal: boolean; // Only visible to management if true
  acknowledgedAt?: string; // ISO timestamp when acknowledged
  acknowledgedBy?: string; // User ID who acknowledged
  employeeResponse?: string; // Optional employee response/follow-up
}

export interface BirthdayReminder {
  employeeId: string;
  employeeName: string;
  dateOfBirth: string;
  email: string;
}

