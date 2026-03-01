/**
 * Profile service – self-service profile, password, photo, emergency contacts, notification prefs.
 * Single source of truth for profile business logic.
 */

import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { EmergencyContact } from '@/types';
import {
  sendPasswordChangeEmail,
  sendEmergencyContactUpdateEmail,
} from './email.service';

export async function updateOwnProfile(
  employeeId: string,
  updates: {
    displayName?: string;
    phoneNumber?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    personalEmail?: string;
    preferredName?: string;
    pronouns?: string;
    bio?: string;
    skills?: string[];
    languages?: string[];
    socialLinks?: {
      linkedin?: string;
      twitter?: string;
      github?: string;
    };
    notificationPreferences?: {
      emailNotifications: boolean;
      announcementEmails: boolean;
      reminderEmails: boolean;
    };
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const employeeRef = adminDb.collection('employees').doc(employeeId);
    const doc = await employeeRef.get();

    if (!doc.exists) {
      return { success: false, error: 'Employee not found' };
    }

    const cleanUpdates: Record<string, unknown> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    });

    if (Object.keys(cleanUpdates).length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    cleanUpdates.updatedAt = FieldValue.serverTimestamp();

    if (updates.displayName) {
      try {
        await adminAuth.updateUser(employeeId, {
          displayName: updates.displayName,
        });
      } catch (authError) {
        console.error('Failed to update Auth displayName:', authError);
      }
    }

    await employeeRef.update(cleanUpdates);

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update own profile error:', err);
    return { success: false, error: err.message };
  }
}

export async function changePassword(
  employeeId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    await adminAuth.updateUser(employeeId, {
      password: newPassword,
    });

    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendPasswordChangeEmail(data.email, (data.displayName as string) || 'User');
        } catch (emailError) {
          console.error('Failed to send password change email:', emailError);
        }
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Change password error:', err);
    return { success: false, error: err.message };
  }
}

export async function updateProfilePhoto(
  employeeId: string,
  photoUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const employeeRef = adminDb.collection('employees').doc(employeeId);

    await employeeRef.update({
      profilePhotoUrl: photoUrl,
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await adminAuth.updateUser(employeeId, {
        photoURL: photoUrl,
      });
    } catch (authError) {
      console.error('Failed to update Auth photo:', authError);
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update profile photo error:', err);
    return { success: false, error: err.message };
  }
}

export async function removeProfilePhoto(
  employeeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const employeeRef = adminDb.collection('employees').doc(employeeId);

    await employeeRef.update({
      profilePhotoUrl: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      await adminAuth.updateUser(employeeId, {
        photoURL: null,
      });
    } catch (authError) {
      console.error('Failed to remove Auth photo:', authError);
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Remove profile photo error:', err);
    return { success: false, error: err.message };
  }
}

export async function getEmergencyContacts(
  employeeId: string
): Promise<EmergencyContact[]> {
  try {
    const snapshot = await adminDb
      .collection('emergency_contacts')
      .where('employeeId', '==', employeeId)
      .get();

    const contacts = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId: data.employeeId,
        name: data.name,
        relationship: data.relationship,
        phoneNumber: data.phoneNumber,
        email: data.email,
        address: data.address,
        isPrimary: data.isPrimary || false,
        createdAt:
          (data.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
          new Date().toISOString(),
        updatedAt:
          (data.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
          new Date().toISOString(),
      };
    });

    return contacts.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  } catch (error: unknown) {
    console.error('Get emergency contacts error:', error);
    return [];
  }
}

export async function addEmergencyContact(
  employeeId: string,
  contact: {
    name: string;
    relationship: string;
    phoneNumber: string;
    email?: string;
    address?: string;
    isPrimary?: boolean;
  }
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  try {
    if (contact.isPrimary) {
      const existingPrimary = await adminDb
        .collection('emergency_contacts')
        .where('employeeId', '==', employeeId)
        .where('isPrimary', '==', true)
        .get();

      const batch = adminDb.batch();
      existingPrimary.docs.forEach((doc) => {
        batch.update(doc.ref, { isPrimary: false });
      });
      await batch.commit();
    }

    const contactRef = adminDb.collection('emergency_contacts').doc();

    await contactRef.set({
      employeeId,
      name: contact.name,
      relationship: contact.relationship,
      phoneNumber: contact.phoneNumber,
      email: contact.email || null,
      address: contact.address || null,
      isPrimary: contact.isPrimary || false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendEmergencyContactUpdateEmail(
            data.email as string,
            (data.displayName as string) || 'User',
            'added',
            contact.name
          );
        } catch (emailError) {
          console.error('Failed to send emergency contact email:', emailError);
        }
      }
    }

    return { success: true, contactId: contactRef.id };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Add emergency contact error:', err);
    return { success: false, error: err.message };
  }
}

