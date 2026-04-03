import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isEnabled = process.env.NODE_ENV === "production" && Boolean(dsn);

Sentry.init({
  dsn,
  enabled: isEnabled,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0,
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications.",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
