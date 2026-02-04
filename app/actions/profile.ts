'use server';

import { adminDb, adminAuth } from '@/lib/firebase/admin';
import { EmergencyContact } from '@/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendPasswordChangeEmail, sendEmergencyContactUpdateEmail } from './email';

// ==================== PROFILE UPDATES ====================

/**
 * Update employee's own profile (self-service)
 */
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

    // Filter out undefined values
    const cleanUpdates: any = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    });

    if (Object.keys(cleanUpdates).length === 0) {
      return { success: false, error: 'No updates provided' };
    }

    cleanUpdates.updatedAt = FieldValue.serverTimestamp();

    // Update Firebase Auth displayName if changed
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
  } catch (error: any) {
    console.error('Update own profile error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Change password (self-service)
 */
export async function changePassword(
  employeeId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate password
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    // Update password in Firebase Auth
    await adminAuth.updateUser(employeeId, {
      password: newPassword,
    });

    // Get employee email for notification
    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendPasswordChangeEmail(data.email, data.displayName || 'User');
        } catch (emailError) {
          console.error('Failed to send password change email:', emailError);
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Change password error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Upload profile photo URL (assumes photo is already uploaded to storage)
 */
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

    // Also update Firebase Auth photo
    try {
      await adminAuth.updateUser(employeeId, {
        photoURL: photoUrl,
      });
    } catch (authError) {
      console.error('Failed to update Auth photo:', authError);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Update profile photo error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Remove profile photo
 */
export async function removeProfilePhoto(
  employeeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const employeeRef = adminDb.collection('employees').doc(employeeId);
    
    await employeeRef.update({
      profilePhotoUrl: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Also update Firebase Auth
    try {
      await adminAuth.updateUser(employeeId, {
        photoURL: null,
      });
    } catch (authError) {
      console.error('Failed to remove Auth photo:', authError);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Remove profile photo error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== EMERGENCY CONTACTS ====================

/**
 * Get emergency contacts for an employee
 */
export async function getEmergencyContacts(
  employeeId: string
): Promise<EmergencyContact[]> {
  try {
    console.log('📞 Fetching emergency contacts for employee:', employeeId);
    
    // Simple query - just filter by employeeId, sort in memory
    const snapshot = await adminDb.collection('emergency_contacts')
      .where('employeeId', '==', employeeId)
      .get();

    console.log('📞 Found', snapshot.docs.length, 'emergency contacts');

    const contacts = snapshot.docs.map(doc => {
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
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    });
    
    // Sort: primary first, then by creation date
    return contacts.sort((a, b) => {
      if (a.isPrimary && !b.isPrimary) return -1;
      if (!a.isPrimary && b.isPrimary) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  } catch (error: any) {
    console.error('❌ Get emergency contacts error:', error);
    return [];
  }
}

/**
 * Add emergency contact
 */
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
    // If this is primary, remove primary from others
    if (contact.isPrimary) {
      const existingPrimary = await adminDb.collection('emergency_contacts')
        .where('employeeId', '==', employeeId)
        .where('isPrimary', '==', true)
        .get();

      const batch = adminDb.batch();
      existingPrimary.docs.forEach(doc => {
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

    // Send email notification
    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendEmergencyContactUpdateEmail(
            data.email,
            data.displayName || 'User',
            'added',
            contact.name
          );
        } catch (emailError) {
          console.error('Failed to send emergency contact email:', emailError);
        }
      }
    }

    return { success: true, contactId: contactRef.id };
  } catch (error: any) {
    console.error('Add emergency contact error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update emergency contact
 */
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

    // Verify ownership
    if (contactDoc.data()?.employeeId !== employeeId) {
      return { success: false, error: 'Unauthorized' };
    }

    // If setting as primary, remove primary from others
    if (updates.isPrimary) {
      const existingPrimary = await adminDb.collection('emergency_contacts')
        .where('employeeId', '==', employeeId)
        .where('isPrimary', '==', true)
        .get();

      const batch = adminDb.batch();
      existingPrimary.docs.forEach(doc => {
        if (doc.id !== contactId) {
          batch.update(doc.ref, { isPrimary: false });
        }
      });
      await batch.commit();
    }

    const cleanUpdates: any = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanUpdates[key] = value;
      }
    });

    cleanUpdates.updatedAt = FieldValue.serverTimestamp();

    await contactRef.update(cleanUpdates);

    // Send email notification
    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendEmergencyContactUpdateEmail(
            data.email,
            data.displayName || 'User',
            'updated',
            updates.name || contactDoc.data()?.name || 'Contact'
          );
        } catch (emailError) {
          console.error('Failed to send emergency contact email:', emailError);
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Update emergency contact error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete emergency contact
 */
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

    // Verify ownership
    if (contactDoc.data()?.employeeId !== employeeId) {
      return { success: false, error: 'Unauthorized' };
    }

    const contactName = contactDoc.data()?.name || 'Contact';

    await contactRef.delete();

    // Send email notification
    const employeeDoc = await adminDb.collection('employees').doc(employeeId).get();
    if (employeeDoc.exists) {
      const data = employeeDoc.data();
      if (data?.email) {
        try {
          await sendEmergencyContactUpdateEmail(
            data.email,
            data.displayName || 'User',
            'removed',
            contactName
          );
        } catch (emailError) {
          console.error('Failed to send emergency contact email:', emailError);
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('Delete emergency contact error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== NOTIFICATION PREFERENCES ====================

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(
  employeeId: string
): Promise<{
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

    const prefs = doc.data()?.notificationPreferences;
    
    return {
      emailNotifications: prefs?.emailNotifications ?? true,
      announcementEmails: prefs?.announcementEmails ?? true,
      reminderEmails: prefs?.reminderEmails ?? true,
    };
  } catch (error) {
    console.error('Get notification preferences error:', error);
    return {
      emailNotifications: true,
      announcementEmails: true,
      reminderEmails: true,
    };
  }
}

/**
 * Update notification preferences
 */
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
  } catch (error: any) {
    console.error('Update notification preferences error:', error);
    return { success: false, error: error.message };
  }
}