export async function updateEmergencyContact(
  contactId: string,
  employeeId: string,
  updates: {
    name?: string;
    relationship?: string;
    phoneNumber?: string;
    email?: string;
    address?: string;
    isPrimary?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const contactRef = adminDb.collection('emergency_contacts').doc(contactId);
    const contactDoc = await contactRef.get();

    if (!contactDoc.exists) {
      return { success: false, error: 'Contact not found' };
    }

    if (contactDoc.data()?.employeeId !== employeeId) {
      return { success: false, error: 'Unauthorized' };
    }

    if (updates.isPrimary) {
      const existingPrimary = await adminDb
        .collection('emergency_contacts')
        .where('employeeId', '==', employeeId)
        .where('isPrimary', '==', true)
        .get();

      const batch = adminDb.batch();
      existingPrimary.docs.forEach((doc) => {
        if (doc.id !== contactId) {
          batch.update(doc.ref, { isPrimary: false });
        }
      });
      await batch.commit();
    }

    const cleanUpdates: Record<string, unknown> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    });

    cleanUpdates.updatedAt = FieldValue.serverTimestamp();

    await contactRef.update(cleanUpdates);

    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendEmergencyContactUpdateEmail(
            data.email as string,
            (data.displayName as string) || 'User',
            'updated',
            (updates.name || contactDoc.data()?.name || 'Contact') as string
          );
        } catch (emailError) {
          console.error('Failed to send emergency contact email:', emailError);
        }
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update emergency contact error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteEmergencyContact(
  contactId: string,
  employeeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const contactRef = adminDb.collection('emergency_contacts').doc(contactId);
    const contactDoc = await contactRef.get();

    if (!contactDoc.exists) {
      return { success: false, error: 'Contact not found' };
    }

    if (contactDoc.data()?.employeeId !== employeeId) {
      return { success: false, error: 'Unauthorized' };
    }

    const contactName = (contactDoc.data()?.name as string) || 'Contact';

    await contactRef.delete();

    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendEmergencyContactUpdateEmail(
            data.email as string,
            (data.displayName as string) || 'User',
            'removed',
            contactName
          );
        } catch (emailError) {
          console.error('Failed to send emergency contact email:', emailError);
        }
      }
    }

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Delete emergency contact error:', err);
    return { success: false, error: err.message };
  }
}

export async function getNotificationPreferences(employeeId: string): Promise<{
  emailNotifications: boolean;
  announcementEmails: boolean;
  reminderEmails: boolean;
}> {
  try {
    const doc = await adminDb.collection('employees').doc(employeeId).get();

    if (!doc.exists) {
      return {
        emailNotifications: true,
        announcementEmails: true,
        reminderEmails: true,
      };
    }

    const prefs = doc.data()?.notificationPreferences as
      | { emailNotifications?: boolean; announcementEmails?: boolean; reminderEmails?: boolean }
      | undefined;

    return {
      emailNotifications: prefs?.emailNotifications ?? true,
      announcementEmails: prefs?.announcementEmails ?? true,
      reminderEmails: prefs?.reminderEmails ?? true,
    };
  } catch (error: unknown) {
    console.error('Get notification preferences error:', error);
    return {
      emailNotifications: true,
      announcementEmails: true,
      reminderEmails: true,
    };
  }
}

export async function updateNotificationPreferences(
  employeeId: string,
  preferences: {
    emailNotifications?: boolean;
    announcementEmails?: boolean;
    reminderEmails?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const employeeRef = adminDb.collection('employees').doc(employeeId);

    await employeeRef.update({
      notificationPreferences: preferences,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update notification preferences error:', err);
    return { success: false, error: err.message };
  }
}
