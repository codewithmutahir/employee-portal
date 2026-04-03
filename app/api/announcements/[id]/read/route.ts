import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonServerError } from '@/lib/api/response';
import * as announcementsService from '@/lib/services/announcements.service';

/** POST /api/announcements/:id/read – mark announcement as read for the authenticated user. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Announcement id required');

  try {
    const result = await announcementsService.markAnnouncementAsRead(id, auth.employeeId);
    if (!result.success) return jsonError(result.error ?? 'Failed to mark read', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API mark announcement read error:', err);
    return jsonServerError(err, { route: '/api/announcements/[id]/read', action: 'mark-read' });
  }
}
