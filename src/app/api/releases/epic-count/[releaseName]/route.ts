import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getAhaClient } from "@/lib/aha/client";

export const dynamic = 'force-dynamic';

export async function GET(
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
                // Cache null count to avoid repeated lookups for non-existent releases
                const now = new Date().toISOString();
                await supabase
                    .from('release_schedule')
                    .upsert(
                        {
                            release_name: releaseName,
                            aha_epic_count: null,
                            aha_epic_count_updated_at: now,
                            updated_at: now,
                        },
                        {
                            onConflict: 'release_name',
                        }
                    );
                
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
            const now = new Date().toISOString();
            const { error: updateError } = await supabase
                .from('release_schedule')
                .upsert(
                    {
                        release_name: releaseName,
                        aha_epic_count: totalCount,
                        aha_epic_count_updated_at: now,
                        updated_at: now,
                    },
                    {
                        onConflict: 'release_name',
                    }
                );

            if (updateError) {
                console.error(`Error caching AHA epic count for release ${releaseName}:`, updateError);
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

