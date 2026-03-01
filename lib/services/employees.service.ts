/**
 * Employees service – CRUD, compensation, departments, birthdays, anniversaries, tenure.
 * Single source of truth for employee/management business logic.
 */

import { randomBytes } from 'crypto';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Employee, Compensation, WorkAnniversary, TenureInfo } from '@/types';
import { sendWelcomeEmail } from './email.service';

function toISOString(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if ((value as { _seconds?: number })._seconds !== undefined) {
      return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
    }
    if ((value as { seconds?: number }).seconds !== undefined) {
      return new Date((value as { seconds: number }).seconds * 1000).toISOString();
    }
    if (value instanceof Date) {
      return isNaN(value.getTime()) ? undefined : value.toISOString();
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      return isNaN(date.getTime()) ? undefined : date.toISOString();
    }
    if (typeof value === 'number') {
      const timestamp = value < 4102444800 ? value * 1000 : value;
      return new Date(timestamp).toISOString();
    }
    return undefined;
  } catch (err) {
    console.error('Date conversion error:', err, 'Value:', value);
    return undefined;
  }
}

export async function getEmployee(employeeId: string): Promise<Employee | null> {
  try {
    const doc = await adminDb.collection('employees').doc(employeeId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return {
      id: doc.id,
      email: (data?.email as string) || '',
      displayName: (data?.displayName as string) || '',
      role: (data?.role as Employee['role']) || 'employee',
      status: (data?.status as Employee['status']) || 'active',
      department: data?.department,
      position: data?.position,
      phoneNumber: data?.phoneNumber,
      dateOfBirth: toISOString(data?.dateOfBirth),
      hireDate: toISOString(data?.hireDate),
      createdAt: toISOString(data?.createdAt),
      updatedAt: toISOString(data?.updatedAt),
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
  } catch (error: unknown) {
    console.error('Get employee error:', error);
    return null;
  }
}

export async function getAllEmployees(
  excludeManagement: boolean = true
): Promise<Employee[]> {
  try {
    const query = excludeManagement
      ? adminDb.collection('employees').where('role', '==', 'employee')
      : adminDb.collection('employees');
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: (data?.email as string) || '',
        displayName: (data?.displayName as string) || '',
        role: (data?.role as Employee['role']) || 'employee',
        status: (data?.status as Employee['status']) || 'active',
        department: data?.department,
        position: data?.position,
        phoneNumber: data?.phoneNumber,
        dateOfBirth: toISOString(data?.dateOfBirth),
        hireDate: toISOString(data?.hireDate),
        createdAt: toISOString(data?.createdAt),
        updatedAt: toISOString(data?.updatedAt),
      } as Employee;
    });
  } catch (error: unknown) {
    console.error('Error fetching employees:', error);
    throw error;
  }
}

export async function getManagementUsers(): Promise<Employee[]> {
  try {
    const snapshot = await adminDb
      .collection('employees')
      .where('role', '==', 'management')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: (data?.email as string) || '',
        displayName: (data?.displayName as string) || '',
        role: 'management' as const,
        status: (data?.status as Employee['status']) || 'active',
        department: data?.department,
        position: data?.position,
        phoneNumber: data?.phoneNumber,
        dateOfBirth: toISOString(data?.dateOfBirth),
        hireDate: toISOString(data?.hireDate),
        createdAt: toISOString(data?.createdAt),
        updatedAt: toISOString(data?.updatedAt),
      } as Employee;
    });
  } catch (error: unknown) {
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
    try {
      await adminAuth.getUserByEmail(data.email);
      return { success: false, error: 'A user with this email already exists' };
    } catch (error: unknown) {
      const err = error as { code?: string };
      if (err.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
      emailVerified: false,
    });

    await adminDb.collection('employees').doc(userRecord.uid).set({
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      status: 'active',
      department: data.department || null,
      position: data.position || null,
      phoneNumber: data.phoneNumber || null,
      dateOfBirth: data.dateOfBirth
        ? Timestamp.fromDate(new Date(data.dateOfBirth))
        : null,
      hireDate: Timestamp.fromDate(new Date(data.hireDate)),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy,
    });

    return { success: true, userId: userRecord.uid };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Create employee error:', err);
    return {
      success: false,
      error: err.message || 'Failed to create employee',
    };
  }
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[bytes[i]! % chars.length];
  return s;
}

