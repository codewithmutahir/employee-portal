import * as Sentry from "@sentry/nextjs";

type CaptureContext = {
  area?: string;
  feature?: string;
  action?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
};

export function isSentryEnabled(): boolean {
  return process.env.NODE_ENV === "production" && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}

export function captureError(error: unknown, context: CaptureContext = {}): void {
  if (!isSentryEnabled()) return;

  const normalized = normalizeError(error);

  Sentry.withScope((scope) => {
    if (context.area) scope.setTag("area", context.area);
    if (context.feature) scope.setTag("feature", context.feature);
    if (context.action) scope.setTag("action", context.action);

    if (context.tags) {
      Object.entries(context.tags).forEach(([key, value]) => scope.setTag(key, value));
    }

    if (context.extra) {
      Object.entries(context.extra).forEach(([key, value]) => scope.setExtra(key, value));
    }

    Sentry.captureException(normalized);
  });
}

export function captureApiError(
  error: unknown,
  context: Omit<CaptureContext, "area"> = {}
): void {
  captureError(error, { ...context, area: "api" });
}
