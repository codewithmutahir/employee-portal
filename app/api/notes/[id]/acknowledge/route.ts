import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as notesService from '@/lib/services/notes.service';

/** POST /api/notes/:id/acknowledge – acknowledge note for the authenticated employee. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Note id required');

  try {
    const result = await notesService.acknowledgeNote(id, auth.employeeId);
    if (!result.success) return jsonError(result.error ?? 'Failed to acknowledge', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API acknowledge note error:', err);
    return jsonError('Internal server error', 500);
  }
}
