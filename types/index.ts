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

// ==================== ANNOUNCEMENTS ====================

export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';
export type AnnouncementTarget = 'all' | 'employees' | 'management' | 'department';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  target: AnnouncementTarget;
  targetDepartment?: string; // If target is 'department'
  createdBy: string; // User ID
  createdByName: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  expiresAt?: string; // ISO timestamp - auto-hide after this date
  isActive: boolean;
  isPinned: boolean;
  readBy: string[]; // Array of employee IDs who have read
}

export interface AnnouncementReadReceipt {
  announcementId: string;
  employeeId: string;
  readAt: string; // ISO timestamp
}

// ==================== EMERGENCY CONTACTS ====================

export interface EmergencyContact {
  id: string;
  employeeId: string;
  name: string;
  relationship: string; // e.g., "Spouse", "Parent", "Sibling", "Friend"
  phoneNumber: string;
  email?: string;
  address?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==================== EMPLOYEE PROFILE EXTENSIONS ====================

export interface EmployeeProfile extends Employee {
  profilePhotoUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  emergencyContacts?: EmergencyContact[];
  personalEmail?: string; // Non-work email
  preferredName?: string; // Nickname
  pronouns?: string;
  bio?: string;
  skills?: string[];
  languages?: string[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  notificationPreferences?: {
    emailNotifications: boolean;
    announcementEmails: boolean;
    reminderEmails: boolean;
  };
}

// ==================== ACTIVITY LOG ====================

export type ActivityType = 
  | 'login'
  | 'logout'
  | 'clock_in'
  | 'clock_out'
  | 'profile_update'
  | 'password_change'
  | 'announcement_read'
  | 'announcement_created'
  | 'emergency_contact_added'
  | 'emergency_contact_updated';

export interface ActivityLog {
  id: string;
  employeeId: string;
  activityType: ActivityType;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

