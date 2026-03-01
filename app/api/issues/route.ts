import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as issuesService from '@/lib/services/issues.service';

/** GET /api/issues – list all issues (management only). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth || auth.role !== 'management') return jsonUnauthorized();

  try {
    const data = await issuesService.getIssues();
    return jsonSuccess(data);
  } catch (err) {
    console.error('API get issues error:', err);
    return jsonSuccess([]);
  }
}

/** POST /api/issues – report an issue (employee). Body: { title, description, category }. */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const body = await request.json();
    const title = body?.title;
    const description = body?.description;
    const category = body?.category ?? 'other';
    if (!title || typeof description !== 'string') {
      return jsonError('title and description required');
    }
    const result = await issuesService.createIssue(
      { title, description, category },
      auth.employeeId,
      auth.displayName,
      auth.email
    );
    if (!result.success) return jsonError(result.error ?? 'Failed to report issue', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API create issue error:', err);
    return jsonError('Internal server error', 500);
  }
}
