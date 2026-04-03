/**
 * Consistent JSON responses for API routes.
 */

import { NextResponse } from 'next/server';
import { captureApiError } from '@/lib/monitoring/capture-error';

export function jsonSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function jsonUnauthorized(message = 'Unauthorized') {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

export function jsonForbidden(message = 'Forbidden') {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

export function jsonServerError(
  error: unknown,
  context?: { route?: string; action?: string; extra?: Record<string, unknown> }
) {
  captureApiError(error, {
    action: context?.action ?? 'request',
    tags: context?.route ? { route: context.route } : undefined,
    extra: context?.extra,
  });

  return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
}

export function reportApiException(
  error: unknown,
  context?: { route?: string; action?: string; extra?: Record<string, unknown> }
) {
  captureApiError(error, {
    action: context?.action ?? 'request',
    tags: context?.route ? { route: context.route } : undefined,
    extra: context?.extra,
  });
}
