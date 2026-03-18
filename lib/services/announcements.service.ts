/**
 * Announcements service – CRUD, list for user, mark read, stats.
 * Single source of truth for announcements business logic.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Announcement, AnnouncementPriority, AnnouncementTarget } from '@/types';
import { sendAnnouncementEmail } from './email.service';

type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: Record<string, unknown> };

type ExpoPushSendResponse = { data: ExpoPushTicket[] };

type ExpoPushReceipt =
  | { status: 'ok' }
  | { status: 'error'; message?: string; details?: Record<string, unknown> };

type ExpoPushReceiptsResponse = { data: Record<string, ExpoPushReceipt> };

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function redactExpoToken(token: string): string {
  const m = token.match(/^ExponentPushToken\[(.+)\]$/);
  if (!m) return 'ExponentPushToken[redacted]';
  const inner = m[1] ?? '';
  const tail = inner.slice(-6);
  return `ExponentPushToken[***${tail}]`;
}

async function fetchExpoReceipts(ticketIds: string[]): Promise<Record<string, ExpoPushReceipt>> {
  const res = await fetch(EXPO_PUSH_RECEIPTS_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: ticketIds }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Expo receipts HTTP ${res.status} ${errText}`);
  }
  const json = (await res.json()) as ExpoPushReceiptsResponse;
  return json.data ?? {};
}

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
  targetDepartment: string | undefined,
  opts?: { announcementId?: string }
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
    const ticketIds: string[] = [];
    const ticketErrors: Array<{ message?: string; details?: Record<string, unknown> }> = [];

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
        ttl: 120,
      }));

      const response = await fetch(EXPO_PUSH_SEND_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (response.ok) {
        const result = (await response.json()) as ExpoPushSendResponse;
        console.log('[Push] Expo API response:', JSON.stringify(result));
        (result.data ?? []).forEach((ticket) => {
          if (ticket.status === 'ok') {
            successCount++;
            ticketIds.push(ticket.id);
          } else {
            failCount++;
            ticketErrors.push({ message: ticket.message, details: ticket.details });
          }
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

    // Persist a push log + attempt receipts fetch (best-effort) for observability.
    try {
      const logRef = adminDb.collection('push_logs').doc();
      await logRef.set({
        type: 'announcement',
        announcementId: opts?.announcementId ?? null,
        target,
        targetDepartment: targetDepartment ?? null,
        employeesScanned: snapshot.size,
        tokensFound: tokens.length,
        tokenSamples: tokens.slice(0, 5).map(redactExpoToken),
        ticketIdsCount: ticketIds.length,
        ticketErrorsCount: ticketErrors.length,
        ticketErrors: ticketErrors.slice(0, 5),
        createdAt: FieldValue.serverTimestamp(),
      });

      if (ticketIds.length > 0) {
        const attempts = [2000, 5000, 10000];
        let receipts: Record<string, ExpoPushReceipt> = {};
        for (const waitMs of attempts) {
          await sleep(waitMs);
          receipts = await fetchExpoReceipts(ticketIds);
          if (Object.keys(receipts).length >= Math.min(ticketIds.length, 20)) break;
        }

        const receiptValues = Object.values(receipts);
        const receiptOk = receiptValues.filter((r) => r.status === 'ok').length;
        const receiptErr = receiptValues.filter((r) => r.status === 'error').length;

        await logRef.update({
          receiptFetchedAt: FieldValue.serverTimestamp(),
          receiptCount: Object.keys(receipts).length,
          receiptOk,
          receiptErr,
          receiptErrors: Object.entries(receipts)
            .filter(([, r]) => r.status === 'error')
            .slice(0, 10)
            .map(([id, r]) => ({
              id,
              message: (r as any).message,
              details: (r as any).details,
            })),
        });
      }
    } catch (e) {
      console.error('[Push] Failed to write push_logs / receipts:', e);
    }
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
      data.targetDepartment,
      { announcementId: announcementRef.id }
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
