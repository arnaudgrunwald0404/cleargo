/**
 * Debug logging utility for Cursor's debug mode.
 * 
 * To enable debugging:
 * 1. Replace {session-id} below with the actual session ID from Cursor's debug mode
 * 2. Set DEBUG_ENABLED to true
 * 
 * To disable: Set DEBUG_ENABLED to false
 */

const DEBUG_ENABLED = false;
const DEBUG_ENDPOINT = 'http://127.0.0.1:7243/ingest/{session-id}';

interface DebugPayload {
  location: string;
  message: string;
  data?: Record<string, unknown>;
  sessionId?: string;
  hypothesisId?: string;
}

/**
 * Send a debug log to the configured endpoint.
 * No-ops silently when DEBUG_ENABLED is false.
 */
export function debugLog(payload: DebugPayload): void {
  if (!DEBUG_ENABLED) return;

  fetch(DEBUG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      timestamp: Date.now(),
      sessionId: payload.sessionId ?? 'debug-session',
    }),
  }).catch(() => {});
}

