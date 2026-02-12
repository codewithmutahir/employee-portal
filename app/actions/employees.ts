'use server';

import { randomBytes } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { adminAuth } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Employee, Compensation } from '@/types';
import { sendWelcomeEmail } from '@/app/actions/email';

// Helper function to safely convert any date format to ISO string
function toISOString(value: any): string | undefined {
  if (!value) return undefined;
  
  try {
    // Case 1: Firestore Timestamp with toDate() method
    if (typeof value?.toDate === 'function') {
      return value.toDate().toISOString();
    }
    
    // Case 2: Firestore Timestamp-like object with _seconds (from serialization)
    if (value._seconds !== undefined) {
      return new Date(value._seconds * 1000).toISOString();
    }
    
    // Case 3: Object with seconds property (alternate Timestamp format)
    if (value.seconds !== undefined) {
      return new Date(value.seconds * 1000).toISOString();
    }
    
    // Case 4: Already a Date object
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return undefined;
      return value.toISOString();
    }
    
    // Case 5: ISO string or other date string
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) return undefined;
      return date.toISOString();
    }
    
    // Case 6: Unix timestamp (number)
    if (typeof value === 'number') {
      // If it looks like seconds (before year 2100), multiply by 1000
      const timestamp = value < 4102444800 ? value * 1000 : value;
      return new Date(timestamp).toISOString();
    }
    
    return undefined;
  } catch (error) {
    console.error('Date conversion error:', error, 'Value:', value);
    return undefined;
  }
}

export async function getEmployee(employeeId: string): Promise<Employee | null> {
  try {
    const doc = await adminDb.collection('employees').doc(employeeId).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    return {
      id: doc.id,
      email: data?.email || '',
      displayName: data?.displayName || '',
      role: data?.role || 'employee',
      status: data?.status || 'active',
      department: data?.department,
      position: data?.position,
      phoneNumber: data?.phoneNumber,
      dateOfBirth: toISOString(data?.dateOfBirth),
      hireDate: toISOString(data?.hireDate),
      createdAt: toISOString(data?.createdAt),
      updatedAt: toISOString(data?.updatedAt),
      // Extended profile fields
      address: data?.address,
      city: data?.city,
      state: data?.state,
      zipCode: data?.zipCode,
      country: data?.country,
      personalEmail: data?.personalEmail,
      preferredName: data?.preferredName,
      pronouns: data?.pronouns,
      bio: data?.bio,
      profilePhotoUrl: data?.profilePhotoUrl,
      notificationPreferences: data?.notificationPreferences,
    } as Employee;
  } catch (error: any) {
    console.error('Get employee error:', error);
    return null;
  }
}

// Get only regular employees (exclude management)
export async function getAllEmployees(excludeManagement: boolean = true) {
  try {
    let query = adminDb.collection('employees');
    
    // Filter by role if needed
    if (excludeManagement) {
      query = query.where('role', '==', 'employee') as any;
    }
    
    const snapshot = await query.get();
    const employees = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data?.email || '',
        displayName: data?.displayName || '',
        role: data?.role || 'employee',
        status: data?.status || 'active',
        department: data?.department,
        position: data?.position,
        phoneNumber: data?.phoneNumber,
        dateOfBirth: toISOString(data?.dateOfBirth),
        hireDate: toISOString(data?.hireDate),
        createdAt: toISOString(data?.createdAt),
        updatedAt: toISOString(data?.updatedAt),
      } as Employee;
    });
    return employees;
  } catch (error) {
    console.error('Error fetching employees:', error);
    throw error;
  }
}

// Get management users only
export async function getManagementUsers() {
  try {
    const snapshot = await adminDb.collection('employees')
      .where('role', '==', 'management')
      .get();
    
    const managers = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data?.email || '',
        displayName: data?.displayName || '',
        role: data?.role || 'management',
        status: data?.status || 'active',
        department: data?.department,
        position: data?.position,
        phoneNumber: data?.phoneNumber,
        dateOfBirth: toISOString(data?.dateOfBirth),
        hireDate: toISOString(data?.hireDate),
        createdAt: toISOString(data?.createdAt),
        updatedAt: toISOString(data?.updatedAt),
      } as Employee;
    });
    return managers;
  } catch (error) {
    console.error('Error fetching management users:', error);
    throw error;
  }
}

