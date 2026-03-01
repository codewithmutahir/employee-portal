import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as announcementsService from '@/lib/services/announcements.service';

/** GET /api/announcements – list announcements for the authenticated user (filtered by role/department). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const data = await announcementsService.getAnnouncementsForUser(
      auth.employeeId,
      auth.role,
      auth.department
    );
    return jsonSuccess(data);
  } catch (err) {
    console.error('API get announcements error:', err);
    return jsonSuccess([]);
  }
}

/** POST /api/announcements – create announcement (management only). Body: { title, content, priority, target, targetDepartment?, expiresAt?, isPinned?, sendEmail? }. */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  try {
    const body = await request.json();
    const title = body?.title;
    const content = body?.content;
    const priority = body?.priority ?? 'normal';
    const target = body?.target ?? 'all';
    if (!title || typeof content !== 'string') {
      return jsonError('title and content required');
    }
    const result = await announcementsService.createAnnouncement(
      {
        title,
        content,
        priority,
        target,
        targetDepartment: body?.targetDepartment,
        expiresAt: body?.expiresAt,
        isPinned: body?.isPinned,
      },
      auth.employeeId,
      auth.displayName,
      body?.sendEmail !== false
    );
    if (!result.success) return jsonError(result.error ?? 'Failed to create announcement', 400);
    return jsonSuccess({ announcementId: result.announcementId });
  } catch (err) {
    console.error('API create announcement error:', err);
    return jsonError('Internal server error', 500);
  }
}
