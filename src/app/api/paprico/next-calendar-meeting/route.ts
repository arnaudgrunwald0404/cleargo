/**
 * GET /api/paprico/next-calendar-meeting[?q=PaPriCo]
 *
 * Next upcoming event on the connected Google account's primary calendar whose
 * title contains the query (default "PaPriCo"). Used to pre-fill the New
 * Meeting form — a suggestion, not automation. Degrades to found:false rather
 * than erroring so the modal renders fine with no Google connection, a
 * connection that predates the calendar.readonly scope, or the Calendar API
 * not enabled on the GCP project.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { requirePapricoReader } from '@/lib/paprico/apiHelpers';
import { findNextCalendarEvent } from '@/lib/google/calendar';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest): Promise<NextResponse> {
    const auth = await requirePapricoReader();
    if ('response' in auth) return auth.response;

    const q = new URL(req.url).searchParams.get('q')?.trim() || 'PaPriCo';

    try {
        const { connected, event } = await findNextCalendarEvent(q);
        if (!connected) {
            return NextResponse.json({ found: false, reason: 'google_not_connected' });
        }
        if (!event) {
            return NextResponse.json({ found: false, reason: 'no_matching_event' });
        }
        return NextResponse.json({ found: true, event });
    } catch (err) {
        // 403 = scope missing (connection predates calendar.readonly) or the
        // Calendar API is disabled on the project; both are fixed in config,
        // not by retrying, so tell the UI quietly instead of failing the modal.
        const message = err instanceof Error ? err.message : String(err);
        console.warn('PaPriCo calendar lookup failed:', message);
        return NextResponse.json({
            found: false,
            reason: message.includes(' 403 ') ? 'calendar_access_denied' : 'lookup_failed',
            // Google's error text, truncated — surfaced to admins in the UI so
            // config problems diagnose themselves instead of hiding behind a
            // missing banner.
            detail: message.slice(0, 300),
        });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
