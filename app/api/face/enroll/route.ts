import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as faceService from '@/lib/services/face.service';

/** POST /api/face/enroll – save face descriptor for the authenticated employee. Body: { descriptor: number[] } (128-dim). */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const body = await request.json();
    const descriptor = body?.descriptor;
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return jsonError('descriptor must be a 128-element array of numbers');
    }
    const result = await faceService.saveEmployeeFaceDescriptor(auth.employeeId, descriptor);
    if (!result.success) return jsonError(result.error ?? 'Failed to enroll', 400);
    return jsonSuccess({});
  } catch (err) {
    console.error('API face enroll error:', err);
    return jsonError('Internal server error', 500);
  }
}
