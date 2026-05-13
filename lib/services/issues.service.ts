/**
 * Issues service – report issue, list, update status.
 * Single source of truth for issues business logic.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Issue, IssueCategory, IssueStatus } from '@/types';
import { sendIssueReportedEmail, sendIssueUpdateEmail } from './email.service';
import { getManagementUsers } from './employees.service';

function toISOString(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if ((value as { _seconds?: number })._seconds != null) {
      return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return isNaN(d.getTime()) ? undefined : d.toISOString();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function createIssue(
  data: { title: string; description: string; category: IssueCategory },
  employeeId: string,
  employeeName: string,
  employeeEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = adminDb.collection('issues').doc();
    const now = new Date().toISOString();
    const issue: Omit<Issue, 'id'> = {
      title: data.title.trim(),
      description: data.description.trim(),
      category: data.category,
      status: 'open',
      createdBy: employeeId,
      createdByName: employeeName,
      createdByEmail: employeeEmail,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set({
      ...issue,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const managers = await getManagementUsers();
    const managementEmails = managers
      .map((m) => m.email)
      .filter((e): e is string => !!e && e.includes('@'));
    if (managementEmails.length > 0) {
      const emailResult = await sendIssueReportedEmail(managementEmails, {
        title: issue.title,
        description: issue.description,
        category: issue.category,
        createdByName: issue.createdByName,
        createdByEmail: issue.createdByEmail,
        createdAt: now,
        issueId: ref.id,
      });
      if (!emailResult.success) {
        console.error('Failed to send issue notification email:', emailResult.error);
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Create issue error:', err);
    return {
      success: false,
      error: err.message || 'Failed to report issue',
    };
  }
}

export async function getIssuesByReporter(employeeId: string): Promise<Issue[]> {
  try {
    const snapshot = await adminDb.collection('issues').where('createdBy', '==', employeeId).get();
    const list = snapshot.docs.map((doc) => mapIssueDoc(doc.id, doc.data() as Record<string, unknown>));
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (error: unknown) {
    console.error('Get issues by reporter error:', error);
    return [];
  }
}

function mapIssueDoc(id: string, d: Record<string, unknown>): Issue {
  return {
    id,
    title: (d.title as string) || '',
    description: (d.description as string) || '',
    category: (d.category as IssueCategory) || 'other',
    status: (d.status as IssueStatus) || 'open',
    createdBy: (d.createdBy as string) || '',
    createdByName: (d.createdByName as string) || '',
    createdByEmail: (d.createdByEmail as string) || '',
    createdAt: toISOString(d.createdAt) || '',
    updatedAt: toISOString(d.updatedAt) || '',
    resolvedAt: toISOString(d.resolvedAt),
    managementNote:
      d.managementNote != null && d.managementNote !== ''
        ? String(d.managementNote)
        : undefined,
  } as Issue;
}

export async function getIssues(): Promise<Issue[]> {
  try {
    const snapshot = await adminDb.collection('issues').get();

    const list = snapshot.docs.map((doc) => mapIssueDoc(doc.id, doc.data() as Record<string, unknown>));

    list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return list;
  } catch (error: unknown) {
    console.error('Get issues error:', error);
    return [];
  }
}

export async function updateIssueStatus(
  issueId: string,
  status: IssueStatus,
  managementNote?: string,
  options?: { updatedByName?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = adminDb.collection('issues').doc(issueId);
    const doc = await ref.get();
    if (!doc.exists) {
      return { success: false, error: 'Issue not found' };
    }

    const prev = doc.data() as Record<string, unknown>;
    const issueTitle = (prev.title as string) || 'Your reported issue';
    const reporterEmail = (prev.createdByEmail as string) || '';

    const updates: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (managementNote !== undefined) {
      const t = managementNote.trim();
      updates.managementNote = t === '' ? null : t;
    }
    if (status === 'resolved' || status === 'closed') {
      updates.resolvedAt = FieldValue.serverTimestamp();
    }
    await ref.update(updates);

    const noteForEmail =
      managementNote !== undefined
        ? managementNote.trim()
        : ((prev.managementNote as string | undefined) ?? '').trim();

    if (reporterEmail && reporterEmail.includes('@')) {
      const emailResult = await sendIssueUpdateEmail(reporterEmail, {
        issueTitle,
        status,
        message: noteForEmail || undefined,
        updatedByName: options?.updatedByName,
      });
      if (!emailResult.success) {
        console.error('Failed to send issue update email:', emailResult.error);
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update issue status error:', err);
    return {
      success: false,
      error: err.message || 'Failed to update issue',
    };
  }
}
