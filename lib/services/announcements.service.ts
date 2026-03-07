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

/**
 * Sends Expo push notifications to all employees matching the announcement target.
 * Uses the Expo Push API directly (no extra SDK). Chunked at 100 per request.
 */
async function sendPushNotificationsToTargets(
  title: string,
  content: string,
  target: AnnouncementTarget,
  targetDepartment: string | undefined
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
    const tokens: string[] = [];

    snapshot.docs.forEach((doc) => {
      const token = doc.data()?.expoPushToken;
      console.log(`[Push] Employee ${doc.id} token: ${token ?? 'MISSING'}`);
      if (token && typeof token === 'string' && token.startsWith('ExponentPushToken[')) {
        tokens.push(token);
      }
    });

    console.log(`[Push] Target="${target}", employees scanned: ${snapshot.size}, valid tokens: ${tokens.length}`);
    if (tokens.length === 0) {
      console.warn('[Push] No valid Expo push tokens found — no notifications sent');
      return;
    }

    const body = content.length > 200 ? content.substring(0, 197) + '…' : content;

    // Expo Push API accepts up to 100 messages per request
    const CHUNK_SIZE = 100;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);
      const messages = chunk.map((to) => ({
        to,
        title: `📢 ${title}`,
        body,
        data: { screen: 'Announcements' },
        sound: 'default',
        priority: 'high',
        channelId: 'announcements',
      }));

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (response.ok) {
        const result = (await response.json()) as { data: Array<{ status: string; message?: string }> };
        console.log('[Push] Expo API response:', JSON.stringify(result));
        (result.data ?? []).forEach((receipt) => {
          receipt.status === 'ok' ? successCount++ : failCount++;
        });
      } else {
        const errText = await response.text().catch(() => '');
        failCount += chunk.length;
        console.error('[Push] Expo push API HTTP error:', response.status, errText);
      }
    }

    console.log(
      `[Announcements] Push notifications — sent: ${successCount}, failed: ${failCount}`
    );
  } catch (error: unknown) {
    console.error('[Announcements] sendPushNotificationsToTargets error:', error);
  }
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

    // Send push notifications to all targeted employees (fire-and-forget)
    sendPushNotificationsToTargets(
      data.title,
      data.content,
      data.target,
      data.targetDepartment
    ).catch((err) => console.error('Failed to send push notifications:', err));

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
