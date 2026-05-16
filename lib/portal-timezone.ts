/**
 * Portal wall-clock timezone for schedule vs clock-in comparison.
 * Schedule times (e.g. "21:00") are local business hours; ISO clock-ins are UTC in storage.
 */

const FALLBACK_TIME_ZONE = 'UTC';

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

/** Client browser TZ, then PORTAL_TIMEZONE env, then UTC. */
export function resolvePortalTimeZone(clientTimeZone?: string | null): string {
  const client = clientTimeZone?.trim();
  if (client && isValidTimeZone(client)) return client;
  const env = process.env.PORTAL_TIMEZONE?.trim();
  if (env && isValidTimeZone(env)) return env;
  return FALLBACK_TIME_ZONE;
}

/** Minutes since midnight for an ISO timestamp in the given IANA timezone. */
export function clockInToMinutesInTimeZone(clockIn: string, timeZone: string): number {
  const d = new Date(clockIn);
  const tz = resolvePortalTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  return hour * 60 + minute;
}
