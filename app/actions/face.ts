'use server';

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const FACE_COLLECTION = 'employee_faces';

/**
 * Get stored face descriptor for an employee (128-dim array).
 * Returns null if not enrolled.
 */
export async function getEmployeeFaceDescriptor(
  employeeId: string
): Promise<number[] | null> {
  try {
    const doc = await adminDb.collection(FACE_COLLECTION).doc(employeeId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    const descriptor = data?.descriptor;
    if (!Array.isArray(descriptor) || descriptor.length !== 128) return null;
    return descriptor as number[];
  } catch (error: any) {
    console.error('Get face descriptor error:', error);
    return null;
  }
}

/**
 * Save face descriptor for an employee. Only the employee (or management) can enroll.
 */
export async function saveEmployeeFaceDescriptor(
  employeeId: string,
  descriptor: number[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return { success: false, error: 'Invalid descriptor (must be 128 numbers)' };
    }
    await adminDb.collection(FACE_COLLECTION).doc(employeeId).set({
      employeeId,
      descriptor,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { success: true };
  } catch (error: any) {
    console.error('Save face descriptor error:', error);
    return { success: false, error: error.message };
  }
}