export async function createEmployee(
  data: {
    email: string;
    password: string;
    displayName: string;
    role: 'employee' | 'management';
    department?: string;
    position?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    hireDate: string;
  },
  createdBy: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Check if email already exists
    try {
      await adminAuth.getUserByEmail(data.email);
      return { success: false, error: 'A user with this email already exists' };
    } catch (error: any) {
      // If error code is 'auth/user-not-found', that's good - we can create the user
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    // Create Firebase Auth user
    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
      emailVerified: false,
    });

    // Create Firestore employee document with the same ID as Auth user
    await adminDb.collection('employees').doc(userRecord.uid).set({
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      status: 'active',
      department: data.department || null,
      position: data.position || null,
      phoneNumber: data.phoneNumber || null,
      dateOfBirth: data.dateOfBirth ? Timestamp.fromDate(new Date(data.dateOfBirth)) : null,
      hireDate: Timestamp.fromDate(new Date(data.hireDate)),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy,
    });

    return { success: true, userId: userRecord.uid };
  } catch (error: any) {
    console.error('Create employee error:', error);
    return { success: false, error: error.message || 'Failed to create employee' };
  }
}

/** Generate a random temporary password (12 chars, no ambiguous characters) */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[bytes[i]! % chars.length];
  return s;
}

/**
 * Resend login credentials to an employee: sets a new temporary password in Firebase Auth
 * and sends a welcome-style email with the new password.
 */
