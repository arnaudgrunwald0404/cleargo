import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getReleases } from '@/lib/aha/client';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { toDateOnlyString } from '@/lib/date-utils';
import { cascadeReleaseDateToEpics } from '@/lib/db/epics';
import { upsertReleaseScheduleRow } from '@/lib/release-schedule';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Encode one NDJSON line */
function ndjson(obj: object): Uint8Array {
    return new TextEncoder().encode(JSON.stringify(obj) + '\n');
}

export async function POST(req: NextRequest) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: me } = await supabase
        .from('app_user')
        .select('roles')
        .eq('email', user.email)
        .single();

    const rules = await getEffectivePermissionRules();
    const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releases.manage', rules);
    if (!ok) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const startDate: string | null = body.start_date || null;

    const adminClient = createAdminClient();

    const stream = new ReadableStream({
        async start(controller) {
            try {
                controller.enqueue(ndjson({ progress: 0, total: 0, message: 'Fetching releases from Aha…' }));

                // Fetch all releases from Aha (paginated)
                let allReleases: any[] = [];
                let page = 1;
                const perPage = 50;
                let hasMore = true;

                while (hasMore) {
                    const response = await getReleases({ per_page: perPage, page });
                    const releases = response.releases || [];
                    allReleases = allReleases.concat(releases);
                    hasMore = releases.length === perPage;
                    page++;
                }

                console.log(`📦 Found ${allReleases.length} total releases in Aha`);
                controller.enqueue(ndjson({ progress: 0, total: allReleases.length, message: `Found ${allReleases.length} releases` }));

                // Helper: extract the best available launch date from a release object
                const getExternalReleaseDate = (release: any): string | null => {
                    const standardFields = [
                        'releases_date_external', 'release_date_external', 'external_release_date',
                        'releases_date_internal', 'release_date_internal', 'internal_release_date',
                    ];
                    for (const f of standardFields) {
                        if (release[f]) return release[f];
                    }
                    if (!release.custom_fields) return null;

                    const isDateField = (key: string, name: string) => {
                        const t = `${key} ${name}`.toLowerCase();
                        return (t.includes('external') || t.includes('internal')) &&
                               (t.includes('release') || t.includes('date'));
                    };

                    if (Array.isArray(release.custom_fields)) {
                        const cf = release.custom_fields.find((f: any) =>
                            isDateField(f.key || '', f.name || '')
                        );
                        return cf?.value ?? null;
                    }
                    if (typeof release.custom_fields === 'object') {
                        for (const [k, v] of Object.entries(release.custom_fields)) {
                            const field = v as any;
                            if (isDateField(k, field?.name || '') && field?.value) return field.value;
                        }
                    }
                    return null;
                };

                // Filter by start_date when provided
                let releasesToSync = allReleases;
                if (startDate) {
                    const cutoff = new Date(startDate);
                    cutoff.setHours(0, 0, 0, 0);
                    releasesToSync = allReleases.filter((r) => {
                        const launchDate = getExternalReleaseDate(r) || r.end_date || r.start_date || null;
                        if (!launchDate) return true; // Include undated releases
                        try {
                            const d = new Date(launchDate);
                            d.setHours(0, 0, 0, 0);
                            return d >= cutoff;
                        } catch {
                            return true;
                        }
                    });
                    console.log(`📅 Filtered to ${releasesToSync.length} releases (start_date >= ${startDate})`);
                }

                let synced = 0;
                let errors = 0;
                const releasesWithoutDates: Array<{ name: string; id: string }> = [];

                for (let i = 0; i < releasesToSync.length; i++) {
                    const release = releasesToSync[i];
                    try {
                        const externalDate = getExternalReleaseDate(release);
                        const launchDate = externalDate || release.end_date || release.start_date || null;

                        if (!launchDate) {
                            releasesWithoutDates.push({ name: release.name, id: release.id });
                            console.warn(`⚠️ Release "${release.name}" has no date in Aha`);
                        }

                        const normalizedLaunchDate = toDateOnlyString(launchDate) ?? launchDate;
                        let cohort2Date: string | null = null;
                        if (release.cohort2_date) {
                            cohort2Date = toDateOnlyString(release.cohort2_date) ?? release.cohort2_date;
                        } else if (Array.isArray(release.release_phases)) {
                            const cohort2Phase = release.release_phases.find((p: { name?: string }) => {
                                const n = (p.name || '').toLowerCase();
                                return n.includes('cohort 2') || n.includes('ga cohort');
                            });
                            const raw = cohort2Phase?.end_on || cohort2Phase?.start_on;
                            if (raw) cohort2Date = toDateOnlyString(raw) ?? raw;
                        }

                        const { error } = await upsertReleaseScheduleRow(adminClient, {
                            release_name: release.name,
                            launch_date: normalizedLaunchDate,
                            ...(cohort2Date ? { cohort2_date: cohort2Date } : {}),
                        });

                        if (error) {
                            console.error(`Error syncing release ${release.name}:`, error);
                            errors++;
                        } else {
                            synced++;
                            if (normalizedLaunchDate) {
                                try { await cascadeReleaseDateToEpics(release.name, normalizedLaunchDate); } catch {}
                            }
                        }
                    } catch (err: any) {
                        console.error(`Error processing release ${release.name}:`, err);
                        errors++;
                    }

                    // Send progress every 5 releases to keep connection alive
                    if ((i + 1) % 5 === 0 || i === releasesToSync.length - 1) {
                        controller.enqueue(ndjson({
                            progress: i + 1,
                            total: releasesToSync.length,
                            message: `Synced ${synced} / ${releasesToSync.length} releases…`,
                        }));
                    }
                }

                const withoutDatesCount = releasesWithoutDates.length;
                const message = withoutDatesCount > 0
                    ? `Synced ${synced} releases (${withoutDatesCount} without dates, ${errors} errors)`
                    : `Synced ${synced} releases (${errors} errors)`;

                console.log(`✅ ${message}`);

                controller.enqueue(ndjson({
                    done: true,
                    success: true,
                    message,
                    total_releases: allReleases.length,
                    releases_with_epics: releasesToSync.length,
                    synced,
                    releases_without_dates: releasesWithoutDates,
                    errors,
                }));
            } catch (err: any) {
                console.error('Error syncing releases:', err);
                controller.enqueue(ndjson({ error: err.message || 'Failed to sync releases' }));
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson',
            'Transfer-Encoding': 'chunked',
            'X-Accel-Buffering': 'no', // Disable Nginx buffering
            'Cache-Control': 'no-cache',
        },
    });
}
