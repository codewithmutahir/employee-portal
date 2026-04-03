import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isEnabled = process.env.NODE_ENV === "production" && Boolean(dsn);

let initialized = false;

function initSentry() {
  if (!isEnabled || initialized) return;

  Sentry.init({
    dsn,
    enabled: isEnabled,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
  });

  initialized = true;
}

export async function register() {
  initSentry();
}