export async function resendCredentials(
  employeeId: string,
  _requestedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const emp = await getEmployee(employeeId);
    if (!emp) {
      return { success: false, error: 'Employee not found' };
    }
    if (!emp.email) {
      return { success: false, error: 'Employee has no email address' };
    }

    const temporaryPassword = generateTempPassword();

    await adminAuth.updateUser(employeeId, {
      password: temporaryPassword,
    });

    const emailResult = await sendWelcomeEmail(
      emp.email,
      emp.displayName || 'Employee',
      temporaryPassword
    );

    if (!emailResult.success) {
      return { success: false, error: emailResult.error || 'Failed to send credentials email' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Resend credentials error:', error);
    return { success: false, error: error.message || 'Failed to resend credentials' };
  }
}

export async function updateEmployee(
  employeeId: string,
  updates: Partial<Employee> & { 
    dateOfBirth?: string; 
    hireDate?: string;
  },
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Convert date strings to Firestore Timestamps if provided
    const processedUpdates: any = { ...updates };
    
    if (updates.dateOfBirth) {
      processedUpdates.dateOfBirth = Timestamp.fromDate(new Date(updates.dateOfBirth));
    }
    if (updates.hireDate) {
      processedUpdates.hireDate = Timestamp.fromDate(new Date(updates.hireDate));
    }
    
    await adminDb.collection('employees').doc(employeeId).update({
      ...processedUpdates,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    });

    // If email or displayName changed, update Firebase Auth too
    if (updates.email || updates.displayName) {
      const authUpdates: any = {};
      if (updates.email) authUpdates.email = updates.email;
      if (updates.displayName) authUpdates.displayName = updates.displayName;
      
      try {
        await adminAuth.updateUser(employeeId, authUpdates);
      } catch (authError: any) {
        console.warn('Failed to update Auth user:', authError.message);
        // Don't fail the whole operation if Auth update fails
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Update employee error:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteEmployee(
  employeeId: string,
  deletedBy: string,
  deleteAuthUser: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get employee info first for logging
    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (!employeeDoc.exists) {
      return { success: false, error: 'Employee not found' };
    }
    
    // Delete related data in parallel
    const deletePromises: Promise<any>[] = [];

    // Delete compensation record
    deletePromises.push(
      adminDb.collection('compensation').doc(employeeId).delete().catch(() => {})
    );

    // Delete face descriptor
    deletePromises.push(
      adminDb.collection('faceDescriptors').doc(employeeId).delete().catch(() => {})
    );

    // Delete attendance records (optional - you might want to keep these for records)
    // Uncomment if you want to delete attendance too:
    // const attendanceSnapshot = await adminDb.collection('attendance')
    //   .where('employeeId', '==', employeeId).get();
    // attendanceSnapshot.docs.forEach(doc => {
    //   deletePromises.push(doc.ref.delete());
    // });

    // Delete notes related to this employee
    const notesSnapshot = await adminDb.collection('notes')
      .where('employeeId', '==', employeeId).get();
    notesSnapshot.docs.forEach(doc => {
      deletePromises.push(doc.ref.delete());
    });

    // Wait for all related deletions
    await Promise.all(deletePromises);

    // Delete the employee document
    await adminDb.collection('employees').doc(employeeId).delete();

    // Delete Firebase Auth user if requested
    if (deleteAuthUser) {
      try {
        await adminAuth.deleteUser(employeeId);
      } catch (authError: any) {
        // Log but don't fail if Auth user deletion fails
        console.warn('Failed to delete Auth user:', authError.message);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Delete employee error:', error);
    return { success: false, error: error.message || 'Failed to delete employee' };
  }
}

export async function getCompensation(employeeId: string): Promise<Compensation | null> {
  try {
    const doc = await adminDb.collection('compensation').doc(employeeId).get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    return {
      employeeId: doc.id,
      ...data,
      updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt,
    } as Compensation;
  } catch (error: any) {
    console.error('Get compensation error:', error);
    return null;
  }
}

export async function updateCompensation(
  employeeId: string,
  compensation: Partial<Compensation>,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('compensation').doc(employeeId).set({
      ...compensation,
      employeeId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    }, { merge: true });
    return { success: true };
  } catch (error: any) {
    console.error('Update compensation error:', error);
    return { success: false, error: error.message };
  }
}

export async function checkEmployeeExists(employeeId: string): Promise<{ exists: boolean; employee?: Employee }> {
  try {
    const employee = await getEmployee(employeeId);
    return { exists: !!employee, employee: employee || undefined };
  } catch (error) {
    return { exists: false };
  }
}

// Get all unique departments from employees
export async function getAllDepartments(): Promise<string[]> {
  try {
    const employees = await getAllEmployees(true); // Only active employees
    const departments = [...new Set(employees.map(emp => emp.department).filter(Boolean))].filter((dept): dept is string => dept !== undefined);
    return departments.sort();
  } catch (error) {
    console.error('Error getting departments:', error);
    return [];
  }
}

// Get employees grouped by department
export async function getEmployeesByDepartment(): Promise<Record<string, Employee[]>> {
  try {
    const employees = await getAllEmployees(true);
    const grouped = employees.reduce((acc, emp) => {
      const dept = emp.department || 'No Department';
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(emp);
      return acc;
    }, {} as Record<string, Employee[]>);

    // Sort departments and employees within each department
    const sorted: Record<string, Employee[]> = {};
    Object.keys(grouped).sort().forEach(dept => {
      sorted[dept] = grouped[dept].sort((a, b) => a.displayName.localeCompare(b.displayName));
    });

    return sorted;
  } catch (error) {
    console.error('Error getting employees by department:', error);
    return {};
  }
}

export async function getUpcomingBirthdays(days: number = 30, roleFilter?: 'employee' | 'management'): Promise<Employee[]> {
  try {
    let query = adminDb.collection('employees')
      .where('status', '==', 'active');

    // Filter by role if specified
    if (roleFilter) {
      query = query.where('role', '==', roleFilter) as any;
    }

    const snapshot = await query.get();

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day

    const upcomingDate = new Date(today);
    upcomingDate.setDate(today.getDate() + days);


    const employees = snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data?.email || '',
          displayName: data?.displayName || '',
          role: data?.role || 'employee',
          status: data?.status || 'active',
          department: data?.department,
          position: data?.position,
          phoneNumber: data?.phoneNumber,
          dateOfBirth: toISOString(data?.dateOfBirth),
          hireDate: toISOString(data?.hireDate),
          createdAt: toISOString(data?.createdAt),
          updatedAt: toISOString(data?.updatedAt),
        } as Employee;
      })
      .filter(emp => {
        if (!emp.dateOfBirth) {
          return false;
        }

        try {
          const birthDate = new Date(emp.dateOfBirth);

          // Validate the date
          if (isNaN(birthDate.getTime())) {
            return false;
          }

          // Calculate this year's birthday
          const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());

          // If this year's birthday has passed, check next year's
          let targetBirthday = thisYearBirthday;
          if (thisYearBirthday < today) {
            targetBirthday = new Date(today.getFullYear() + 1, birthDate.getMonth(), birthDate.getDate());
          }

          // Check if the birthday falls within our range
          const isUpcoming = targetBirthday >= today && targetBirthday <= upcomingDate;

          return isUpcoming;
        } catch (error) {
          return false;
        }
      })
      .sort((a, b) => {
        // Sort by upcoming birthday date
        if (!a.dateOfBirth || !b.dateOfBirth) return 0;

        const aDate = new Date(a.dateOfBirth);
        const bDate = new Date(b.dateOfBirth);

        const aBirthday = new Date(today.getFullYear(), aDate.getMonth(), aDate.getDate());
        const bBirthday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());

        // If birthday has passed this year, use next year
        if (aBirthday < today) aBirthday.setFullYear(today.getFullYear() + 1);
        if (bBirthday < today) bBirthday.setFullYear(today.getFullYear() + 1);

        return aBirthday.getTime() - bBirthday.getTime();
      });

    return employees;
  } catch (error: any) {
    console.error('Get upcoming birthdays error:', error);
    return [];
  }
}

