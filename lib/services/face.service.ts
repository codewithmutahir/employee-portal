/**
 * Face service – get/save face descriptor for an employee.
 * Single source of truth for face enrollment/verification data.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const FACE_COLLECTION = 'employee_faces';

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
  } catch (error: unknown) {
    console.error('Get face descriptor error:', error);
    return null;
  }
}

export async function saveEmployeeFaceDescriptor(
  employeeId: string,
  descriptor: number[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return { success: false, error: 'Invalid descriptor (must be 128 numbers)' };
    }
    await adminDb
      .collection(FACE_COLLECTION)
      .doc(employeeId)
      .set(
        {
          employeeId,
          descriptor,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Save face descriptor error:', err);
    return { success: false, error: err.message };
  }
}
