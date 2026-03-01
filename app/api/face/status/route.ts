import { NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/api/auth';
import { jsonSuccess, jsonUnauthorized } from '@/lib/api/response';
import * as faceService from '@/lib/services/face.service';

/** GET /api/face/status – returns whether the authenticated employee has a face descriptor (enrolled). */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request);
  if (!auth) return jsonUnauthorized();

  try {
    const descriptor = await faceService.getEmployeeFaceDescriptor(auth.employeeId);
    return jsonSuccess({ enrolled: !!descriptor });
  } catch (err) {
    console.error('API face status error:', err);
    return jsonSuccess({ enrolled: false });
  }
}
