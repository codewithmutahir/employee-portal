/**
 * Employees service – CRUD, compensation, departments, birthdays, anniversaries, tenure.
 * Single source of truth for employee/management business logic.
 */

import { randomBytes } from 'crypto';
import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  Employee,
  Compensation,
  CompensationEventStatus,
  CompensationEventType,
  CompensationHistoryEvent,
  EmployeeDateRangeSchedule,
  EmployeeScheduleDays,
  EmployeeScheduleStatus,
  ScheduleRepeatType,
  ScheduleWeekdayKey,
  WorkAnniversary,
  TenureInfo,
} from '@/types';
import { resolveUserRole } from '@/lib/roles';
import { wrapFirebaseError } from '@/lib/firebase/errors';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { sendWelcomeEmail } from './email.service';
import { sendPushToEmployee } from './push.service';
import {
  ScheduleHistoryEntry,
  schedulesEqual,
} from '@/lib/schedule-history';
import {
  activeDaysCount,
  computeScheduleStatus,
  dominantScheduleForDate,
  emptyScheduleDays,
  formatWeekdayLabel,
  overlappingDays,
  scheduleRangesOverlap,
} from '@/lib/employee-schedules';

/** Hire date before local calendar today: only admins may set (blocks managers if update path is opened to them). */
async function assertCanSetPastHireDate(
  actorId: string,
  hireDateStr: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const hire = new Date(hireDateStr);
  if (isNaN(hire.getTime())) {
    return { ok: false, error: 'Invalid hire date' };
  }
  const hireDay = new Date(hire.getFullYear(), hire.getMonth(), hire.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (hireDay.getTime() >= today.getTime()) return { ok: true };

  const actor = await getEmployee(actorId);
  if (!actor) return { ok: false, error: 'Unauthorized' };
  if (actor.role !== 'admin') {
    return {
      ok: false,
      error: 'Only an administrator can set a hire date in the past.',
    };
  }
  return { ok: true };
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toYmd(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      const d = (value as { toDate: () => Date }).toDate();
      if (isNaN(d.getTime())) return undefined;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return undefined;
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const d = new Date(trimmed);
      if (isNaN(d.getTime())) return undefined;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Persist the previous schedule snapshot when an admin/manager changes the
 * employee's live schedule. Old entry is closed (effectiveTo = today) and a
 * new active entry is opened (effectiveFrom = today). When no history exists
 * yet we backfill an entry that covers all dates from the hire date up to
 * today so past attendance keeps using the schedule that was actually live
 * at the time.
 */
async function archiveScheduleChange(
  employeeId: string,
  previousEmployeeData: FirebaseFirestore.DocumentData,
  newSchedule: { scheduleStart: string | null; scheduleEnd: string | null; dayOff: string | null },
  updatedBy: string
): Promise<void> {
  const previous = {
    scheduleStart: (previousEmployeeData?.scheduleStart as string | null) ?? null,
    scheduleEnd: (previousEmployeeData?.scheduleEnd as string | null) ?? null,
    dayOff: (previousEmployeeData?.dayOff as string | null) ?? null,
  };

  if (schedulesEqual(previous, newSchedule)) return;

  const today = todayYmd();
  const historyRef = adminDb
    .collection('employees')
    .doc(employeeId)
    .collection('scheduleHistory');

  const openSnapshot = await historyRef.where('effectiveTo', '==', null).get();
  const batch = adminDb.batch();

  if (openSnapshot.empty) {
    const hireYmd = toYmd(previousEmployeeData?.hireDate);
    const createdYmd = toYmd(previousEmployeeData?.createdAt);
    const fallbackFrom = hireYmd || createdYmd || today;
    const effectiveFrom = fallbackFrom <= today ? fallbackFrom : today;
    batch.set(historyRef.doc(), {
      scheduleStart: previous.scheduleStart,
      scheduleEnd: previous.scheduleEnd,
      dayOff: previous.dayOff,
      effectiveFrom,
      effectiveTo: today,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: updatedBy,
      backfilled: true,
    });
  } else {
    openSnapshot.forEach((doc) => {
      batch.update(doc.ref, { effectiveTo: today });
    });
  }

  batch.set(historyRef.doc(), {
    scheduleStart: newSchedule.scheduleStart,
    scheduleEnd: newSchedule.scheduleEnd,
    dayOff: newSchedule.dayOff,
    effectiveFrom: today,
    effectiveTo: null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: updatedBy,
  });

  await batch.commit();
}

export async function getScheduleHistory(employeeId: string): Promise<ScheduleHistoryEntry[]> {
  try {
    const snap = await adminDb
      .collection('employees')
      .doc(employeeId)
      .collection('scheduleHistory')
      .orderBy('effectiveFrom', 'asc')
      .get();
    return snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        scheduleStart: (data.scheduleStart as string | null) ?? null,
        scheduleEnd: (data.scheduleEnd as string | null) ?? null,
        dayOff: (data.dayOff as string | null) ?? null,
        effectiveFrom: (data.effectiveFrom as string) || '',
        effectiveTo: (data.effectiveTo as string | null) ?? null,
        createdAt: toISOString(data.createdAt),
        createdBy: (data.createdBy as string) || undefined,
      } satisfies ScheduleHistoryEntry;
    });
  } catch (error: unknown) {
    console.error('Get schedule history error:', error);
    return [];
  }
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
      const d = (value as { toDate: () => Date }).toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function parseScheduleDays(value: unknown): EmployeeScheduleDays {
  const fallback = emptyScheduleDays();
  const raw = (value || {}) as Record<string, any>;
  (Object.keys(fallback) as ScheduleWeekdayKey[]).forEach((k) => {
    const source = raw[k];
    if (!source || typeof source !== 'object') return;
    fallback[k] = {
      active: Boolean(source.active),
      shiftStart: typeof source.shiftStart === 'string' && source.shiftStart ? source.shiftStart : '09:00',
      shiftEnd: typeof source.shiftEnd === 'string' && source.shiftEnd ? source.shiftEnd : '18:00',
    };
  });
  return fallback;
}

function dayOffFromSchedule(days: EmployeeScheduleDays): string | null {
  const off = (Object.keys(days) as ScheduleWeekdayKey[]).find((k) => !days[k].active);
  if (!off) return null;
  return formatWeekdayLabel(off);
}

function firstActiveShift(days: EmployeeScheduleDays): { start: string | null; end: string | null } {
  const keys: ScheduleWeekdayKey[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const k of keys) {
    if (days[k].active) {
      return { start: days[k].shiftStart, end: days[k].shiftEnd };
    }
  }
  return { start: null, end: null };
}

function mapScheduleDoc(
  employeeId: string,
  doc: FirebaseFirestore.QueryDocumentSnapshot
): EmployeeDateRangeSchedule {
  const data = doc.data() || {};
  const start = toDateOrNull(data.startDate) || new Date();
  const end = toDateOrNull(data.endDate);
  const statusStored = (data.status as EmployeeScheduleStatus | undefined) || computeScheduleStatus(start, end);
  return {
    scheduleId: (data.scheduleId as string) || doc.id,
    employeeId,
    startDate: start.toISOString(),
    endDate: end ? end.toISOString() : null,
    days: parseScheduleDays(data.days),
    repeatType: ((data.repeatType as ScheduleRepeatType) || 'weekly'),
    notes: (data.notes as string) || '',
    createdBy: (data.createdBy as string) || '',
    createdAt: toISOString(data.createdAt) || new Date().toISOString(),
    status: statusStored,
  };
}

async function syncLegacyScheduleFromDateRange(
  employeeId: string,
  actorId: string
): Promise<void> {
  const employeeRef = adminDb.collection('employees').doc(employeeId);
  const [employeeSnap, schedules] = await Promise.all([
    employeeRef.get(),
    getEmployeeDateRangeSchedules(employeeId),
  ]);
  if (!employeeSnap.exists) return;
  const employeeData = employeeSnap.data() || {};

  const dominant = dominantScheduleForDate(schedules, new Date());
  const previous = {
    scheduleStart: (employeeData.scheduleStart as string | null) ?? null,
    scheduleEnd: (employeeData.scheduleEnd as string | null) ?? null,
    dayOff: (employeeData.dayOff as string | null) ?? null,
  };

  const derivedShift = dominant ? firstActiveShift(dominant.days) : { start: null, end: null };
  const derived = {
    scheduleStart: derivedShift.start,
    scheduleEnd: derivedShift.end,
    dayOff: dominant ? dayOffFromSchedule(dominant.days) : null,
  };

  if (schedulesEqual(previous, derived)) return;

  await employeeRef.set(
    {
      scheduleStart: derived.scheduleStart,
      scheduleEnd: derived.scheduleEnd,
      dayOff: derived.dayOff,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorId,
    },
    { merge: true }
  );
  await archiveScheduleChange(employeeId, employeeData, derived, actorId);
}

export async function getEmployeeDateRangeSchedules(
  employeeId: string
): Promise<EmployeeDateRangeSchedule[]> {
  try {
    const schedulesRef = adminDb.collection('employees').doc(employeeId).collection('schedules');
    const snap = await schedulesRef.orderBy('startDate', 'desc').get();
    const list = snap.docs.map((doc) => mapScheduleDoc(employeeId, doc));

    const batch = adminDb.batch();
    let changed = 0;
    for (const doc of snap.docs) {
      const data = doc.data() || {};
      const start = toDateOrNull(data.startDate) || new Date();
      const end = toDateOrNull(data.endDate);
      const expected = computeScheduleStatus(start, end);
      const stored = (data.status as EmployeeScheduleStatus | undefined) || expected;
      if (stored !== expected) {
        batch.set(doc.ref, { status: expected }, { merge: true });
        changed += 1;
      }
    }
    if (changed > 0) {
      await batch.commit();
      return list.map((s) => ({ ...s, status: computeScheduleStatus(new Date(s.startDate), s.endDate ? new Date(s.endDate) : null) }));
    }
    return list;
  } catch (error: unknown) {
    console.error('Get date range schedules error:', error);
    return [];
  }
}

export async function createEmployeeDateRangeSchedule(
  employeeId: string,
  scheduleInput: {
    startDate: string;
    endDate?: string | null;
    days: EmployeeScheduleDays;
    repeatType: ScheduleRepeatType;
    notes?: string;
    forceOverride?: boolean;
  },
  createdBy: string
): Promise<{ success: boolean; error?: string; scheduleId?: string; conflictMessage?: string }> {
  try {
    const startDate = toDateOrNull(scheduleInput.startDate);
    const endDate = toDateOrNull(scheduleInput.endDate ?? null);
    if (!startDate) return { success: false, error: 'Start date is required.' };
    if (endDate && endDate < startDate) {
      return { success: false, error: 'End date cannot be before start date.' };
    }
    if (activeDaysCount(scheduleInput.days) === 0) {
      return { success: false, error: 'Select at least one active day.' };
    }

    const existing = await getEmployeeDateRangeSchedules(employeeId);
    const overlap = existing.find((s) => {
      if (!scheduleRangesOverlap(startDate, endDate || null, new Date(s.startDate), s.endDate ? new Date(s.endDate) : null)) {
        return false;
      }
      const sameDays = overlappingDays(scheduleInput.days, s.days);
      return sameDays.length > 0 && (s.status === 'active' || s.status === 'upcoming');
    });

    if (overlap && !scheduleInput.forceOverride) {
      const days = overlappingDays(scheduleInput.days, overlap.days).map(formatWeekdayLabel).join(', ');
      const message = `Conflict detected with schedule from ${new Date(overlap.startDate).toLocaleDateString()} to ${
        overlap.endDate ? new Date(overlap.endDate).toLocaleDateString() : 'open-ended'
      } on ${days}.`;
      return { success: false, error: message, conflictMessage: message };
    }

    const ref = adminDb.collection('employees').doc(employeeId).collection('schedules').doc();
    const status = computeScheduleStatus(startDate, endDate);
    await ref.set({
      scheduleId: ref.id,
      startDate: Timestamp.fromDate(startDate),
      endDate: endDate ? Timestamp.fromDate(endDate) : null,
      days: scheduleInput.days,
      repeatType: scheduleInput.repeatType,
      notes: scheduleInput.notes || '',
      createdBy,
      createdAt: FieldValue.serverTimestamp(),
      status,
    });
    await syncLegacyScheduleFromDateRange(employeeId, createdBy);
    return { success: true, scheduleId: ref.id };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Create date range schedule error:', err);
    return { success: false, error: err.message };
  }
}

export async function updateEmployeeDateRangeSchedule(
  employeeId: string,
  scheduleId: string,
  updates: {
    startDate?: string;
    endDate?: string | null;
    days?: EmployeeScheduleDays;
    repeatType?: ScheduleRepeatType;
    notes?: string;
    forceOverride?: boolean;
  },
  updatedBy: string
): Promise<{ success: boolean; error?: string; conflictMessage?: string }> {
  try {
    const ref = adminDb.collection('employees').doc(employeeId).collection('schedules').doc(scheduleId);
    const snap = await ref.get();
    if (!snap.exists) return { success: false, error: 'Schedule not found.' };
    const current = mapScheduleDoc(employeeId, snap as FirebaseFirestore.QueryDocumentSnapshot);

    const nextStart = updates.startDate ? toDateOrNull(updates.startDate) : new Date(current.startDate);
    const nextEnd =
      updates.endDate !== undefined
        ? toDateOrNull(updates.endDate)
        : (current.endDate ? new Date(current.endDate) : null);
    if (!nextStart) return { success: false, error: 'Invalid start date.' };
    if (nextEnd && nextEnd < nextStart) return { success: false, error: 'End date cannot be before start date.' };
    const nextDays = updates.days || current.days;

    const existing = await getEmployeeDateRangeSchedules(employeeId);
    const overlap = existing.find((s) => {
      if (s.scheduleId === scheduleId) return false;
      if (!scheduleRangesOverlap(nextStart, nextEnd || null, new Date(s.startDate), s.endDate ? new Date(s.endDate) : null)) {
        return false;
      }
      const sameDays = overlappingDays(nextDays, s.days);
      return sameDays.length > 0 && (s.status === 'active' || s.status === 'upcoming');
    });
    if (overlap && !updates.forceOverride) {
      const days = overlappingDays(nextDays, overlap.days).map(formatWeekdayLabel).join(', ');
      const message = `Conflict detected with schedule from ${new Date(overlap.startDate).toLocaleDateString()} to ${
        overlap.endDate ? new Date(overlap.endDate).toLocaleDateString() : 'open-ended'
      } on ${days}.`;
      return { success: false, error: message, conflictMessage: message };
    }

    const payload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
      status: computeScheduleStatus(nextStart, nextEnd),
    };
    if (updates.startDate !== undefined) payload.startDate = Timestamp.fromDate(nextStart);
    if (updates.endDate !== undefined) payload.endDate = nextEnd ? Timestamp.fromDate(nextEnd) : null;
    if (updates.days !== undefined) payload.days = nextDays;
    if (updates.repeatType !== undefined) payload.repeatType = updates.repeatType;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    await ref.set(payload, { merge: true });
    await syncLegacyScheduleFromDateRange(employeeId, updatedBy);
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update date range schedule error:', err);
    return { success: false, error: err.message };
  }
}

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
    const storedRole = (data?.role as Employee['role']) || 'employee';
    return {
      id: doc.id,
      email: (data?.email as string) || '',
      displayName: (data?.displayName as string) || '',
      role: resolveUserRole(doc.id, storedRole),
      status: (data?.status as Employee['status']) || 'active',
      department: data?.department,
      position: data?.position,
      phoneNumber: data?.phoneNumber,
      dateOfBirth: toISOString(data?.dateOfBirth),
      hireDate: toISOString(data?.hireDate),
      createdAt: toISOString(data?.createdAt),
      updatedAt: toISOString(data?.updatedAt),
      scheduleStart: data?.scheduleStart,
      scheduleEnd: data?.scheduleEnd,
      dayOff: data?.dayOff,
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
      currentSalary:
        data?.currentSalary === undefined || data?.currentSalary === null
          ? undefined
          : Number(data.currentSalary),
      currentPosition: data?.currentPosition,
      probationSalary:
        data?.probationSalary === undefined || data?.probationSalary === null
          ? undefined
          : Number(data.probationSalary),
      confirmedSalary:
        data?.confirmedSalary === undefined || data?.confirmedSalary === null
          ? undefined
          : Number(data.confirmedSalary),
      probationEndDate: toISOString(data?.probationEndDate),
    } as Employee;
  } catch (error: unknown) {
    console.error('Get employee error:', error);
    throw wrapFirebaseError(error);
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
      const storedRole = (data?.role as Employee['role']) || 'employee';
      return {
        id: doc.id,
        email: (data?.email as string) || '',
        displayName: (data?.displayName as string) || '',
        role: resolveUserRole(doc.id, storedRole),
        status: (data?.status as Employee['status']) || 'active',
        department: data?.department,
        position: data?.position,
        phoneNumber: data?.phoneNumber,
        dateOfBirth: toISOString(data?.dateOfBirth),
        hireDate: toISOString(data?.hireDate),
        createdAt: toISOString(data?.createdAt),
        updatedAt: toISOString(data?.updatedAt),
        scheduleStart: data?.scheduleStart,
        scheduleEnd: data?.scheduleEnd,
        dayOff: data?.dayOff,
        currentSalary:
          data?.currentSalary === undefined || data?.currentSalary === null
            ? undefined
            : Number(data.currentSalary),
        currentPosition: data?.currentPosition,
        probationSalary:
          data?.probationSalary === undefined || data?.probationSalary === null
            ? undefined
            : Number(data.probationSalary),
        confirmedSalary:
          data?.confirmedSalary === undefined || data?.confirmedSalary === null
            ? undefined
            : Number(data.confirmedSalary),
        probationEndDate: toISOString(data?.probationEndDate),
      } as Employee;
    });
  } catch (error: unknown) {
    console.error('Error fetching employees:', error);
    throw wrapFirebaseError(error);
  }
}

