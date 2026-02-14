'use server';

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AttendanceRecord, BreakRecord } from '@/types';
import { calculateHours } from '@/lib/utils';

/** Normalize to YYYY-MM-DD. Pass-through if already YYYY-MM-DD to avoid timezone shifting (e.g. "2026-02-14" parsed as UTC midnight can become Feb 13 in local time). */
function normalizeDateString(date: string): string {
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

    const updateData: any = {
      employeeId,
      date: dateNorm,
      isEditedByManagement: true,
      editedBy,
      editedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // Support clearing clock in/out: empty string or null removes the field
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

    // Recalculate total hours only when both clock in and out are present (use existing when not updating)
    const existing = attendanceDoc.exists ? attendanceDoc.data() : null;
    const clockInStr = updates.clockIn && updates.clockIn !== '' ? updates.clockIn : (updates.clockIn === undefined && existing?.clockIn ? existing.clockIn.toDate().toISOString() : null);
    const clockOutStr = updates.clockOut && updates.clockOut !== '' ? updates.clockOut : (updates.clockOut === undefined && existing?.clockOut ? existing.clockOut.toDate().toISOString() : null);

    if (clockInStr && clockOutStr) {
      const breaks = updates.breaks ?? existing?.breaks ?? [];
      updateData.totalHours = calculateHours(clockInStr, clockOutStr, breaks);
    } else {
      updateData.totalHours = FieldValue.delete();
    }

    await attendanceRef.set(updateData, { merge: true });

    return { success: true };
  } catch (error: any) {
    console.error('Update attendance error:', error);
    return { success: false, error: error.message };
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
      clockIn: data?.clockIn?.toDate().toISOString(),
      clockOut: data?.clockOut?.toDate().toISOString(),
      breaks: (data?.breaks || []).map((b: any) => ({
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
      editedAt: data?.editedAt?.toDate().toISOString(),
      isEditedByManagement: data?.isEditedByManagement || false,
      createdAt: data?.createdAt?.toDate().toISOString(),
      updatedAt: data?.updatedAt?.toDate().toISOString(),
    } as AttendanceRecord;
  } catch (error: any) {
    console.error('Get attendance by date error:', error);
    return null;
  }
}

