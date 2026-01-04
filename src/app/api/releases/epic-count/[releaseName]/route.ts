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

        try {
            const client = getAhaClient();
            
            // Fetch all releases to find the one matching the name
            const releasesResponse = await client.getReleases({ per_page: 200 });
            const releases = Array.isArray(releasesResponse) 
                ? releasesResponse 
                : releasesResponse?.releases || [];
            
            const matchingRelease = releases.find((r: any) => r.name === releaseName);
            
            // Count epics in ClearGO for this release (even if not found in Aha)
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
            
            if (!matchingRelease) {
                return NextResponse.json({ 
                    ahaCount: null,
                    cleargoCount: cleargoEpicCount,
                    error: "Release not found in Aha" 
                });
            }

            // Fetch epics for this release (paginated to get total count)
            let totalCount = 0;
            let page = 1;
            let hasMore = true;
            const perPage = 200;

            while (hasMore) {
                try {
                    const epicsResponse = await client.getReleaseEpics(matchingRelease.id, { 
                        per_page: perPage, 
                        page 
                    });
                    
                    const epics = Array.isArray(epicsResponse)
                        ? epicsResponse
                        : epicsResponse?.epics || [];
                    
                    totalCount += epics.length;
                    hasMore = epics.length === perPage;
                    page++;
                } catch (error) {
                    console.error(`Error fetching epics page ${page} for release ${releaseName}:`, error);
                    hasMore = false;
                }
            }


            return NextResponse.json({ 
                ahaCount: totalCount,
                cleargoCount: cleargoEpicCount,
                releaseName 
            });
        } catch (ahaError: any) {
            console.error(`Error fetching Aha epic count for release ${releaseName}:`, ahaError);
            // Still try to get ClearGO count even if Aha fails
            let cleargoEpicCount = 0;
            try {
                const { data: allEpics } = await supabase
                    .from('epic')
                    .select('aha_fields');
                
                if (allEpics) {
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
            } catch (dbError) {
                console.error('Error counting ClearGO epics:', dbError);
            }
            
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

