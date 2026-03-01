'use server';

import {
  sendEmail as sendEmailService,
  sendBirthdayReminderEmail as sendBirthdayReminderEmailService,
  sendAnniversaryReminderEmail as sendAnniversaryReminderEmailService,
  sendWelcomeEmail as sendWelcomeEmailService,
  sendPasswordResetEmail as sendPasswordResetEmailService,
  sendNotificationEmail as sendNotificationEmailService,
  sendIssueReportedEmail as sendIssueReportedEmailService,
  sendTerminationEmail as sendTerminationEmailService,
  sendReactivationEmail as sendReactivationEmailService,
  sendCompensationUpdateEmail as sendCompensationUpdateEmailService,
  sendProfileUpdateEmail as sendProfileUpdateEmailService,
  sendAnnouncementEmail as sendAnnouncementEmailService,
  sendPasswordChangeEmail as sendPasswordChangeEmailService,
  sendEmergencyContactUpdateEmail as sendEmergencyContactUpdateEmailService,
} from '@/lib/services/email.service';

export async function sendEmail(options: Parameters<typeof sendEmailService>[0]) {
  return sendEmailService(options);
}
export async function sendBirthdayReminderEmail(
  hrEmail: string,
  birthdays: { name: string; email: string; date: string }[]
) {
  return sendBirthdayReminderEmailService(hrEmail, birthdays);
}
export async function sendAnniversaryReminderEmail(
  hrEmail: string,
  anniversaries: { name: string; email: string; years: number; date: string }[]
) {
  return sendAnniversaryReminderEmailService(hrEmail, anniversaries);
}
export async function sendWelcomeEmail(
  employeeEmail: string,
  employeeName: string,
  temporaryPassword?: string
) {
  return sendWelcomeEmailService(employeeEmail, employeeName, temporaryPassword);
}
export async function sendPasswordResetEmail(email: string, resetLink: string) {
  return sendPasswordResetEmailService(email, resetLink);
}
export async function sendNotificationEmail(
  to: string | string[],
  subject: string,
  message: string,
  category?: string
) {
  return sendNotificationEmailService(to, subject, message, category);
}
export async function sendIssueReportedEmail(
  to: string | string[],
  issue: Parameters<typeof sendIssueReportedEmailService>[1]
) {
  return sendIssueReportedEmailService(to, issue);
}
export async function sendTerminationEmail(
  employeeEmail: string,
  employeeName: string,
  terminationDate: string
) {
  return sendTerminationEmailService(employeeEmail, employeeName, terminationDate);
}
export async function sendReactivationEmail(
  employeeEmail: string,
  employeeName: string
) {
  return sendReactivationEmailService(employeeEmail, employeeName);
}
export async function sendCompensationUpdateEmail(
  employeeEmail: string,
  employeeName: string,
  changes: Parameters<typeof sendCompensationUpdateEmailService>[2]
) {
  return sendCompensationUpdateEmailService(employeeEmail, employeeName, changes);
}
export async function sendProfileUpdateEmail(
  employeeEmail: string,
  employeeName: string,
  updatedFields: string[]
) {
  return sendProfileUpdateEmailService(employeeEmail, employeeName, updatedFields);
}
export async function sendAnnouncementEmail(
  recipients: string[],
  title: string,
  content: string,
  priority: 'low' | 'normal' | 'high' | 'urgent',
  createdByName: string
) {
  return sendAnnouncementEmailService(
    recipients,
    title,
    content,
    priority,
    createdByName
  );
}
export async function sendPasswordChangeEmail(
  employeeEmail: string,
  employeeName: string
) {
  return sendPasswordChangeEmailService(employeeEmail, employeeName);
}
export async function sendEmergencyContactUpdateEmail(
  employeeEmail: string,
  employeeName: string,
  action: 'added' | 'updated' | 'removed',
  contactName: string
) {
  return sendEmergencyContactUpdateEmailService(
    employeeEmail,
    employeeName,
    action,
    contactName
  );
}
