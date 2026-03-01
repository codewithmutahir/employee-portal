/**
 * Announcements service – CRUD, list for user, mark read, stats.
 * Single source of truth for announcements business logic.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Announcement, AnnouncementPriority, AnnouncementTarget } from '@/types';
import { sendAnnouncementEmail } from './email.service';

function toAnnouncement(doc: {
  exists: boolean;
  id: string;
  data: () => Record<string, unknown> | undefined;
}): Announcement | null {
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;

  return {
    id: doc.id,
    title: (data.title as string) || '',
    content: (data.content as string) || '',
    priority: (data.priority as AnnouncementPriority) || 'normal',
    target: (data.target as AnnouncementTarget) || 'all',
    targetDepartment: data.targetDepartment as string | undefined,
    createdBy: (data.createdBy as string) || '',
    createdByName: (data.createdByName as string) || '',
    createdAt:
      (data.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
      new Date().toISOString(),
    updatedAt:
      (data.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
      new Date().toISOString(),
    expiresAt: (data.expiresAt as { toDate?: () => Date })?.toDate?.()?.toISOString(),
    isActive: (data.isActive as boolean) ?? true,
    isPinned: (data.isPinned as boolean) ?? false,
    readBy: (data.readBy as string[]) || [],
  };
}

async function sendAnnouncementEmailToTargets(
  _announcementId: string,
  title: string,
  content: string,
  priority: AnnouncementPriority,
  target: AnnouncementTarget,
  targetDepartment: string | undefined,
  createdByName: string
): Promise<void> {
  try {
    const coll = adminDb.collection('employees').where('status', '==', 'active');
    const query =
      target === 'employees'
        ? coll.where('role', '==', 'employee')
        : target === 'management'
          ? coll.where('role', '==', 'management')
          : target === 'department' && targetDepartment
            ? coll.where('department', '==', targetDepartment)
            : coll;
    const snapshot = await query.get();
    const emails: string[] = [];

    snapshot.docs.forEach((doc) => {
      const email = doc.data()?.email;
      if (email) emails.push(email);
    });

    if (emails.length > 0) {
      await sendAnnouncementEmail(
        emails,
        title,
        content,
        priority,
        createdByName
      );
    }
  } catch (error: unknown) {
    console.error('Send announcement emails error:', error);
    throw error;
  }
}

export async function createAnnouncement(
  data: {
    title: string;
    content: string;
    priority: AnnouncementPriority;
    target: AnnouncementTarget;
    targetDepartment?: string;
    expiresAt?: string;
    isPinned?: boolean;
  },
  createdBy: string,
  createdByName: string,
  sendEmail: boolean = true
): Promise<{ success: boolean; announcementId?: string; error?: string }> {
  try {
    const announcementRef = adminDb.collection('announcements').doc();

    await announcementRef.set({
      title: data.title,
      content: data.content,
      priority: data.priority,
      target: data.target,
      targetDepartment: data.targetDepartment || null,
      createdBy,
      createdByName,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      isActive: true,
      isPinned: data.isPinned || false,
      readBy: [],
    });

    if (sendEmail) {
      try {
        await sendAnnouncementEmailToTargets(
          announcementRef.id,
          data.title,
          data.content,
          data.priority,
          data.target,
          data.targetDepartment,
          createdByName
        );
      } catch (emailError) {
        console.error('Failed to send announcement emails:', emailError);
      }
    }

    return { success: true, announcementId: announcementRef.id };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Create announcement error:', err);
    return { success: false, error: err.message };
  }
}

export async function getAnnouncementsForUser(
  userId: string,
  userRole: 'employee' | 'management',
  userDepartment?: string
): Promise<Announcement[]> {
  try {
    const now = new Date();

    const snapshot = await adminDb.collection('announcements').limit(100).get();

    const announcements: Announcement[] = [];

    snapshot.docs.forEach((doc) => {
      const announcement = toAnnouncement(doc);
      if (!announcement) return;

      if (!announcement.isActive) {
        return;
      }

      if (announcement.expiresAt && new Date(announcement.expiresAt) < now) {
        return;
      }

      const target = announcement.target;

      if (target === 'all') {
        announcements.push(announcement);
      } else if (target === 'employees' && userRole === 'employee') {
        announcements.push(announcement);
      } else if (target === 'management' && userRole === 'management') {
        announcements.push(announcement);
      } else if (
        target === 'department' &&
        announcement.targetDepartment === userDepartment
      ) {
        announcements.push(announcement);
      }
    });

    return announcements.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch (error: unknown) {
    console.error('Get announcements error:', error);
    return [];
  }
}

export async function getAllAnnouncements(): Promise<Announcement[]> {
  try {
    const snapshot = await adminDb.collection('announcements').limit(100).get();

    const announcements = snapshot.docs
      .map((doc) => toAnnouncement(doc))
      .filter((a): a is Announcement => a !== null);

    return announcements.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch (error: unknown) {
    console.error('Get all announcements error:', error);
    return [];
  }
}

export async function markAnnouncementAsRead(
  announcementId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const announcementRef = adminDb.collection('announcements').doc(announcementId);

    await announcementRef.update({
      readBy: FieldValue.arrayUnion(userId),
    });

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Mark announcement read error:', err);
    return { success: false, error: err.message };
  }
}

export async function updateAnnouncement(
  announcementId: string,
  data: Partial<{
    title: string;
    content: string;
    priority: AnnouncementPriority;
    target: AnnouncementTarget;
    targetDepartment: string;
    expiresAt: string;
    isActive: boolean;
    isPinned: boolean;
  }>,
  _updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const announcementRef = adminDb.collection('announcements').doc(announcementId);

    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (data.expiresAt) {
      updateData.expiresAt = new Date(data.expiresAt);
    }

    await announcementRef.update(updateData);

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update announcement error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteAnnouncement(
  announcementId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('announcements').doc(announcementId).delete();
    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Delete announcement error:', err);
    return { success: false, error: err.message };
  }
}

export async function getAnnouncementStats(announcementId: string): Promise<{
  totalReads: number;
  readBy: string[];
  error?: string;
}> {
  try {
    const doc = await adminDb
      .collection('announcements')
      .doc(announcementId)
      .get();

    if (!doc.exists) {
      return { totalReads: 0, readBy: [], error: 'Announcement not found' };
    }

    const data = doc.data();
    const readBy = (data?.readBy as string[]) || [];

    return { totalReads: readBy.length, readBy };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Get announcement stats error:', err);
    return { totalReads: 0, readBy: [], error: err.message };
  }
}

export async function getUnreadAnnouncementCount(
  userId: string,
  userRole: 'employee' | 'management',
  userDepartment?: string
): Promise<number> {
  try {
    const announcements = await getAnnouncementsForUser(
      userId,
      userRole,
      userDepartment
    );
    return announcements.filter((a) => !a.readBy.includes(userId)).length;
  } catch (error: unknown) {
    console.error('Get unread count error:', error);
    return 0;
  }
}
