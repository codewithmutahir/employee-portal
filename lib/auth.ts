import { auth } from './firebase/config';
import { signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { db } from './firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { Employee } from '@/types';

export async function login(email: string, password: string): Promise<User> {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export async function getCurrentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

// Helper to convert Firestore timestamps to ISO strings
function toISOString(value: any): string | undefined {
  if (!value) return undefined;
  try {
    if (typeof value?.toDate === 'function') {
      return value.toDate().toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date.toISOString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function getEmployeeData(userId: string): Promise<Employee | null> {
  try {
    const employeeDoc = await getDoc(doc(db, 'employees', userId));
    
    if (employeeDoc.exists()) {
      const data = employeeDoc.data();
      // Handle missing timestamp fields gracefully
      const now = new Date().toISOString();
      const employee = { 
        id: employeeDoc.id, 
        // Spread all fields first
        ...data,
        // Then convert date fields
        dateOfBirth: toISOString(data.dateOfBirth),
        hireDate: toISOString(data.hireDate),
        createdAt: toISOString(data.createdAt) || now,
        updatedAt: toISOString(data.updatedAt) || now,
      } as Employee;
      
      return employee;
    }
    
    throw new Error('Employee document not found. Please contact support.');
  } catch (error: any) {
    if (error.code === 'permission-denied') {
      throw new Error('Permission denied. Please contact support.');
    }
    throw new Error('Failed to fetch employee data. Please try again.');
  }
}

export async function isManagement(userId: string): Promise<boolean> {
  const employee = await getEmployeeData(userId);
  return employee?.role === 'management';
}

