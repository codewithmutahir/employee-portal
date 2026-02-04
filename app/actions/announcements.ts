'use server';

import { adminDb } from '@/lib/firebase/admin';
import { Announcement, AnnouncementPriority, AnnouncementTarget } from '@/types';
import { FieldValue } from 'firebase-admin/firestore';
import { sendAnnouncementEmail } from './email';

// Helper to convert Firestore data to Announcement
function toAnnouncement(doc: FirebaseFirestore.DocumentSnapshot): Announcement | null {
  if (!doc.exists) return null;
  const data = doc.data();
  if (!data) return null;

  return {
    id: doc.id,
    title: data.title || '',
    content: data.content || '',
    priority: data.priority || 'normal',
    target: data.target || 'all',
    targetDepartment: data.targetDepartment,
    createdBy: data.createdBy || '',
    createdByName: data.createdByName || '',
    createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    expiresAt: data.expiresAt?.toDate?.()?.toISOString(),
    isActive: data.isActive ?? true,
    isPinned: data.isPinned ?? false,
    readBy: data.readBy || [],
  };
}

/**
 * Create a new announcement
 */
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

    // Send email notifications if requested
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
  } catch (error: any) {
    console.error('Create announcement error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all active announcements for a user
 */
export async function getAnnouncementsForUser(
  userId: string,
  userRole: 'employee' | 'management',
  userDepartment?: string
): Promise<Announcement[]> {
  try {
    const now = new Date();
    
    // Get all active announcements
    const snapshot = await adminDb.collection('announcements')
      .where('isActive', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const announcements: Announcement[] = [];

    snapshot.docs.forEach(doc => {
      const announcement = toAnnouncement(doc);
      if (!announcement) return;

      // Check if expired
      if (announcement.expiresAt && new Date(announcement.expiresAt) < now) {
        return;
      }

      // Check target audience
      const target = announcement.target;
      
      if (target === 'all') {
        announcements.push(announcement);
      } else if (target === 'employees' && userRole === 'employee') {
        announcements.push(announcement);
      } else if (target === 'management' && userRole === 'management') {
        announcements.push(announcement);
      } else if (target === 'department' && announcement.targetDepartment === userDepartment) {
        announcements.push(announcement);
      }
    });

    // Sort: pinned first, then by date
    return announcements.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } catch (error: any) {
    console.error('Get announcements error:', error);
    return [];
  }
}

/**
 * Get all announcements (for management)
 */
export async function getAllAnnouncements(): Promise<Announcement[]> {
  try {
    const snapshot = await adminDb.collection('announcements')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    return snapshot.docs
      .map(doc => toAnnouncement(doc))
      .filter((a): a is Announcement => a !== null);
  } catch (error: any) {
    console.error('Get all announcements error:', error);
    return [];
  }
}

/**
 * Mark announcement as read by user
 */
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
  } catch (error: any) {
    console.error('Mark announcement read error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an announcement
 */
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
  updatedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const announcementRef = adminDb.collection('announcements').doc(announcementId);
    
    const updateData: any = {
      ...data,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (data.expiresAt) {
      updateData.expiresAt = new Date(data.expiresAt);
    }

    await announcementRef.update(updateData);

    return { success: true };
  } catch (error: any) {
    console.error('Update announcement error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete an announcement
 */
export async function deleteAnnouncement(
  announcementId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminDb.collection('announcements').doc(announcementId).delete();
    return { success: true };
  } catch (error: any) {
    console.error('Delete announcement error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get announcement read statistics
 */
export async function getAnnouncementStats(
  announcementId: string
): Promise<{ totalReads: number; readBy: string[]; error?: string }> {
  try {
    const doc = await adminDb.collection('announcements').doc(announcementId).get();
    
    if (!doc.exists) {
      return { totalReads: 0, readBy: [], error: 'Announcement not found' };
    }

    const data = doc.data();
    const readBy = data?.readBy || [];

    return { totalReads: readBy.length, readBy };
  } catch (error: any) {
    console.error('Get announcement stats error:', error);
    return { totalReads: 0, readBy: [], error: error.message };
  }
}

/**
 * Get unread announcement count for a user
 */
export async function getUnreadAnnouncementCount(
  userId: string,
  userRole: 'employee' | 'management',
  userDepartment?: string
): Promise<number> {
  try {
    const announcements = await getAnnouncementsForUser(userId, userRole, userDepartment);
    return announcements.filter(a => !a.readBy.includes(userId)).length;
  } catch (error) {
    console.error('Get unread count error:', error);
    return 0;
  }
}

/**
 * Helper: Send announcement email to target audience
 */
async function sendAnnouncementEmailToTargets(
  announcementId: string,
  title: string,
  content: string,
  priority: AnnouncementPriority,
  target: AnnouncementTarget,
  targetDepartment: string | undefined,
  createdByName: string
): Promise<void> {
  try {
    // Build query based on target
    let query = adminDb.collection('employees').where('status', '==', 'active');

    if (target === 'employees') {
      query = query.where('role', '==', 'employee') as any;
    } else if (target === 'management') {
      query = query.where('role', '==', 'management') as any;
    } else if (target === 'department' && targetDepartment) {
      query = query.where('department', '==', targetDepartment) as any;
    }

    const snapshot = await query.get();
    const emails: string[] = [];

    snapshot.docs.forEach(doc => {
      const email = doc.data()?.email;
      if (email) emails.push(email);
    });

    if (emails.length > 0) {
      await sendAnnouncementEmail(emails, title, content, priority, createdByName);
    }
  } catch (error) {
    console.error('Send announcement emails error:', error);
    throw error;
  }
}
