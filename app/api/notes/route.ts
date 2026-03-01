import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonForbidden } from '@/lib/api/response';
import * as notesService from '@/lib/services/notes.service';

/** GET /api/notes?employeeId= – get notes for employeeId (self or management). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  const employeeId = request.nextUrl.searchParams.get('employeeId') ?? auth.employeeId;
  if (employeeId !== auth.employeeId && auth.role !== 'management') {
    return jsonForbidden('Can only view own notes');
  }

  try {
    const data = await notesService.getNotes(
      employeeId,
      auth.employeeId,
      auth.role === 'management'
    );
    return jsonSuccess(data);
  } catch (err) {
    console.error('API get notes error:', err);
    return jsonSuccess([]);
  }
}

/** POST /api/notes – add note (management only). Body: { employeeId, content, isInternal? }. */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  try {
    const body = await request.json();
    const employeeId = body?.employeeId;
    const content = body?.content;
    if (!employeeId || typeof content !== 'string') {
      return jsonError('employeeId and content required');
    }
    const isInternal = Boolean(body?.isInternal);
    const result = await notesService.addNote(
      employeeId,
      content,
      auth.employeeId,
      isInternal
    );
    if (!result.success) return jsonError(result.error ?? 'Failed to add note', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API add note error:', err);
    return jsonError('Internal server error', 500);
  }
}
