'use server';

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Issue, IssueCategory, IssueStatus } from '@/types';
import { getManagementUsers } from '@/app/actions/employees';
import { sendIssueReportedEmail } from '@/app/actions/email';

function toISOString(value: unknown): string | undefined {
  if (!value) return undefined;
  try {
    if (typeof (value as any)?.toDate === 'function') {
      return (value as any).toDate().toISOString();
    }
    if ((value as any)._seconds != null) {
      return new Date((value as any)._seconds * 1000).toISOString();
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

/**
 * Report an issue (employee only). Saves to Firestore and emails management.
 */
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
      const emailResult = await sendIssueReportedEmail(
        managementEmails,
        {
          title: issue.title,
          description: issue.description,
          category: issue.category,
          createdByName: issue.createdByName,
          createdByEmail: issue.createdByEmail,
          createdAt: now,
          issueId: ref.id,
        }
      );
      if (!emailResult.success) {
        console.error('Failed to send issue notification email:', emailResult.error);
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Create issue error:', error);
    return { success: false, error: error.message || 'Failed to report issue' };
  }
}

/**
 * Get all reported issues (management only). Newest first.
 */
export async function getIssues(): Promise<Issue[]> {
  try {
    const snapshot = await adminDb.collection('issues').get();

    const list = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        title: d.title || '',
        description: d.description || '',
        category: (d.category || 'other') as IssueCategory,
        status: (d.status || 'open') as IssueStatus,
        createdBy: d.createdBy || '',
        createdByName: d.createdByName || '',
        createdByEmail: d.createdByEmail || '',
        createdAt: toISOString(d.createdAt) || '',
        updatedAt: toISOString(d.updatedAt) || '',
        resolvedAt: toISOString(d.resolvedAt),
        managementNote: d.managementNote,
      } as Issue;
    });

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  } catch (error: any) {
    console.error('Get issues error:', error);
    return [];
  }
}

/**
 * Update issue status (and optional management note). Management only.
 */
export async function updateIssueStatus(
  issueId: string,
  status: IssueStatus,
  managementNote?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = adminDb.collection('issues').doc(issueId);
    const doc = await ref.get();
    if (!doc.exists) {
      return { success: false, error: 'Issue not found' };
    }

    const updates: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (managementNote !== undefined) {
      updates.managementNote = managementNote;
    }
    if (status === 'resolved' || status === 'closed') {
      updates.resolvedAt = FieldValue.serverTimestamp();
    }
    await ref.update(updates);
    return { success: true };
  } catch (error: any) {
    console.error('Update issue status error:', error);
    return { success: false, error: error.message || 'Failed to update issue' };
  }
}
