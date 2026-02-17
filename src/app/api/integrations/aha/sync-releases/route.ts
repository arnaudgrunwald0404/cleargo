import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReleases, getReleaseEpics } from '@/lib/aha/client';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check permissions
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

        // Parse request body to get start_date filter
        const body = await req.json().catch(() => ({}));
        const startDate = body.start_date || null;

        console.log('🔄 Starting release sync from Aha API...');
        if (startDate) {
            console.log(`📅 Filtering releases with launch dates >= ${startDate}`);
        }

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

        // Helper function to extract "Releases date (external)" from custom_fields
        const getExternalReleaseDate = (release: any): string | null => {
            if (!release.custom_fields) return null;
            
            let externalDateValue: string | null = null;
            
            // Handle array format (Aha API typically returns custom_fields as array)
            if (Array.isArray(release.custom_fields)) {
                // Look for "Releases date (external)" field
                const externalDateField = release.custom_fields.find((cf: any) => {
                    const key = cf.key?.toLowerCase() || '';
                    const name = cf.name?.toLowerCase() || '';
                    return (key.includes('releases date (external)') || 
                            name.includes('releases date (external)') ||
                            key.includes('release date (external)') ||
                            name.includes('release date (external)'));
                });
                
                if (externalDateField && externalDateField.value) {
                    externalDateValue = externalDateField.value;
                }
            } else if (typeof release.custom_fields === 'object') {
                // Handle object format
                for (const [key, value] of Object.entries(release.custom_fields)) {
                    const field = value as any;
                    const fieldKey = key.toLowerCase();
                    const fieldName = (field?.name || '').toLowerCase();
                    
                    if ((fieldKey.includes('releases date (external)') || 
                         fieldName.includes('releases date (external)') ||
                         fieldKey.includes('release date (external)') ||
                         fieldName.includes('release date (external)')) && field?.value) {
                        externalDateValue = field.value;
                        break;
                    }
                }
            }
            
            return externalDateValue;
        };

        // Filter releases that contain epics
        const releasesWithEpics: Array<{ id: string; name: string; start_date?: string; end_date?: string; external_date?: string | null }> = [];
        
        for (const release of allReleases) {
            try {
                // Check if release has epics (just check first page to see if any exist)
                const epicsResponse = await getReleaseEpics(release.id, { per_page: 1, page: 1 });
                const epics = epicsResponse.epics || [];
                
                if (epics.length > 0) {
                    const externalDate = getExternalReleaseDate(release);
                    releasesWithEpics.push({
                        id: release.id,
                        name: release.name,
                        start_date: release.start_date,
                        end_date: release.end_date,
                        external_date: externalDate,
                    });
                    
                    if (externalDate) {
                        console.log(`📅 Release "${release.name}": Found external date: ${externalDate}`);
                    }
                }
            } catch (error) {
                console.warn(`Failed to check epics for release ${release.name}:`, error);
                // Continue with other releases
            }
        }

        console.log(`✅ Found ${releasesWithEpics.length} releases with epics`);

        // Upsert ALL releases with epics into release_schedule table (including those without dates)
        let synced = 0;
        let errors = 0;
        const releasesWithoutDates: Array<{ name: string; id: string }> = [];

        // Filter releases by start_date if provided
        let releasesToSync = releasesWithEpics;
        if (startDate) {
            const startDateObj = new Date(startDate);
            startDateObj.setHours(0, 0, 0, 0);
            
            releasesToSync = releasesWithEpics.filter((release) => {
                // Priority: external_date > end_date > start_date
                const launchDate = release.external_date || release.end_date || release.start_date || null;
                
                // Include releases without dates (they can still be synced)
                if (!launchDate) {
                    return true;
                }
                
                // Parse and compare dates
                try {
                    const releaseDateObj = new Date(launchDate);
                    releaseDateObj.setHours(0, 0, 0, 0);
                    return releaseDateObj >= startDateObj;
                } catch (error) {
                    console.warn(`⚠️ Invalid date format for release "${release.name}": ${launchDate}`);
                    return true; // Include releases with invalid dates
                }
            });
            
            console.log(`📅 Filtered to ${releasesToSync.length} releases with launch dates >= ${startDate} (from ${releasesWithEpics.length} total)`);
        }

        for (const release of releasesToSync) {
            try {
                // Priority: Use "Releases date (external)" if available, otherwise end_date, otherwise start_date, otherwise null
                const launchDate = release.external_date || release.end_date || release.start_date || null;
                
                if (release.external_date) {
                    console.log(`✅ Using external date for "${release.name}": ${release.external_date}`);
                } else if (release.end_date) {
                    console.log(`📅 Using end_date for "${release.name}": ${release.end_date}`);
                } else if (release.start_date) {
                    console.log(`📅 Using start_date for "${release.name}": ${release.start_date}`);
                }

                // Track releases without dates
                if (!launchDate) {
                    releasesWithoutDates.push({
                        name: release.name,
                        id: release.id,
                    });
                    console.warn(`⚠️ Release "${release.name}" has no date in Aha`);
                }

                const { error } = await supabase
                    .from('release_schedule')
                    .upsert(
                        {
                            release_name: release.name,
                            launch_date: launchDate,
                            updated_at: new Date().toISOString(),
                        },
                        {
                            onConflict: 'release_name',
                        }
                    );

                if (error) {
                    console.error(`Error syncing release ${release.name}:`, error);
                    errors++;
                } else {
                    synced++;
                }
            } catch (error) {
                console.error(`Error processing release ${release.name}:`, error);
                errors++;
            }
        }

        const withoutDatesCount = releasesWithoutDates.length;
        const message = withoutDatesCount > 0
            ? `Synced ${synced} releases (${withoutDatesCount} without dates, ${errors} errors)`
            : `Synced ${synced} releases (${errors} errors)`;

        return NextResponse.json({
            success: true,
            message,
            total_releases: allReleases.length,
            releases_with_epics: releasesWithEpics.length,
            synced,
            releases_without_dates: releasesWithoutDates,
            errors,
        });
    } catch (error: any) {
        console.error('Error syncing releases:', error);
        return NextResponse.json(
            { error: 'Failed to sync releases', details: error.message },
            { status: 500 }
        );
    }
}