// ==================== WORK ANNIVERSARY FEATURE ====================

export interface WorkAnniversary {
  employee: Employee;
  hireDate: Date;
  anniversaryDate: Date;
  yearsCompleting: number;
  daysUntil: number;
  isMilestone: boolean;
  milestoneType: 'standard' | 'silver' | 'gold' | 'platinum' | 'diamond';
  tenureLabel: string;
}

export interface TenureInfo {
  years: number;
  months: number;
  days: number;
  totalDays: number;
  label: string;
  shortLabel: string;
}

// Milestone years for special recognition
const MILESTONE_YEARS = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

function getMilestoneType(years: number): 'standard' | 'silver' | 'gold' | 'platinum' | 'diamond' {
  if (years >= 25) return 'diamond';
  if (years >= 20) return 'platinum';
  if (years >= 10) return 'gold';
  if (years >= 5) return 'silver';
  return 'standard';
}

function getTenureLabel(years: number): string {
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

/**
 * Calculate tenure (time since hire date) - Internal helper function
 * For client-side use, import from '@/lib/utils' instead
 */
function calculateTenure(hireDate: string | Date | undefined): TenureInfo | null {
  if (!hireDate) return null;
  
  try {
    const hire = typeof hireDate === 'string' ? new Date(hireDate) : hireDate;
    if (isNaN(hire.getTime())) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    hire.setHours(0, 0, 0, 0);
    
    // Calculate total days
    const totalDays = Math.floor((today.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24));
    
    if (totalDays < 0) return null; // Future hire date
    
    // Calculate years, months, days
    let years = today.getFullYear() - hire.getFullYear();
    let months = today.getMonth() - hire.getMonth();
    let days = today.getDate() - hire.getDate();
    
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
 * Get upcoming work anniversaries within a specified number of days
 */
export async function getUpcomingAnniversaries(
  days: number = 30,
  roleFilter?: 'employee' | 'management'
): Promise<WorkAnniversary[]> {
  try {
    let query = adminDb.collection('employees')
      .where('status', '==', 'active');

    if (roleFilter) {
      query = query.where('role', '==', roleFilter) as any;
    }

    const snapshot = await query.get();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingDate = new Date(today);
    upcomingDate.setDate(today.getDate() + days);

    const anniversaries: WorkAnniversary[] = [];

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const hireDateStr = toISOString(data?.hireDate);
      
      if (!hireDateStr) {
        return;
      }

      try {
        const hireDate = new Date(hireDateStr);
        if (isNaN(hireDate.getTime())) return;

        // Calculate this year's anniversary
        const thisYearAnniversary = new Date(
          today.getFullYear(),
          hireDate.getMonth(),
          hireDate.getDate()
        );

        // Determine the upcoming anniversary
        let anniversaryDate = thisYearAnniversary;
        let yearsCompleting = today.getFullYear() - hireDate.getFullYear();

        if (thisYearAnniversary < today) {
          // This year's anniversary has passed, use next year
          anniversaryDate = new Date(
            today.getFullYear() + 1,
            hireDate.getMonth(),
            hireDate.getDate()
          );
          yearsCompleting = today.getFullYear() + 1 - hireDate.getFullYear();
        }

        // Check if within our date range
        if (anniversaryDate >= today && anniversaryDate <= upcomingDate) {
          const daysUntil = Math.ceil(
            (anniversaryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          const employee: Employee = {
            id: doc.id,
            email: data?.email || '',
            displayName: data?.displayName || '',
            role: data?.role || 'employee',
            status: data?.status || 'active',
            department: data?.department,
            position: data?.position,
            phoneNumber: data?.phoneNumber,
            dateOfBirth: toISOString(data?.dateOfBirth),
            hireDate: hireDateStr,
            createdAt: toISOString(data?.createdAt) || new Date().toISOString(),
            updatedAt: toISOString(data?.updatedAt) || new Date().toISOString(),
          };

          anniversaries.push({
            employee,
            hireDate,
            anniversaryDate,
            yearsCompleting,
            daysUntil,
            isMilestone: MILESTONE_YEARS.includes(yearsCompleting),
            milestoneType: getMilestoneType(yearsCompleting),
            tenureLabel: getTenureLabel(yearsCompleting),
          });
        }
      } catch (error) {
        // Skip invalid entries
      }
    });

    // Sort by days until anniversary (soonest first), then by milestone importance
    return anniversaries.sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) {
        return a.daysUntil - b.daysUntil;
      }
      // If same day, prioritize milestones
      if (a.isMilestone && !b.isMilestone) return -1;
      if (!a.isMilestone && b.isMilestone) return 1;
      return b.yearsCompleting - a.yearsCompleting;
    });
  } catch (error: any) {
    console.error('Get upcoming anniversaries error:', error);
    return [];
  }
}