export async function getManagementUsers(): Promise<Employee[]> {
  try {
    const snapshot = await adminDb
      .collection('employees')
      .where('role', 'in', ['management', 'admin'])
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      const storedRole = (data?.role as Employee['role']) || 'employee';
      return {
        id: doc.id,
        email: (data?.email as string) || '',
        displayName: (data?.displayName as string) || '',
        role: resolveUserRole(doc.id, storedRole),
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
    role: 'employee' | 'management' | 'admin';
    department?: string;
    position?: string;
    phoneNumber?: string;
    dateOfBirth?: string;
    hireDate: string;
    scheduleStart?: string;
    scheduleEnd?: string;
    dayOff?: string;
    probationSalary?: number;
    confirmedSalary?: number;
    probationEndDate?: string;
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

    const hireGate = await assertCanSetPastHireDate(createdBy, data.hireDate);
    if (!hireGate.ok) {
      return { success: false, error: hireGate.error };
    }

    const userRecord = await adminAuth.createUser({
      email: data.email,
      password: data.password,
      displayName: data.displayName,
      emailVerified: false,
    });

    const employeeDoc: Record<string, unknown> = {
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
      scheduleStart: data.scheduleStart || null,
      scheduleEnd: data.scheduleEnd || null,
      dayOff: data.dayOff || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy,
    };
    if (data.probationSalary != null && !Number.isNaN(Number(data.probationSalary))) {
      employeeDoc.probationSalary = Number(data.probationSalary);
    }
    if (data.confirmedSalary != null && !Number.isNaN(Number(data.confirmedSalary))) {
      employeeDoc.confirmedSalary = Number(data.confirmedSalary);
    }
    if (data.probationEndDate) {
      const ped = new Date(data.probationEndDate);
      if (!Number.isNaN(ped.getTime())) {
        employeeDoc.probationEndDate = Timestamp.fromDate(ped);
      }
    }

    await adminDb.collection('employees').doc(userRecord.uid).set(employeeDoc);

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
    probationSalary?: number | null;
    confirmedSalary?: number | null;
    probationEndDate?: string | null;
  },
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (updates.hireDate) {
      const hireGate = await assertCanSetPastHireDate(updatedBy, updates.hireDate);
      if (!hireGate.ok) {
        return { success: false, error: hireGate.error };
      }
    }

    const processedUpdates: Record<string, unknown> = { ...updates };
    delete processedUpdates.id;

    if (updates.dateOfBirth) {
      processedUpdates.dateOfBirth = Timestamp.fromDate(new Date(updates.dateOfBirth));
    }
    if (updates.hireDate) {
      processedUpdates.hireDate = Timestamp.fromDate(new Date(updates.hireDate));
    }

    for (const key of ['scheduleStart', 'scheduleEnd', 'dayOff'] as const) {
      if (key in processedUpdates && processedUpdates[key] === '') {
        processedUpdates[key] = null;
      }
    }

    if ('probationSalary' in processedUpdates) {
      const v = processedUpdates.probationSalary;
      if (v === '' || v === null || v === undefined) {
        processedUpdates.probationSalary = FieldValue.delete();
      } else {
        const n = Number(v);
        processedUpdates.probationSalary = Number.isFinite(n) ? n : FieldValue.delete();
      }
    }
    if ('confirmedSalary' in processedUpdates) {
      const v = processedUpdates.confirmedSalary;
      if (v === '' || v === null || v === undefined) {
        processedUpdates.confirmedSalary = FieldValue.delete();
      } else {
        const n = Number(v);
        processedUpdates.confirmedSalary = Number.isFinite(n) ? n : FieldValue.delete();
      }
    }
    if ('probationEndDate' in processedUpdates) {
      const v = processedUpdates.probationEndDate;
      if (v === '' || v === null || v === undefined) {
        processedUpdates.probationEndDate = FieldValue.delete();
      } else {
        const d = new Date(String(v));
        processedUpdates.probationEndDate = Number.isNaN(d.getTime())
          ? FieldValue.delete()
          : Timestamp.fromDate(d);
      }
    }

    const scheduleTouched =
      'scheduleStart' in processedUpdates ||
      'scheduleEnd' in processedUpdates ||
      'dayOff' in processedUpdates;

    let employeeBeforeUpdate: FirebaseFirestore.DocumentSnapshot | null = null;
    if (scheduleTouched) {
      employeeBeforeUpdate = await adminDb
        .collection('employees')
        .doc(employeeId)
        .get();
    }

    await adminDb.collection('employees').doc(employeeId).update({
      ...processedUpdates,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    });

    if (scheduleTouched && employeeBeforeUpdate?.exists) {
      const newSchedule = {
        scheduleStart: ('scheduleStart' in processedUpdates
          ? (processedUpdates.scheduleStart as string | null)
          : (employeeBeforeUpdate.data()?.scheduleStart as string | null) ?? null),
        scheduleEnd: ('scheduleEnd' in processedUpdates
          ? (processedUpdates.scheduleEnd as string | null)
          : (employeeBeforeUpdate.data()?.scheduleEnd as string | null) ?? null),
        dayOff: ('dayOff' in processedUpdates
          ? (processedUpdates.dayOff as string | null)
          : (employeeBeforeUpdate.data()?.dayOff as string | null) ?? null),
      };
      await archiveScheduleChange(
        employeeId,
        employeeBeforeUpdate.data() || {},
        newSchedule,
        updatedBy
      );

      // Push-notify the employee whenever an admin/manager touched the live
      // schedule. The "Schedule Changes" toggle in NotificationSettingsScreen
      // is honored client-side; the server always sends so an employee can't
      // accidentally miss a critical shift update.
      const beforeData = employeeBeforeUpdate.data() || {};
      const previous = {
        scheduleStart: (beforeData.scheduleStart as string | null) ?? null,
        scheduleEnd: (beforeData.scheduleEnd as string | null) ?? null,
        dayOff: (beforeData.dayOff as string | null) ?? null,
      };
      if (!schedulesEqual(previous, newSchedule) && employeeId !== updatedBy) {
        const fmt = (s: string | null) => s ?? 'default';
        sendPushToEmployee(employeeId, {
          title: 'Your schedule was updated',
          body: `Shift: ${fmt(newSchedule.scheduleStart)}–${fmt(newSchedule.scheduleEnd)} · Day off: ${fmt(newSchedule.dayOff)}`,
          screen: 'Profile',
          type: 'schedule-change',
        }).catch((e) => console.error('[Employees] schedule push failed:', e));
      }
    }

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
    if (!data) return null;
    return {
      employeeId: doc.id,
      salary: Number(data.salary ?? 0),
      allowance: data.allowance != null ? Number(data.allowance) : undefined,
      bonus: data.bonus != null ? Number(data.bonus) : undefined,
      loanDeduction: data.loanDeduction != null ? Number(data.loanDeduction) : undefined,
      lateDeduction: data.lateDeduction != null ? Number(data.lateDeduction) : undefined,
      leaveBalance: data.leaveBalance != null ? Number(data.leaveBalance) : undefined,
      currency: (data.currency as string) || DEFAULT_CURRENCY,
      updatedAt:
        (data?.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
        (data?.updatedAt as string),
      updatedBy: (data.updatedBy as string) || '',
    } as Compensation;
  } catch (error: unknown) {
    console.error('Get compensation error:', error);
    return null;
  }
}

function parseIsoToDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calculatePercentChange(
  previousSalary: number | null,
  newSalary: number | null
): number | null {
  if (previousSalary == null || newSalary == null || previousSalary === 0) return null;
  return Number((((newSalary - previousSalary) / previousSalary) * 100).toFixed(2));
}

/** UTC calendar day [start, end) for overlap queries on `effectiveDate` timestamps. */
function utcDayBounds(d: Date): { start: Date; end: Date } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const start = new Date(Date.UTC(y, m, day));
  const end = new Date(Date.UTC(y, m, day + 1));
  return { start, end };
}

