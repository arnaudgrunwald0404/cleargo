/**
 * Calendar REST calls (read-only).
 *
 * Requires the OAuth connection specifically: the service-account fallback in
 * getGoogleAccessToken() is minted with Drive/Docs scopes only and a service
 * account has no personal calendar to read. Callers therefore see
 * { connected: false } instead of a scope error when only a service account
 * is configured.
 */
import { getOAuthAccessToken } from './oauth';
import { googleFetch } from './client';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface CalendarEventTime {
    /** RFC3339, set for timed events. */
    dateTime?: string;
    /** YYYY-MM-DD, set for all-day events. */
    date?: string;
}

export interface CalendarEvent {
    id?: string;
    summary?: string;
    status?: string;
    start?: CalendarEventTime;
    end?: CalendarEventTime;
}

export interface NextCalendarEvent {
    summary: string;
    /** RFC3339 start for timed events; YYYY-MM-DD for all-day events. */
    start: string;
    /** True when the event has no time component. */
    all_day: boolean;
    duration_minutes: number | null;
}

/**
 * First non-cancelled upcoming event whose title contains the query
 * (case-insensitive). The API's `q` also matches descriptions and attendees,
 * so the title filter keeps e.g. "Prep doc mentions PaPriCo" meetings out.
 * Pure, so the matching rules are unit-testable.
 */
export function pickNextMatchingEvent(
    items: CalendarEvent[],
    query: string
): NextCalendarEvent | null {
    const needle = query.trim().toLowerCase();
    for (const event of items) {
        if (event.status === 'cancelled') continue;
        const summary = event.summary?.trim() ?? '';
        if (!summary.toLowerCase().includes(needle)) continue;
        const start = event.start?.dateTime ?? event.start?.date;
        if (!start) continue;
        const allDay = !event.start?.dateTime;
        let durationMinutes: number | null = null;
        if (event.start?.dateTime && event.end?.dateTime) {
            const ms = Date.parse(event.end.dateTime) - Date.parse(event.start.dateTime);
            if (Number.isFinite(ms) && ms > 0) durationMinutes = Math.round(ms / 60_000);
        }
        return { summary, start, all_day: allDay, duration_minutes: durationMinutes };
    }
    return null;
}

/**
 * Next upcoming event on the connected account's primary calendar whose title
 * contains `query`. Returns { connected: false } when no OAuth connection
 * exists (a service-account-only setup counts as not connected here).
 */
export async function findNextCalendarEvent(
    query: string
): Promise<{ connected: boolean; event: NextCalendarEvent | null }> {
    const oauthToken = await getOAuthAccessToken();
    if (!oauthToken) return { connected: false, event: null };

    const params = new URLSearchParams({
        q: query,
        timeMin: new Date().toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '10',
        fields: 'items(id,summary,status,start,end)',
    });
    // googleFetch prefers the OAuth token whenever one exists (checked above),
    // and brings the shared retry/backoff behaviour.
    const data = (await googleFetch(`${CALENDAR_API}/calendars/primary/events?${params}`)) as {
        items?: CalendarEvent[];
    };
    return { connected: true, event: pickNextMatchingEvent(data.items ?? [], query) };
}
