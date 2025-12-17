/**
 * Slack request verification utility
 * Verifies that requests are genuinely from Slack using the signing secret
 */

import crypto from 'crypto';

export function verifySlackRequest(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string
): boolean {
  // Prevent replay attacks - timestamp should be within 5 minutes
  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);

  if (Math.abs(currentTime - requestTime) > 300) {
    console.error('Slack request timestamp too old');
    return false;
  }

  // Compute the signature
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature =
    'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBasestring).digest('hex');

  // Compare signatures using timing-safe comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
  } catch (error) {
    console.error('Slack signature verification failed:', error);
    return false;
  }
}

export function extractSlackHeaders(request: Request): {
  timestamp: string | null;
  signature: string | null;
} {
  return {
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
  };
}