export async function getCompensationHistory(
  employeeId: string
): Promise<CompensationHistoryEvent[]> {
  try {
    const snap = await adminDb
      .collection('employees')
      .doc(employeeId)
      .collection('compensationHistory')
      .orderBy('effectiveDate', 'desc')
      .get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId,
        eventType: (data.eventType as CompensationEventType) || 'Merit Increase',
        previousSalary:
          data.previousSalary === null || data.previousSalary === undefined
            ? null
            : Number(data.previousSalary),
        newSalary:
          data.newSalary === null || data.newSalary === undefined
            ? null
            : Number(data.newSalary),
        percentChange:
          data.percentChange === null || data.percentChange === undefined
            ? null
            : Number(data.percentChange),
        previousPosition: (data.previousPosition as string | null) ?? null,
        newPosition: (data.newPosition as string | null) ?? null,
        effectiveDate: toISOString(data.effectiveDate) || new Date().toISOString(),
        reason: (data.reason as string | null) ?? null,
        enteredBy: (data.enteredBy as string) || '',
        enteredAt: toISOString(data.enteredAt) || new Date().toISOString(),
        status: (data.status as CompensationEventStatus) || 'scheduled',
        isRetroactive: Boolean(data.isRetroactive),
        isAmended: Boolean(data.isAmended),
        amendsEventId: (data.amendsEventId as string | null) ?? null,
      } as CompensationHistoryEvent;
    });
  } catch (error: unknown) {
    console.error('Get compensation history error:', error);
    return [];
  }
}

