import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as notesService from '@/lib/services/notes.service';

/** PATCH /api/notes/:id – update note (management only). Body: { content, isInternal }. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Note id required');

  try {
    const body = await request.json();
    const content = body?.content;
    const isInternal = Boolean(body?.isInternal);
    if (typeof content !== 'string') return jsonError('content required');
    const result = await notesService.updateNote(id, content, isInternal);
    if (!result.success) return jsonError(result.error ?? 'Failed to update note', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API update note error:', err);
    return jsonError('Internal server error', 500);
  }
}

/** DELETE /api/notes/:id – delete note (management only). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Note id required');

  try {
    const result = await notesService.deleteNote(id);
    if (!result.success) return jsonError(result.error ?? 'Failed to delete note', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API delete note error:', err);
    return jsonError('Internal server error', 500);
  }
}