/**
 * Get tenure statistics for the organization
 */
export async function getTenureStatistics(): Promise<{
  averageTenureYears: number;
  averageTenureMonths: number;
  tenureDistribution: { range: string; count: number; percentage: number }[];
  longestTenure: { employee: Employee; tenure: TenureInfo } | null;
  totalEmployees: number;
  milestonesThisYear: { milestone: number; count: number }[];
}> {
  try {
    const employees = await getAllEmployees(false);
    const activeEmployees = employees.filter(e => e.status === 'active');

    if (activeEmployees.length === 0) {
      return {
        averageTenureYears: 0,
        averageTenureMonths: 0,
        tenureDistribution: [],
        longestTenure: null,
        totalEmployees: 0,
        milestonesThisYear: [],
      };
    }

    // Calculate tenure for each employee
    const tenures: { employee: Employee; tenure: TenureInfo }[] = [];
    let totalMonths = 0;

    activeEmployees.forEach(emp => {
      const tenure = calculateTenure(emp.hireDate);
      if (tenure) {
        tenures.push({ employee: emp, tenure });
        totalMonths += tenure.years * 12 + tenure.months;
      }
    });

    // Calculate average
    const avgMonths = tenures.length > 0 ? totalMonths / tenures.length : 0;
    const averageTenureYears = Math.floor(avgMonths / 12);
    const averageTenureMonths = Math.round(avgMonths % 12);

    // Find longest tenure
    const longestTenure = tenures.reduce<{ employee: Employee; tenure: TenureInfo } | null>(
      (max, current) => {
        if (!max || current.tenure.totalDays > max.tenure.totalDays) {
          return current;
        }
        return max;
      },
      null
    );

    // Calculate tenure distribution
    const ranges = [
      { label: '< 1 year', min: 0, max: 1 },
      { label: '1-2 years', min: 1, max: 2 },
      { label: '2-5 years', min: 2, max: 5 },
      { label: '5-10 years', min: 5, max: 10 },
      { label: '10-20 years', min: 10, max: 20 },
      { label: '20+ years', min: 20, max: Infinity },
    ];

    const tenureDistribution = ranges.map(range => {
      const count = tenures.filter(
        t => t.tenure.years >= range.min && t.tenure.years < range.max
      ).length;
      return {
        range: range.label,
        count,
        percentage: tenures.length > 0 ? Math.round((count / tenures.length) * 100) : 0,
      };
    });

    // Calculate milestones happening this year
    const today = new Date();
    const currentYear = today.getFullYear();
    const milestoneCounts: Record<number, number> = {};

    tenures.forEach(({ employee, tenure }) => {
      const hireDate = new Date(employee.hireDate!);
      const yearsThisYear = currentYear - hireDate.getFullYear();
      
      if (MILESTONE_YEARS.includes(yearsThisYear)) {
        const anniversary = new Date(currentYear, hireDate.getMonth(), hireDate.getDate());
        // Only count if anniversary is this year and not yet passed (or recently passed)
        if (anniversary.getFullYear() === currentYear) {
          milestoneCounts[yearsThisYear] = (milestoneCounts[yearsThisYear] || 0) + 1;
        }
      }
    });

    const milestonesThisYear = Object.entries(milestoneCounts)
      .map(([milestone, count]) => ({
        milestone: parseInt(milestone),
        count,
      }))
      .sort((a, b) => a.milestone - b.milestone);

    return {
      averageTenureYears,
      averageTenureMonths,
      tenureDistribution,
      longestTenure,
      totalEmployees: tenures.length,
      milestonesThisYear,
    };
  } catch (error: any) {
    console.error('Get tenure statistics error:', error);
    return {
      averageTenureYears: 0,
      averageTenureMonths: 0,
      tenureDistribution: [],
      longestTenure: null,
      totalEmployees: 0,
      milestonesThisYear: [],
    };
  }
}