export async function addCompensationEvent(
  employeeId: string,
  eventInput: {
    eventType: CompensationEventType;
    newSalary: number | null;
    newPosition?: string | null;
    effectiveDate: string;
    reason?: string | null;
    amendsEventId?: string | null;
    /** Allow a second event on the same calendar day (otherwise blocked if one is scheduled/active). */
    forceSameDayOverride?: boolean;
  },
  enteredBy: string
): Promise<{ success: boolean; error?: string; eventId?: string }> {
  try {
    const effectiveDate = parseIsoToDate(eventInput.effectiveDate);
    if (!effectiveDate) return { success: false, error: 'Invalid effective date.' };

    const employeeRef = adminDb.collection('employees').doc(employeeId);
    const compensationRef = adminDb.collection('compensation').doc(employeeId);
    const historyRef = employeeRef.collection('compensationHistory').doc();

    await adminDb.runTransaction(async (tx) => {
      const [employeeSnap, compensationSnap] = await Promise.all([
        tx.get(employeeRef),
        tx.get(compensationRef),
      ]);
      if (!employeeSnap.exists) throw new Error('Employee not found');

      const employeeData = employeeSnap.data() || {};
      const compensationData = compensationSnap.data() || {};
      const now = new Date();
      const previousSalary =
        compensationData.salary === undefined || compensationData.salary === null
          ? null
          : Number(compensationData.salary);
      const previousPosition = (employeeData.position as string | null) ?? null;
      const newPosition = eventInput.newPosition ?? previousPosition;
      const status: CompensationEventStatus = effectiveDate <= now ? 'active' : 'scheduled';

      if (eventInput.eventType === 'Demotion' && !eventInput.reason?.trim()) {
        throw new Error('Reason is required for demotion.');
      }

      // Same-day overlap: block if another scheduled or active event exists for this UTC day (unless amending or override).
      if (
        !eventInput.forceSameDayOverride &&
        !eventInput.amendsEventId
      ) {
        const { start, end } = utcDayBounds(effectiveDate);
        const startTs = Timestamp.fromDate(start);
        const endTs = Timestamp.fromDate(end);
        const daySnap = await tx.get(
          employeeRef
            .collection('compensationHistory')
            .where('effectiveDate', '>=', startTs)
            .where('effectiveDate', '<', endTs)
        );
        const conflicting = daySnap.docs.filter((doc) => {
          const st = (doc.data().status as CompensationEventStatus) || '';
          return st === 'scheduled' || st === 'active';
        });
        if (conflicting.length > 0) {
          throw new Error(
            'Another compensation event is already scheduled or active for this date. Pick a different date or check "Allow same-day override".'
          );
        }
      }

      const eventData = {
        eventType: eventInput.eventType,
        previousSalary,
        newSalary: eventInput.newSalary,
        percentChange: calculatePercentChange(previousSalary, eventInput.newSalary),
        previousPosition,
        newPosition,
        effectiveDate: Timestamp.fromDate(effectiveDate),
        reason: eventInput.reason?.trim() ? eventInput.reason.trim() : null,
        enteredBy,
        enteredAt: FieldValue.serverTimestamp(),
        status,
        isRetroactive: effectiveDate < now,
        isAmended: Boolean(eventInput.amendsEventId),
        amendsEventId: eventInput.amendsEventId ?? null,
      };
      tx.set(historyRef, eventData);

      if (status === 'active') {
        const historyQuery = employeeRef
          .collection('compensationHistory')
          .where('status', '==', 'active');
        const activeSnap = await tx.get(historyQuery);
        activeSnap.docs.forEach((doc) => {
          if (doc.id === historyRef.id) return;
          tx.update(doc.ref, { status: 'superseded' });
        });

        if (eventInput.newSalary !== null) {
          tx.set(
            compensationRef,
            {
              employeeId,
              salary: eventInput.newSalary,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: enteredBy,
            },
            { merge: true }
          );
          tx.set(
            employeeRef,
            {
              currentSalary: eventInput.newSalary,
            },
            { merge: true }
          );
        }
        if (newPosition) {
          tx.set(
            employeeRef,
            {
              position: newPosition,
              currentPosition: newPosition,
              updatedAt: FieldValue.serverTimestamp(),
              updatedBy: enteredBy,
            },
            { merge: true }
          );
        }
      }

      if (eventInput.amendsEventId) {
        const amendedRef = employeeRef.collection('compensationHistory').doc(eventInput.amendsEventId);
        tx.set(
          amendedRef,
          {
            isAmended: true,
            status: 'superseded',
          },
          { merge: true }
        );
      }
    });

    return { success: true, eventId: historyRef.id };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Add compensation event error:', err);
    return { success: false, error: err.message };
  }
}

