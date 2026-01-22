'use server';

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Note } from '@/types';

/**
 * Get notes for an employee
 * @param employeeId - The employee ID to fetch notes for
 * @param currentUserId - The ID of the user making the request
 * @param isManagement - Whether the current user is management
 * @returns Array of notes (filtered based on user role)
 */
export async function getNotes(
  employeeId: string,
  currentUserId: string,
  isManagement: boolean
): Promise<Note[]> {
  try {
    const notesRef = adminDb.collection('notes');

    const query = notesRef
      .where('employeeId', '==', employeeId)
      .orderBy('createdAt', 'desc');

    const snapshot = await query.get();

    if (snapshot.empty) {
      return [];
    }

    let notes = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        employeeId: data.employeeId,
        content: data.content,
        createdBy: data.createdBy,
        isInternal: data.isInternal || false,
        createdAt:
          data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        acknowledgedAt: data.acknowledgedAt?.toDate?.()?.toISOString(),
        acknowledgedBy: data.acknowledgedBy,
        employeeResponse: data.employeeResponse,
      } as Note;
    });

    // Filter internal notes if user is not management
    if (!isManagement) {
      notes = notes.filter((note) => !note.isInternal);
    }

    return notes;
  } catch (error: any) {
    console.error('❌ Get notes error:', error);
    console.error('❌ Error stack:', error.stack);
    return [];
  }
}

/**
 * Add a new note for an employee (management only)
 */
export async function addNote(
  employeeId: string,
  content: string,
  createdBy: string,
  isInternal: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const notesRef = adminDb.collection('notes');
    await notesRef.add({
      employeeId,
      content,
      createdBy,
      isInternal,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ Add note error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update an existing note (management only)
 */
export async function updateNote(
  noteId: string,
  content: string,
  isInternal: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const noteRef = adminDb.collection('notes').doc(noteId);
    await noteRef.update({
      content,
      isInternal,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ Update note error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a note (management only)
 */
export async function deleteNote(
  noteId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const noteRef = adminDb.collection('notes').doc(noteId);
    await noteRef.delete();

    return { success: true };
  } catch (error: any) {
    console.error('❌ Delete note error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all notes for all employees (management only)
 */
export async function getAllNotes(): Promise<Note[]> {
  try {
    const notesRef = adminDb.collection('notes');
    const snapshot = await notesRef.orderBy('createdAt', 'desc').get();

    const notes = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        employeeId: data.employeeId,
        content: data.content,
        createdBy: data.createdBy,
        isInternal: data.isInternal || false,
        createdAt:
          data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        acknowledgedAt: data.acknowledgedAt?.toDate?.()?.toISOString(),
        acknowledgedBy: data.acknowledgedBy,
        employeeResponse: data.employeeResponse,
      } as Note;
    });

    return notes;
  } catch (error: any) {
    console.error('❌ Get all notes error:', error);
    return [];
  }
}

/**
 * Get notes count for an employee
 */
export async function getNotesCount(
  employeeId: string,
  includeInternal: boolean = false
): Promise<number> {
  try {
    const notesRef = adminDb.collection('notes');
    let query = notesRef.where('employeeId', '==', employeeId);

    if (!includeInternal) {
      query = query.where('isInternal', '==', false) as any;
    }

    const snapshot = await query.get();
    return snapshot.size;
  } catch (error: any) {
    console.error('❌ Get notes count error:', error);
    return 0;
  }
}

/**
 * Acknowledge a note
 */
export async function acknowledgeNote(
  noteId: string,
  employeeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const noteRef = adminDb.collection('notes').doc(noteId);
    const noteDoc = await noteRef.get();

    if (!noteDoc.exists) {
      return { success: false, error: 'Note not found' };
    }

    const noteData = noteDoc.data();
    if (noteData?.employeeId !== employeeId) {
      return { success: false, error: 'Unauthorized to acknowledge this note' };
    }

    await noteRef.update({
      acknowledgedAt: FieldValue.serverTimestamp(),
      acknowledgedBy: employeeId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ Acknowledge note error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add employee response to a note
 */
export async function addEmployeeResponse(
  noteId: string,
  employeeId: string,
  response: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const noteRef = adminDb.collection('notes').doc(noteId);
    const noteDoc = await noteRef.get();

    if (!noteDoc.exists) {
      return { success: false, error: 'Note not found' };
    }

    const noteData = noteDoc.data();
    if (noteData?.employeeId !== employeeId) {
      return { success: false, error: 'Unauthorized to respond to this note' };
    }

    await noteRef.update({
      employeeResponse: response,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error('❌ Add employee response error:', error);
    return { success: false, error: error.message };
  }
}