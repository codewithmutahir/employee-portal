/**
 * Push notifications service – thin Expo Push wrapper used by every domain
 * (announcements, notes, leave decisions, schedule changes) so we have a
 * single, well-instrumented send-path with logging and consistent payload
 * shape (`data.screen` for in-app deep linking).
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoPushTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message?: string; details?: Record<string, unknown> };

type ExpoPushSendResponse = { data: ExpoPushTicket[] };

export type PushScreen =
  | 'Announcements'
  | 'LeaveRequests'
  | 'Notes'
  | 'Profile'
  | 'AttendanceHistory'
  | 'Dashboard';

export interface PushTarget {
  /** Single employee id, or list of employee ids; both are normalized. */
  employeeIds: string[];
}

export interface PushPayload {
  title: string;
  body: string;
  /** Optional in-app target screen (used by App.tsx tap listener). */
  screen?: PushScreen;
  /** Extra data merged into the notification payload (entity ids etc.). */
  extra?: Record<string, unknown>;
  /** Android channel id; falls back to `announcements`. */
  channelId?: string;
  /** Optional category, defaults to the screen name for log analytics. */
  type?: string;
}

interface SendResult {
  attempted: number;
  sent: number;
  failed: number;
  ticketIds: string[];
  errors: Array<{ message?: string; details?: Record<string, unknown> }>;
}

/** Truncate a notification body to a length Android/iOS will display. */
function truncateBody(input: string): string {
  if (!input) return '';
  return input.length > 200 ? input.substring(0, 197) + '…' : input;
}

async function fetchActiveTokensForEmployees(
  employeeIds: string[]
): Promise<{ tokens: string[]; scanned: number }> {
  const unique = Array.from(new Set(employeeIds.filter((id) => typeof id === 'string' && id.length > 0)));
  if (unique.length === 0) return { tokens: [], scanned: 0 };

  const tokens: string[] = [];
  let scanned = 0;
  // Firestore IN-clause is capped at 30 ids per query (10 in older versions).
  // Chunk to be safe and aggregate. Each doc read is intentional — admin SDK
  // has no equivalent of `getAll(...refs)` that filters fields.
  const CHUNK = 30;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const refs = chunk.map((id) => adminDb.collection('employees').doc(id));
    const docs = await adminDb.getAll(...refs);
    docs.forEach((doc) => {
      if (!doc.exists) return;
      scanned += 1;
      const data = doc.data() ?? {};
      if (data.status && data.status !== 'active') return;
      const token = data.expoPushToken;
      if (token && typeof token === 'string' && token.startsWith('ExponentPushToken[')) {
        tokens.push(token);
      }
    });
  }

  return { tokens, scanned };
}

async function sendExpoBatch(
  tokens: string[],
  payload: PushPayload
): Promise<SendResult> {
  const result: SendResult = { attempted: tokens.length, sent: 0, failed: 0, ticketIds: [], errors: [] };
  if (tokens.length === 0) return result;

  const body = truncateBody(payload.body);
  const data: Record<string, unknown> = { ...(payload.extra ?? {}) };
  if (payload.screen) data.screen = payload.screen;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
    const chunk = tokens.slice(i, i + CHUNK_SIZE);
    const messages = chunk.map((to) => ({
      to,
      title: payload.title,
      body,
      data,
      sound: 'default',
      priority: 'high',
      channelId: payload.channelId ?? 'announcements',
      ttl: 60 * 60 * 24, // keep for 24h so users on bad networks still receive
    }));

    try {
      const response = await fetch(EXPO_PUSH_SEND_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        result.failed += chunk.length;
        console.error('[Push] Expo HTTP error:', response.status, errText);
        continue;
      }

      const json = (await response.json()) as ExpoPushSendResponse;
      (json.data ?? []).forEach((ticket) => {
        if (ticket.status === 'ok') {
          result.sent += 1;
          result.ticketIds.push(ticket.id);
        } else {
          result.failed += 1;
          result.errors.push({ message: ticket.message, details: ticket.details });
        }
      });
    } catch (err) {
      result.failed += chunk.length;
      console.error('[Push] sendExpoBatch error:', err);
    }
  }

  return result;
}

/**
 * Send an Expo push to one or more employees by id.
 * Silently no-ops if the targets have no registered token (so the app never
 * fails an HTTP request just because notifications happen to be off).
 */
export async function sendPushToEmployees(
  target: PushTarget,
  payload: PushPayload
): Promise<SendResult | null> {
  try {
    const { tokens, scanned } = await fetchActiveTokensForEmployees(target.employeeIds);
    if (tokens.length === 0) {
      console.log(
        `[Push] No tokens for type="${payload.type ?? payload.screen ?? 'general'}", scanned=${scanned}`
      );
      return null;
    }

    const send = await sendExpoBatch(tokens, payload);
    console.log(
      `[Push] type="${payload.type ?? payload.screen ?? 'general'}" sent=${send.sent} failed=${send.failed} attempted=${send.attempted}`
    );

    // Best-effort logging for observability.
    try {
      await adminDb.collection('push_logs').doc().set({
        type: payload.type ?? payload.screen ?? 'general',
        screen: payload.screen ?? null,
        employeeIds: target.employeeIds,
        title: payload.title,
        attempted: send.attempted,
        sent: send.sent,
        failed: send.failed,
        ticketIdsCount: send.ticketIds.length,
        ticketErrors: send.errors.slice(0, 5),
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (logErr) {
      console.warn('[Push] failed to write push_logs', logErr);
    }

    return send;
  } catch (err) {
    console.error('[Push] sendPushToEmployees error:', err);
    return null;
  }
}

/** Convenience wrapper for a single employee target. */
export async function sendPushToEmployee(
  employeeId: string,
  payload: PushPayload
): Promise<SendResult | null> {
  return sendPushToEmployees({ employeeIds: [employeeId] }, payload);
}
