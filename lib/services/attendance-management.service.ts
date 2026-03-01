/**
 * Attendance management service – management edits to attendance records.
 * Single source of truth for update/get by date logic.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AttendanceRecord, BreakRecord } from '@/types';
import { calculateHours } from '@/lib/utils';
import { normalizeDateString } from './date-helpers';

export async function updateAttendance(
  employeeId: string,
  date: string,
  updates: {
    clockIn?: string;
    clockOut?: string;
    breaks?: BreakRecord[];
    payrollId?: string;
    noShowReason?: string;
    employeeNote?: string;
    managerNote?: string;
  },
  editedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const dateNorm = normalizeDateString(date);
    const attendanceRef = adminDb.collection('attendance').doc(`${employeeId}_${dateNorm}`);
    const attendanceDoc = await attendanceRef.get();

    const updateData: Record<string, unknown> = {
      employeeId,
      date: dateNorm,
      isEditedByManagement: true,
      editedBy,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (updates.clockIn !== undefined) {
      if (updates.clockIn === '' || updates.clockIn === null) {
        updateData.clockIn = FieldValue.delete();
      } else {
        updateData.clockIn = Timestamp.fromDate(new Date(updates.clockIn));
      }
    }
    if (updates.clockOut !== undefined) {
      if (updates.clockOut === '' || updates.clockOut === null) {
        updateData.clockOut = FieldValue.delete();
      } else {
        updateData.clockOut = Timestamp.fromDate(new Date(updates.clockOut));
      }
    }

    if (updates.breaks) {
      updateData.breaks = updates.breaks;
    }

    if (updates.payrollId !== undefined) {
      updateData.payrollId = updates.payrollId || null;
    }

    if (updates.noShowReason !== undefined) {
      updateData.noShowReason = updates.noShowReason || null;
    }

    if (updates.employeeNote !== undefined) {
      updateData.employeeNote = updates.employeeNote || null;
    }

    if (updates.managerNote !== undefined) {
      updateData.managerNote = updates.managerNote || null;
    }

    const existing = attendanceDoc.exists ? attendanceDoc.data() : null;
    const clockInStr =
      updates.clockIn && updates.clockIn !== ''
        ? updates.clockIn
        : updates.clockIn === undefined && existing?.clockIn
          ? (existing.clockIn as { toDate: () => Date }).toDate().toISOString()
          : null;
    const clockOutStr =
      updates.clockOut && updates.clockOut !== ''
        ? updates.clockOut
        : updates.clockOut === undefined && existing?.clockOut
          ? (existing.clockOut as { toDate: () => Date }).toDate().toISOString()
          : null;

    if (clockInStr && clockOutStr) {
      const breaks = updates.breaks ?? (existing?.breaks ?? []) as BreakRecord[];
      updateData.totalHours = calculateHours(clockInStr, clockOutStr, breaks);
    } else {
      updateData.totalHours = FieldValue.delete();
    }

    await attendanceRef.set(updateData, { merge: true });

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update attendance error:', err);
    return { success: false, error: err.message };
  }
}

export async function getAttendanceByDate(
  employeeId: string,
  date: string
): Promise<AttendanceRecord | null> {
  try {
    const dateNorm = normalizeDateString(date);
    const docId = `${employeeId}_${dateNorm}`;
    const doc = await adminDb.collection('attendance').doc(docId).get();
    if (!doc.exists) {
      return null;
    }

    const data = doc.data();
    return {
      id: doc.id,
      employeeId: data?.employeeId,
      date: dateNorm,
      clockIn: (data?.clockIn as { toDate?: () => Date })?.toDate?.()?.toISOString(),
      clockOut: (data?.clockOut as { toDate?: () => Date })?.toDate?.()?.toISOString(),
      breaks: (data?.breaks || []).map((b: BreakRecord & { type?: string; isPaid?: boolean }) => ({
        startTime: b.startTime,
        endTime: b.endTime,
        duration: b.duration,
        type: b.type,
        isPaid: b.isPaid,
      })),
      totalHours: data?.totalHours,
      payrollId: data?.payrollId,
      noShowReason: data?.noShowReason,
      employeeNote: data?.employeeNote,
      managerNote: data?.managerNote,
      editedBy: data?.editedBy,
      editedAt: (data?.editedAt as { toDate?: () => Date })?.toDate?.()?.toISOString(),
      isEditedByManagement: data?.isEditedByManagement || false,
      createdAt: (data?.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString(),
      updatedAt: (data?.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString(),
    } as AttendanceRecord;
  } catch (error: unknown) {
    console.error('Get attendance by date error:', error);
    return null;
  }
}
