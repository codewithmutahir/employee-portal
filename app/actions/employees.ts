'use server';

import { adminDb } from '@/lib/firebase/admin';
import { adminAuth } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { Employee, Compensation } from '@/types';

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
      dateOfBirth: data?.dateOfBirth?.toDate?.()?.toISOString() || data?.dateOfBirth,
      hireDate: data?.hireDate?.toDate?.()?.toISOString() || data?.hireDate,
      createdAt: data?.createdAt?.toDate?.()?.toISOString() || data?.createdAt,
      updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt,
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
        dateOfBirth: data?.dateOfBirth?.toDate?.()?.toISOString() || data?.dateOfBirth,
        hireDate: data?.hireDate?.toDate?.()?.toISOString() || data?.hireDate,
        createdAt: data?.createdAt?.toDate?.()?.toISOString() || data?.createdAt,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt,
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
        dateOfBirth: data?.dateOfBirth?.toDate?.()?.toISOString() || data?.dateOfBirth,
        hireDate: data?.hireDate?.toDate?.()?.toISOString() || data?.hireDate,
        createdAt: data?.createdAt?.toDate?.()?.toISOString() || data?.createdAt,
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt,
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

export async function updateEmployee(
  employeeId: string,
  updates: Partial<Employee>,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('employees').doc(employeeId).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    });
    return { success: true };
  } catch (error: any) {
    console.error('Update employee error:', error);
    return { success: false, error: error.message };
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
          dateOfBirth: data?.dateOfBirth?.toDate?.()?.toISOString() || data?.dateOfBirth,
          hireDate: data?.hireDate?.toDate?.()?.toISOString() || data?.hireDate,
          createdAt: data?.createdAt?.toDate?.()?.toISOString() || data?.createdAt,
          updatedAt: data?.updatedAt?.toDate?.()?.toISOString() || data?.updatedAt,
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