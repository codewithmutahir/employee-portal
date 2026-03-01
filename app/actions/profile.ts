'use server';

import * as profileService from '@/lib/services/profile.service';

export async function updateOwnProfile(
  employeeId: string,
  updates: Parameters<typeof profileService.updateOwnProfile>[1]
) {
  return profileService.updateOwnProfile(employeeId, updates);
}
export async function changePassword(employeeId: string, newPassword: string) {
  return profileService.changePassword(employeeId, newPassword);
}
export async function updateProfilePhoto(employeeId: string, photoUrl: string) {
  return profileService.updateProfilePhoto(employeeId, photoUrl);
}
export async function removeProfilePhoto(employeeId: string) {
  return profileService.removeProfilePhoto(employeeId);
}
export async function getEmergencyContacts(employeeId: string) {
  return profileService.getEmergencyContacts(employeeId);
}
export async function addEmergencyContact(
  employeeId: string,
  contact: Parameters<typeof profileService.addEmergencyContact>[1]
) {
  return profileService.addEmergencyContact(employeeId, contact);
}
export async function updateEmergencyContact(
  contactId: string,
  employeeId: string,
  updates: Parameters<typeof profileService.updateEmergencyContact>[2]
) {
  return profileService.updateEmergencyContact(contactId, employeeId, updates);
}
export async function deleteEmergencyContact(contactId: string, employeeId: string) {
  return profileService.deleteEmergencyContact(contactId, employeeId);
}
export async function getNotificationPreferences(employeeId: string) {
  return profileService.getNotificationPreferences(employeeId);
}
export async function updateNotificationPreferences(
  employeeId: string,
  preferences: Parameters<typeof profileService.updateNotificationPreferences>[1]
) {
  return profileService.updateNotificationPreferences(employeeId, preferences);
}
