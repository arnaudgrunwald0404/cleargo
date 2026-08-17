/**
 * Business-calendar gate for scheduled notification jobs.
 *
 * Jobs call `getNotificationCalendarSkip()` right after their cron-auth check and
 * return the payload as-is when it is non-null: no Slack DMs, emails, or digests go
 * out on weekends or US holidays (see `@/lib/business-calendar`).
 *
 * Escape hatches for testing or a deliberate off-hours send:
 *   - `?force=true` on the job URL
 *   - `NOTIFICATIONS_IGNORE_BUSINESS_CALENDAR=true`
 */

import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCalendarDateStringInTimeZone } from '@/lib/date-utils';
import { evaluateNotificationCalendar, type NotificationCadence } from '@/lib/business-calendar';
import { getSettings } from '@/lib/settings-db';
import { defaults } from '@/lib/settings';
import { createAdminClient } from '@/lib/supabase/server';

export type NotificationCalendarSkip = {
    success: true;
    skipped: true;
    reason: string;
    date: string;
    time_zone: string;
    timestamp: string;
};

type Options = {
    /** `weekly` jobs only send on the week's first business day (holiday Monday → Tuesday). */
    cadence?: NotificationCadence;
    /** Skip the gate entirely (e.g. an explicit test send). */
    force?: boolean;
    /** Reuse an existing Supabase client for the settings lookup. */
    client?: SupabaseClient;
};

async function resolveOrgTimeZone(client?: SupabaseClient): Promise<string> {
    try {
        // Cron requests have no user session, so read settings with the admin client.
        const settings = await getSettings(client ?? createAdminClient());
        return settings.timezone || defaults.timezone;
    } catch (error) {
        console.warn('[notification-calendar] Falling back to default timezone:', error);
        return defaults.timezone;
    }
}

/**
 * Returns a skip payload when today is not a valid send day, or null to proceed.
 */
export async function getNotificationCalendarSkip(
    request: NextRequest,
    options: Options = {}
): Promise<NotificationCalendarSkip | null> {
    const forceParam = request.nextUrl.searchParams.get('force');
    const forced =
        options.force === true ||
        forceParam === 'true' ||
        forceParam === '1' ||
        process.env.NOTIFICATIONS_IGNORE_BUSINESS_CALENDAR === 'true';
    if (forced) return null;

    const timeZone = await resolveOrgTimeZone(options.client);
    const todayYmd = getCalendarDateStringInTimeZone(timeZone);
    const decision = evaluateNotificationCalendar(todayYmd, options.cadence ?? 'daily');
    if (decision.send) return null;

    console.log(`[notification-calendar] Skipping send on ${todayYmd} (${timeZone}): ${decision.reason}`);

    return {
        success: true,
        skipped: true,
        reason: decision.reason,
        date: todayYmd,
        time_zone: timeZone,
        timestamp: new Date().toISOString(),
    };
}