export async function createBulkColaAdjustment(
  employeeIds: string[],
  percentage: number,
  effectiveDate: string,
  reason: string | null | undefined,
  enteredBy: string
): Promise<{ success: boolean; error?: string; created: number }> {
  try {
    if (!employeeIds.length) return { success: false, error: 'No employees selected.', created: 0 };
    let created = 0;
    for (const employeeId of employeeIds) {
      const comp = await getCompensation(employeeId);
      const baseSalary = comp?.salary ?? 0;
      const newSalary = Number((baseSalary * (1 + percentage / 100)).toFixed(2));
      const result = await addCompensationEvent(
        employeeId,
        {
          eventType: 'COLA Adjustment',
          newSalary,
          effectiveDate,
          reason: reason || `COLA ${percentage}%`,
        },
        enteredBy
      );
      if (result.success) created += 1;
    }
    return { success: true, created };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Bulk COLA error:', err);
    return { success: false, error: err.message, created: 0 };
  }
}

export async function updateCompensation(
  employeeId: string,
  compensation: {
    salary: number;
    currency: string;
    /** `null` removes the field in Firestore (cleared inputs). */
    allowance: number | null;
    /** `null` removes the field in Firestore (cleared inputs). */
    bonus: number | null;
    /** `null` removes the field in Firestore (cleared inputs). */
    loanDeduction?: number | null;
    /** `null` removes the field in Firestore (cleared inputs). */
    lateDeduction?: number | null;
    /** `null` removes the field in Firestore (cleared inputs). */
    leaveBalance?: number | null;
  },
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const doc: Record<string, unknown> = {
      employeeId,
      salary: compensation.salary,
      currency: compensation.currency,
      hourlyRate: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    };
    doc.allowance =
      compensation.allowance === null ? FieldValue.delete() : compensation.allowance;
    doc.bonus = compensation.bonus === null ? FieldValue.delete() : compensation.bonus;
    doc.loanDeduction =
      compensation.loanDeduction === null || compensation.loanDeduction === undefined
        ? FieldValue.delete() : compensation.loanDeduction;
    doc.lateDeduction =
      compensation.lateDeduction === null || compensation.lateDeduction === undefined
        ? FieldValue.delete() : compensation.lateDeduction;
    doc.leaveBalance =
      compensation.leaveBalance === null || compensation.leaveBalance === undefined
        ? FieldValue.delete() : compensation.leaveBalance;

    await adminDb.collection('compensation').doc(employeeId).set(doc, { merge: true });
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update compensation error:', err);
    return { success: false, error: err.message };
  }
}

