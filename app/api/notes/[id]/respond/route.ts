import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as notesService from '@/lib/services/notes.service';

/** POST /api/notes/:id/respond – add employee response to note. Body: { response }. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Note id required');

  try {
    const body = await request.json();
    const response = body?.response;
    if (typeof response !== 'string') return jsonError('response required');
    const result = await notesService.addEmployeeResponse(id, auth.employeeId, response);
    if (!result.success) return jsonError(result.error ?? 'Failed to respond', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API note respond error:', err);
    return jsonError('Internal server error', 500);
  }
}
