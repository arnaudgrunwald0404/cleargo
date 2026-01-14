import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getAhaClient } from "@/lib/aha/client";
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';

export const dynamic = 'force-dynamic';

async function getHandler(
    req: NextRequest,
    { params }: { params: Promise<{ releaseName: string }> }
) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { releaseName: releaseNameParam } = await params;
        const releaseName = decodeURIComponent(releaseNameParam);
        
        if (!releaseName) {
            return NextResponse.json({ error: "Release name is required" }, { status: 400 });
        }

        // Count epics in ClearGO for this release (always calculate this)
        const { data: allEpics, error: countError } = await supabase
            .from('epic')
            .select('aha_fields');

        let cleargoEpicCount = 0;
        if (!countError && allEpics) {
            cleargoEpicCount = allEpics.filter((epic) => {
                if (!epic.aha_fields || typeof epic.aha_fields !== 'object') return false;
                const fields = epic.aha_fields as any;
                
                if (fields.standard_fields && typeof fields.standard_fields === 'object') {
                    const standardFields = fields.standard_fields;
                    const epicReleaseName = standardFields?.aha_release_name ||
                        standardFields?.release?.name || null;
                    if (epicReleaseName && typeof epicReleaseName === 'string' && 
                        epicReleaseName.trim() === releaseName.trim()) {
                        return true;
                    }
                }
                
                if (fields.custom_fields && typeof fields.custom_fields === 'object') {
                    const customFields = fields.custom_fields;
                    const epicReleaseName = customFields?.release_target_after_pod_planning;
                    if (epicReleaseName && typeof epicReleaseName === 'string' && 
                        epicReleaseName.trim() === releaseName.trim()) {
                        return true;
                    }
                }
                
                return false;
            }).length;
        }

        // Check for cached count in database first
        const { data: cachedRelease, error: cacheError } = await supabase
            .from('release_schedule')
            .select('aha_epic_count, aha_epic_count_updated_at')
            .eq('release_name', releaseName)
            .single();

        // If we have a cached count, return it (caching is preferred, can add refresh param later if needed)
        if (!cacheError && cachedRelease && cachedRelease.aha_epic_count !== null) {
            return NextResponse.json({ 
                ahaCount: cachedRelease.aha_epic_count,
                cleargoCount: cleargoEpicCount,
                releaseName,
                cached: true,
                cachedAt: cachedRelease.aha_epic_count_updated_at
            });
        }

        try {
            const client = getAhaClient();
            
            // Fetch all releases to find the one matching the name (paginated)
            let allReleases: any[] = [];
            let releasesPage = 1;
            let hasMoreReleases = true;
            const perPage = 200;
            
            while (hasMoreReleases) {
                try {
                    const releasesResponse = await client.getReleases({ per_page: perPage, page: releasesPage });
                    const releases = Array.isArray(releasesResponse) 
                        ? releasesResponse 
                        : releasesResponse?.releases || [];
                    
                    allReleases = allReleases.concat(releases);
                    hasMoreReleases = releases.length === perPage;
                    releasesPage++;
                } catch (error) {
                    console.error(`Error fetching releases page ${releasesPage}:`, error);
                    hasMoreReleases = false;
                }
            }
            
            const releases = allReleases;
            
            // Normalize release name for matching (trim and lowercase)
            const normalizedReleaseName = releaseName.trim().toLowerCase();
            
            // Try to find matching release with multiple strategies
            let matchingRelease = releases.find((r: any) => {
                if (!r.name) return false;
                // Exact match
                if (r.name === releaseName) return true;
                // Case-insensitive match
                if (r.name.trim().toLowerCase() === normalizedReleaseName) return true;
                return false;
            });
            
            // Log available releases for debugging if not found
            if (!matchingRelease) {
                console.log(`[AHA Epic Count] Release "${releaseName}" not found. Available releases:`, 
                    releases.slice(0, 10).map((r: any) => r.name).join(', '),
                    releases.length > 10 ? `... (${releases.length} total)` : ''
                );
            }
            
            if (!matchingRelease) {
                // Try to cache null count, but only if release already exists in release_schedule
                // (to avoid violating launch_date NOT NULL constraint)
                const now = new Date().toISOString();
                const { error: nullUpdateError } = await supabase
                    .from('release_schedule')
                    .update({
                        aha_epic_count: null,
                        aha_epic_count_updated_at: now,
                        updated_at: now,
                    })
                    .eq('release_name', releaseName);
                
                if (nullUpdateError) {
                    // Release doesn't exist in release_schedule, can't cache without launch_date
                    console.warn(`Could not cache null count for release ${releaseName} (release not in release_schedule):`, nullUpdateError.message);
                }
                
                return NextResponse.json({ 
                    ahaCount: null,
                    cleargoCount: cleargoEpicCount,
                    error: "Release not found in Aha" 
                });
            }

            // Fetch epics for this release (paginated to get total count)
            let totalCount = 0;
            let epicsPage = 1;
            let hasMoreEpics = true;
            const epicsPerPage = 200;

            while (hasMoreEpics) {
                try {
                    const epicsResponse = await client.getReleaseEpics(matchingRelease.id, { 
                        per_page: epicsPerPage, 
                        page: epicsPage 
                    });
                    
                    const epics = Array.isArray(epicsResponse)
                        ? epicsResponse
                        : epicsResponse?.epics || [];
                    
                    totalCount += epics.length;
                    hasMoreEpics = epics.length === epicsPerPage;
                    epicsPage++;
                } catch (error) {
                    console.error(`Error fetching epics page ${epicsPage} for release ${releaseName}:`, error);
                    hasMoreEpics = false;
                }
            }

            // Cache the count in the database
            // Only update if the release already exists (to avoid violating launch_date NOT NULL constraint)
            const now = new Date().toISOString();
            const { error: updateError } = await supabase
                .from('release_schedule')
                .update({
                    aha_epic_count: totalCount,
                    aha_epic_count_updated_at: now,
                    updated_at: now,
                })
                .eq('release_name', releaseName);

            if (updateError) {
                // If update failed, check if it's because the release doesn't exist
                // In that case, we can't cache without a launch_date, so just log and continue
                console.warn(`Could not cache AHA epic count for release ${releaseName} (release may not exist in release_schedule table):`, updateError.message);
                // Continue anyway - we still return the count
            }

            return NextResponse.json({ 
                ahaCount: totalCount,
                cleargoCount: cleargoEpicCount,
                releaseName,
                cached: false
            });
        } catch (ahaError: any) {
            console.error(`Error fetching Aha epic count for release ${releaseName}:`, ahaError);
            // cleargoEpicCount is already calculated above
            
            return NextResponse.json({ 
                ahaCount: null,
                cleargoCount: cleargoEpicCount,
                error: ahaError.message || "Failed to fetch from Aha" 
            });
        }
    } catch (error: any) {
        console.error('Error in release epic count endpoint:', error);
        return NextResponse.json(
            { error: 'Failed to fetch epic count', details: error.message },
            { status: 500 }
        );
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.heavy);