/** Set leave balance only (days). Creates a minimal compensation doc if missing. Management + admin. */
export async function updateLeaveBalanceOnly(
  employeeId: string,
  leaveBalance: number | null,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = adminDb.collection('compensation').doc(employeeId);
    const snap = await ref.get();
    const merge: Record<string, unknown> = {
      employeeId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy,
    };
    if (leaveBalance === null) {
      merge.leaveBalance = FieldValue.delete();
    } else {
      merge.leaveBalance = leaveBalance;
    }
    if (!snap.exists) {
      merge.salary = 0;
      merge.currency = DEFAULT_CURRENCY;
    }
    await ref.set(merge, { merge: true });
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('updateLeaveBalanceOnly error:', err);
    return { success: false, error: err.message };
  }
}

/** Add delta (negative to deduct) to leave balance; result floored at 0. */
export async function patchLeaveBalanceDelta(
  employeeId: string,
  deltaDays: number,
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.collection('compensation').doc(employeeId);
      const snap = await tx.get(ref);
      let cur = 0;
      if (snap.exists) {
        const v = snap.data()?.leaveBalance;
        if (v != null && v !== '') cur = Number(v);
      }
      const next = Math.max(0, cur + deltaDays);
      const merge: Record<string, unknown> = {
        leaveBalance: next,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy,
      };
      if (!snap.exists) {
        merge.employeeId = employeeId;
        merge.salary = 0;
        merge.currency = DEFAULT_CURRENCY;
      }
      tx.set(ref, merge, { merge: true });
    });
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('patchLeaveBalanceDelta error:', err);
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
