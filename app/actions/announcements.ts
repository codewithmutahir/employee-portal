'use server';

import * as announcementsService from '@/lib/services/announcements.service';

export async function createAnnouncement(
  data: Parameters<typeof announcementsService.createAnnouncement>[0],
  createdBy: string,
  createdByName: string,
  sendEmail?: boolean
) {
  return announcementsService.createAnnouncement(
    data,
    createdBy,
    createdByName,
    sendEmail
  );
}
export async function getAnnouncementsForUser(
  userId: string,
  userRole: 'employee' | 'management',
  userDepartment?: string
) {
  return announcementsService.getAnnouncementsForUser(
    userId,
    userRole,
    userDepartment
  );
}
export async function getAllAnnouncements() {
  return announcementsService.getAllAnnouncements();
}
export async function markAnnouncementAsRead(
  announcementId: string,
  userId: string
) {
  return announcementsService.markAnnouncementAsRead(announcementId, userId);
}
export async function updateAnnouncement(
  announcementId: string,
  data: Parameters<typeof announcementsService.updateAnnouncement>[1],
  updatedBy: string
) {
  return announcementsService.updateAnnouncement(
    announcementId,
    data,
    updatedBy
  );
}
export async function deleteAnnouncement(announcementId: string) {
  return announcementsService.deleteAnnouncement(announcementId);
}
export async function getAnnouncementStats(announcementId: string) {
  return announcementsService.getAnnouncementStats(announcementId);
}
export async function getUnreadAnnouncementCount(
  userId: string,
  userRole: 'employee' | 'management',
  userDepartment?: string
) {
  return announcementsService.getUnreadAnnouncementCount(
    userId,
    userRole,
    userDepartment
  );
}
