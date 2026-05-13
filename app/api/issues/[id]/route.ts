import { NextRequest } from 'next/server';
import { verifyAuth, requireStaff } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonServerError } from '@/lib/api/response';
import * as issuesService from '@/lib/services/issues.service';
import type { IssueStatus } from '@/types';

/** PATCH /api/issues/:id – update issue status (management only). Body: { status, managementNote? }. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staffAuth = requireStaff(await verifyAuth(request));
  if (!staffAuth) return jsonUnauthorized();

  const { id } = await params;
  if (!id) return jsonError('Issue id required');

  try {
    const body = await request.json();
    const status = body?.status as IssueStatus | undefined;
    if (!status || !['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return jsonError('Valid status required');
    }
    const result = await issuesService.updateIssueStatus(
      id,
      status,
      body?.managementNote,
      { updatedByName: staffAuth.displayName }
    );
    if (!result.success) return jsonError(result.error ?? 'Failed to update issue', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API update issue error:', err);
    return jsonServerError(err, { route: '/api/issues/[id]', action: 'update-issue' });
  }
}
