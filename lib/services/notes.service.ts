/**
 * Notes service – employee notes, internal notes, acknowledge, response.
 * Single source of truth for notes business logic.
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { Note } from '@/types';

export async function getNotes(
  employeeId: string,
  _currentUserId: string,
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
          (data.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
          new Date().toISOString(),
        acknowledgedAt: (data.acknowledgedAt as { toDate?: () => Date })?.toDate?.()?.toISOString(),
        acknowledgedBy: data.acknowledgedBy,
        employeeResponse: data.employeeResponse,
      } as Note;
    });

    if (!isManagement) {
      notes = notes.filter((note) => !note.isInternal);
    }

    return notes;
  } catch (error: unknown) {
    console.error('Get notes error:', error);
    return [];
  }
}

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
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Add note error:', err);
    return { success: false, error: err.message };
  }
}

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
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Update note error:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteNote(noteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const noteRef = adminDb.collection('notes').doc(noteId);
    await noteRef.delete();

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Delete note error:', err);
    return { success: false, error: err.message };
  }
}

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
          (data.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ||
          new Date().toISOString(),
        acknowledgedAt: (data.acknowledgedAt as { toDate?: () => Date })?.toDate?.()?.toISOString(),
        acknowledgedBy: data.acknowledgedBy,
        employeeResponse: data.employeeResponse,
      } as Note;
    });

    return notes;
  } catch (error: unknown) {
    console.error('Get all notes error:', error);
    return [];
  }
}

export async function getNotesCount(
  employeeId: string,
  includeInternal: boolean = false
): Promise<number> {
  try {
    const notesRef = adminDb.collection('notes');
    let query = notesRef.where('employeeId', '==', employeeId);

    if (!includeInternal) {
      query = notesRef.where('employeeId', '==', employeeId).where('isInternal', '==', false);
    }

    const snapshot = await query.get();
    return snapshot.size;
  } catch (error: unknown) {
    console.error('Get notes count error:', error);
    return 0;
  }
}

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
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Acknowledge note error:', err);
    return { success: false, error: err.message };
  }
}

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
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Add employee response error:', err);
    return { success: false, error: err.message };
  }
}
