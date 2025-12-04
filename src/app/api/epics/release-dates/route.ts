import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    try {
        const supabase = createClient();
        
        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
            // Fetch all synchronized epics (those with aha_id) and their AHA fields
            const { data, error } = await supabase
                .from("epic")
                .select("aha_fields, target_launch_date")
                .not("aha_id", "is", null);

        if (error) {
            console.error("Error fetching epics:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Extract unique release names from both:
        // 1. Standard release field (stored as aha_release_name in custom fields)
        // 2. Custom field "release_target_after_pod_planning"
        const releaseNames = new Set<string>();
        const releaseDateMap = new Map<string, string>(); // Map release name to launch date

        console.log(`Processing ${data?.length || 0} synchronized epics for release names`);

        (data || []).forEach((epic) => {
            if (epic.aha_fields && typeof epic.aha_fields === 'object') {
                const fields = epic.aha_fields as any;
                
                // Check standard fields (new structure)
                if (fields.standard_fields && typeof fields.standard_fields === 'object') {
                    const standardFields = fields.standard_fields;
                    
                    // Check standard release field (aha_release_name or release.name) - use full name, no parsing
                    const standardReleaseName = standardFields?.aha_release_name || 
                                                standardFields?.release?.name || null;
                    if (standardReleaseName && typeof standardReleaseName === 'string' && standardReleaseName.trim()) {
                        releaseNames.add(standardReleaseName.trim());
                        if (!releaseDateMap.has(standardReleaseName.trim()) && epic.target_launch_date) {
                            releaseDateMap.set(standardReleaseName.trim(), epic.target_launch_date);
                        }
                    }
                }
                
                // Check custom fields
                if (fields.custom_fields && typeof fields.custom_fields === 'object') {
                    const customFields = fields.custom_fields;
                    
                    // Check custom field "release_target_after_pod_planning"
                    const customReleaseName = customFields?.release_target_after_pod_planning;
                    if (customReleaseName && typeof customReleaseName === 'string' && customReleaseName.trim()) {
                        releaseNames.add(customReleaseName.trim());
                        if (!releaseDateMap.has(customReleaseName.trim()) && epic.target_launch_date) {
                            releaseDateMap.set(customReleaseName.trim(), epic.target_launch_date);
                        }
                    }
                }
                
                // Legacy support: check if fields are at root level (old structure)
                if (!fields.standard_fields && !fields.custom_fields) {
                    // Check standard release field (aha_release_name)
                    const standardReleaseName = fields?.aha_release_name;
                    if (standardReleaseName && typeof standardReleaseName === 'string' && standardReleaseName.trim()) {
                        releaseNames.add(standardReleaseName.trim());
                        if (!releaseDateMap.has(standardReleaseName.trim()) && epic.target_launch_date) {
                            releaseDateMap.set(standardReleaseName.trim(), epic.target_launch_date);
                        }
                    }
                    
                    // Check custom field "release_target_after_pod_planning"
                    const customReleaseName = fields?.release_target_after_pod_planning;
                    if (customReleaseName && typeof customReleaseName === 'string' && customReleaseName.trim()) {
                        releaseNames.add(customReleaseName.trim());
                        if (!releaseDateMap.has(customReleaseName.trim()) && epic.target_launch_date) {
                            releaseDateMap.set(customReleaseName.trim(), epic.target_launch_date);
                        }
                    }
                }
            }
        });

        console.log(`Found ${releaseNames.size} unique release names:`, Array.from(releaseNames));

        // Convert to sorted array and include dates
        const releaseData = Array.from(releaseNames)
            .sort()
            .map((releaseName) => ({
                releaseName,
                launchDate: releaseDateMap.get(releaseName) || null,
            }));

        return NextResponse.json({ releases: releaseData });
    } catch (error: any) {
        console.error("Error in GET /api/epics/release-dates:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