export async function resendCredentials(
  employeeId: string,
  _requestedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const emp = await getEmployee(employeeId);
    if (!emp) return { success: false, error: 'Employee not found' };
    if (!emp.email) return { success: false, error: 'Employee has no email address' };

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
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Resend credentials error:', err);
    return { success: false, error: err.message };
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
    const processedUpdates: Record<string, unknown> = { ...updates };

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

    if (updates.email || updates.displayName) {
      const authUpdates: { email?: string; displayName?: string } = {};
      if (updates.email) authUpdates.email = updates.email;
      if (updates.displayName) authUpdates.displayName = updates.displayName;
      try {
        await adminAuth.updateUser(employeeId, authUpdates);
      } catch (authError: unknown) {
        console.warn('Failed to update Auth user:', (authError as Error).message);
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update employee error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteEmployee(
  employeeId: string,
  _deletedBy: string,
  deleteAuthUser: boolean = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (!employeeDoc.exists) {
      return { success: false, error: 'Employee not found' };
    }

    const deletePromises: Promise<unknown>[] = [];

    deletePromises.push(
      adminDb.collection('compensation').doc(employeeId).delete().catch(() => {})
    );

    deletePromises.push(
      adminDb.collection('faceDescriptors').doc(employeeId).delete().catch(() => {})
    );

    const notesSnapshot = await adminDb
      .collection('notes')
      .where('employeeId', '==', employeeId)
      .get();
    notesSnapshot.docs.forEach((doc) => {
      deletePromises.push(doc.ref.delete());
    });

    await Promise.all(deletePromises);

    await adminDb.collection('employees').doc(employeeId).delete();

    if (deleteAuthUser) {
      try {
        await adminAuth.deleteUser(employeeId);
      } catch (authError: unknown) {
        console.warn('Failed to delete Auth user:', (authError as Error).message);
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Delete employee error:', err);
    return { success: false, error: err.message };
  }
}

export async function getCompensation(
  employeeId: string
): Promise<Compensation | null> {
  try {
    const doc = await adminDb.collection('compensation').doc(employeeId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    return {
      employeeId: doc.id,
      ...data,
      updatedAt:
        (data?.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
        (data?.updatedAt as string),
    } as Compensation;
  } catch (error: unknown) {
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
    await adminDb
      .collection('compensation')
      .doc(employeeId)
      .set(
        {
          ...compensation,
          employeeId,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy,
        },
        { merge: true }
      );
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update compensation error:', err);
    return { success: false, error: err.message };
  }
}

export async function checkEmployeeExists(employeeId: string): Promise<{
  exists: boolean;
  employee?: Employee;
}> {
  try {
    const employee = await getEmployee(employeeId);
    return { exists: !!employee, employee: employee || undefined };
  } catch {
    return { exists: false };
  }
}

export async function getAllDepartments(): Promise<string[]> {
  try {
    const employees = await getAllEmployees(true);
    const departments = [
      ...new Set(employees.map((emp) => emp.department).filter(Boolean)),
    ].filter((dept): dept is string => dept !== undefined);
    return departments.sort();
  } catch (error: unknown) {
    console.error('Error getting departments:', error);
    return [];
  }
}

export async function getEmployeesByDepartment(): Promise<
  Record<string, Employee[]>
> {
  try {
    const employees = await getAllEmployees(true);
    const grouped = employees.reduce(
      (acc, emp) => {
        const dept = emp.department || 'No Department';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(emp);
        return acc;
      },
      {} as Record<string, Employee[]>
    );

    const sorted: Record<string, Employee[]> = {};
    Object.keys(grouped)
      .sort()
      .forEach((dept) => {
        sorted[dept] = grouped[dept].sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        );
      });

    return sorted;
  } catch (error: unknown) {
    console.error('Error getting employees by department:', error);
    return {};
  }
}

export async function getUpcomingBirthdays(
  days: number = 30,
  roleFilter?: 'employee' | 'management'
): Promise<Employee[]> {
  try {
    const baseQuery = adminDb
      .collection('employees')
      .where('status', '==', 'active');
    const snapshot = roleFilter
      ? await baseQuery.where('role', '==', roleFilter).get()
      : await baseQuery.get();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingDate = new Date(today);
    upcomingDate.setDate(today.getDate() + days);

    const employees = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          email: (data?.email as string) || '',
          displayName: (data?.displayName as string) || '',
          role: (data?.role as Employee['role']) || 'employee',
          status: (data?.status as Employee['status']) || 'active',
          department: data?.department,
          position: data?.position,
          phoneNumber: data?.phoneNumber,
          dateOfBirth: toISOString(data?.dateOfBirth),
          hireDate: toISOString(data?.hireDate),
          createdAt: toISOString(data?.createdAt),
          updatedAt: toISOString(data?.updatedAt),
        } as Employee;
      })
      .filter((emp) => {
        if (!emp.dateOfBirth) return false;
        try {
          const birthDate = new Date(emp.dateOfBirth);
          if (isNaN(birthDate.getTime())) return false;
          const thisYearBirthday = new Date(
            today.getFullYear(),
            birthDate.getMonth(),
            birthDate.getDate()
          );
          let targetBirthday = thisYearBirthday;
          if (thisYearBirthday < today) {
            targetBirthday = new Date(
              today.getFullYear() + 1,
              birthDate.getMonth(),
              birthDate.getDate()
            );
          }
          return targetBirthday >= today && targetBirthday <= upcomingDate;
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        if (!a.dateOfBirth || !b.dateOfBirth) return 0;
        const aDate = new Date(a.dateOfBirth);
        const bDate = new Date(b.dateOfBirth);
        const aBirthday = new Date(
          today.getFullYear(),
          aDate.getMonth(),
          aDate.getDate()
        );
        const bBirthday = new Date(
          today.getFullYear(),
          bDate.getMonth(),
          bDate.getDate()
        );
        if (aBirthday < today) aBirthday.setFullYear(today.getFullYear() + 1);
        if (bBirthday < today) bBirthday.setFullYear(today.getFullYear() + 1);
        return aBirthday.getTime() - bBirthday.getTime();
      });

    return employees;
  } catch (error: unknown) {
    console.error('Get upcoming birthdays error:', error);
    return [];
  }
}

const MILESTONE_YEARS = [1, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

function getMilestoneType(
  years: number
): 'standard' | 'silver' | 'gold' | 'platinum' | 'diamond' {
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

function calculateTenure(
  hireDate: string | Date | undefined
): TenureInfo | null {
  if (!hireDate) return null;
  try {
    const hire =
      typeof hireDate === 'string' ? new Date(hireDate) : hireDate;
    if (isNaN(hire.getTime())) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    hire.setHours(0, 0, 0, 0);

    const totalDays = Math.floor(
      (today.getTime() - hire.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (totalDays < 0) return null;

    let years = today.getFullYear() - hire.getFullYear();
    let months = today.getMonth() - hire.getMonth();
    let days = today.getDate() - hire.getDate();

    if (days < 0) {
      months--;
      const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      days += lastMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

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
  } catch (error: unknown) {
    console.error('Calculate tenure error:', error);
    return null;
  }
}

export async function getUpcomingAnniversaries(
  days: number = 30,
  roleFilter?: 'employee' | 'management'
): Promise<WorkAnniversary[]> {
  try {
    const baseQuery = adminDb
      .collection('employees')
      .where('status', '==', 'active');
    const snapshot = roleFilter
      ? await baseQuery.where('role', '==', roleFilter).get()
      : await baseQuery.get();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingDate = new Date(today);
    upcomingDate.setDate(today.getDate() + days);

    const anniversaries: WorkAnniversary[] = [];

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const hireDateStr = toISOString(data?.hireDate);
      if (!hireDateStr) return;

      try {
        const hireDate = new Date(hireDateStr);
        if (isNaN(hireDate.getTime())) return;

        const thisYearAnniversary = new Date(
          today.getFullYear(),
          hireDate.getMonth(),
          hireDate.getDate()
        );

        let anniversaryDate = thisYearAnniversary;
        let yearsCompleting = today.getFullYear() - hireDate.getFullYear();

        if (thisYearAnniversary < today) {
          anniversaryDate = new Date(
            today.getFullYear() + 1,
            hireDate.getMonth(),
            hireDate.getDate()
          );
          yearsCompleting =
            today.getFullYear() + 1 - hireDate.getFullYear();
        }

        if (anniversaryDate >= today && anniversaryDate <= upcomingDate) {
          const daysUntil = Math.ceil(
            (anniversaryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );

          const employee: Employee = {
            id: doc.id,
            email: (data?.email as string) || '',
            displayName: (data?.displayName as string) || '',
            role: (data?.role as Employee['role']) || 'employee',
            status: (data?.status as Employee['status']) || 'active',
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
      } catch {
        // skip invalid
      }
    });

    return anniversaries.sort((a, b) => {
      if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
      if (a.isMilestone && !b.isMilestone) return -1;
      if (!a.isMilestone && b.isMilestone) return 1;
      return b.yearsCompleting - a.yearsCompleting;
    });
  } catch (error: unknown) {
    console.error('Get upcoming anniversaries error:', error);
    return [];
  }
}

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
    const activeEmployees = employees.filter((e) => e.status === 'active');

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

    const tenures: { employee: Employee; tenure: TenureInfo }[] = [];
    let totalMonths = 0;

    activeEmployees.forEach((emp) => {
      const tenure = calculateTenure(emp.hireDate);
      if (tenure) {
        tenures.push({ employee: emp, tenure });
        totalMonths += tenure.years * 12 + tenure.months;
      }
    });

    const avgMonths = tenures.length > 0 ? totalMonths / tenures.length : 0;
    const averageTenureYears = Math.floor(avgMonths / 12);
    const averageTenureMonths = Math.round(avgMonths % 12);

    const longestTenure = tenures.reduce<{
      employee: Employee;
      tenure: TenureInfo;
    } | null>((max, current) => {
      if (!max || current.tenure.totalDays > max.tenure.totalDays) return current;
      return max;
    }, null);

    const ranges = [
      { label: '< 1 year', min: 0, max: 1 },
      { label: '1-2 years', min: 1, max: 2 },
      { label: '2-5 years', min: 2, max: 5 },
      { label: '5-10 years', min: 5, max: 10 },
      { label: '10-20 years', min: 10, max: 20 },
      { label: '20+ years', min: 20, max: Infinity },
    ];

    const tenureDistribution = ranges.map((range) => {
      const count = tenures.filter(
        (t) => t.tenure.years >= range.min && t.tenure.years < range.max
      ).length;
      return {
        range: range.label,
        count,
        percentage:
          tenures.length > 0 ? Math.round((count / tenures.length) * 100) : 0,
      };
    });

    const today = new Date();
    const currentYear = today.getFullYear();
    const milestoneCounts: Record<number, number> = {};

    tenures.forEach(({ employee, tenure }) => {
      const hireDate = new Date(employee.hireDate!);
      const yearsThisYear = currentYear - hireDate.getFullYear();

      if (MILESTONE_YEARS.includes(yearsThisYear)) {
        const anniversary = new Date(
          currentYear,
          hireDate.getMonth(),
          hireDate.getDate()
        );
        if (anniversary.getFullYear() === currentYear) {
          milestoneCounts[yearsThisYear] =
            (milestoneCounts[yearsThisYear] || 0) + 1;
        }
      }
    });

    const milestonesThisYear = Object.entries(milestoneCounts)
      .map(([milestone, count]) => ({
        milestone: parseInt(milestone, 10),
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
  } catch (error: unknown) {
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
