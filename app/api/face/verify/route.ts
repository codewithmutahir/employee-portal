import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized, jsonServerError } from '@/lib/api/response';
import * as faceService from '@/lib/services/face.service';
import {
  euclideanDistance,
  FACE_DESCRIPTOR_MATCH_THRESHOLD,
} from '@/lib/face-match';

/** POST /api/face/verify – verify face descriptor against stored descriptor. Body: { descriptor: number[] }. Returns { match: boolean }. */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const body = await request.json();
    const descriptor = body?.descriptor;
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
      return jsonError('descriptor must be a 128-element array of numbers');
    }

    const stored = await faceService.getEmployeeFaceDescriptor(auth.employeeId);
    if (!stored) {
      return jsonSuccess({ match: false, enrolled: false });
    }

    const distance = euclideanDistance(descriptor, stored);
    const match = distance <= FACE_DESCRIPTOR_MATCH_THRESHOLD;
    return jsonSuccess({ match, enrolled: true, distance });
  } catch (err) {
    console.error('API face verify error:', err);
    return jsonServerError(err, { route: '/api/face/verify', action: 'verify-face' });
  }
}
