import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as announcementsService from '@/lib/services/announcements.service';

/** PATCH /api/announcements/:id – update announcement (management only). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Announcement id required');

  try {
    const body = await request.json().catch(() => ({}));
    const result = await announcementsService.updateAnnouncement(
      id,
      body,
      auth.employeeId
    );
    if (!result.success) return jsonError(result.error ?? 'Failed to update', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API update announcement error:', err);
    return jsonError('Internal server error', 500);
  }
}

/** DELETE /api/announcements/:id – delete announcement (management only). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Announcement id required');

  try {
    const result = await announcementsService.deleteAnnouncement(id);
    if (!result.success) return jsonError(result.error ?? 'Failed to delete', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API delete announcement error:', err);
    return jsonError('Internal server error', 500);
  }
}
