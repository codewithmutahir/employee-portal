'use server';

import * as notesService from '@/lib/services/notes.service';

export async function getNotes(
  employeeId: string,
  currentUserId: string,
  isManagement: boolean
) {
  return notesService.getNotes(employeeId, currentUserId, isManagement);
}
export async function addNote(
  employeeId: string,
  content: string,
  createdBy: string,
  isInternal?: boolean
) {
  return notesService.addNote(employeeId, content, createdBy, isInternal);
}
export async function updateNote(
  noteId: string,
  content: string,
  isInternal: boolean
) {
  return notesService.updateNote(noteId, content, isInternal);
}
export async function deleteNote(noteId: string) {
  return notesService.deleteNote(noteId);
}
export async function getAllNotes() {
  return notesService.getAllNotes();
}
export async function getNotesCount(
  employeeId: string,
  includeInternal?: boolean
) {
  return notesService.getNotesCount(employeeId, includeInternal);
}
export async function acknowledgeNote(noteId: string, employeeId: string) {
  return notesService.acknowledgeNote(noteId, employeeId);
}
export async function addEmployeeResponse(
  noteId: string,
  employeeId: string,
  response: string
) {
  return notesService.addEmployeeResponse(noteId, employeeId, response);
}
