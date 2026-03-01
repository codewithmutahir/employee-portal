import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonError, jsonUnauthorized } from '@/lib/api/response';
import * as faceService from '@/lib/services/face.service';

/** L2 distance between two 128-d vectors. Face match typically uses threshold ~0.6. */
function l2Distance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length !== 128) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

const MATCH_THRESHOLD = 0.6;

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

    const distance = l2Distance(descriptor, stored);
    const match = distance <= MATCH_THRESHOLD;
    return jsonSuccess({ match, enrolled: true, distance });
  } catch (err) {
    console.error('API face verify error:', err);
    return jsonError('Internal server error', 500);
  }
}
