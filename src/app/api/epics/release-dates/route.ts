import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getReleases } from "@/lib/aha/client";

// In-memory cache for Aha releases (5 minute TTL)
let ahaReleasesCache: { releases: any[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
    try {
        const supabase = createClient();
        
        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        // First, check database for releases that already have dates
        const { data: releasesInDb, error: releasesError } = await supabase
            .from("release_schedule")
            .select("release_name, launch_date")
            .not("launch_date", "is", null);

        const dbReleaseDateMap = new Map<string, string>();
        releasesInDb?.forEach(release => {
            if (release.release_name && release.launch_date) {
                dbReleaseDateMap.set(release.release_name, release.launch_date);
            }
        });

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

        // Merge database dates into releaseDateMap
        dbReleaseDateMap.forEach((date, name) => {
            if (!releaseDateMap.has(name)) {
                releaseDateMap.set(name, date);
            }
        });

        // For releases without dates, fetch from Aha's releases API
        const releasesNeedingDates = Array.from(releaseNames).filter(name => !releaseDateMap.has(name));
        
        if (releasesNeedingDates.length > 0) {
            console.log(`Fetching ${releasesNeedingDates.length} release dates from Aha API...`);
            console.log(`Releases needing dates:`, releasesNeedingDates);
            try {
                // Check cache first
                let allReleases: any[] = [];
                const now = Date.now();
                
                if (ahaReleasesCache && (now - ahaReleasesCache.timestamp) < CACHE_TTL_MS) {
                    console.log(`Using cached Aha releases (${Math.round((now - ahaReleasesCache.timestamp) / 1000)}s old)`);
                    allReleases = ahaReleasesCache.releases;
                } else {
                    // Fetch all releases from Aha (paginated)
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

                    // Update cache
                    ahaReleasesCache = { releases: allReleases, timestamp: now };
                    console.log(`Cached ${allReleases.length} Aha releases`);
                }

                console.log(`Fetched ${allReleases.length} releases from Aha`);
                console.log(`Sample Aha release names:`, allReleases.slice(0, 10).map((r: any) => r.name));
                
                // Log custom_fields structure for debugging
                const releaseWithCustomFields = allReleases.find((r: any) => r.custom_fields);
                if (releaseWithCustomFields) {
                    console.log(`Sample release custom_fields structure:`, {
                        releaseName: releaseWithCustomFields.name,
                        customFieldsType: Array.isArray(releaseWithCustomFields.custom_fields) ? 'array' : typeof releaseWithCustomFields.custom_fields,
                        customFields: releaseWithCustomFields.custom_fields
                    });
                }

                // Match release names and extract dates (case-insensitive matching)
                releasesNeedingDates.forEach(releaseName => {
                    console.log(`\n🔍 Searching for release: "${releaseName}"`);
                    // Try exact match first
                    let matchedRelease = allReleases.find((r: any) => r.name === releaseName);
                    
                    // If no exact match, try case-insensitive match
                    if (!matchedRelease) {
                        matchedRelease = allReleases.find((r: any) => 
                            r.name && r.name.toLowerCase() === releaseName.toLowerCase()
                        );
                    }
                    
                    // If still no match, try partial matching (in case of extra spaces or formatting)
                    if (!matchedRelease) {
                        const normalizedSearch = releaseName.toLowerCase().trim();
                        matchedRelease = allReleases.find((r: any) => 
                            r.name && r.name.toLowerCase().trim() === normalizedSearch
                        );
                    }
                    
                    // If still no match, try contains matching (for cases like "Release 2025.11" vs "2025.11")
                    if (!matchedRelease) {
                        const searchParts = releaseName.toLowerCase().split(/\s+/);
                        matchedRelease = allReleases.find((r: any) => {
                            if (!r.name) return false;
                            const releaseParts = r.name.toLowerCase().split(/\s+/);
                            // Check if all search parts are in release name
                            return searchParts.every(part => releaseParts.some((rp: string) => rp.includes(part) || part.includes(rp)));
                        });
                    }
                    
                    if (matchedRelease) {
                        // Try to get release date from standard fields first, then custom fields
                        let launchDate: string | null = null;
                        
                        // Check standard fields for "Releases date (internal)" - this is a standard field
                        // Common field names: releases_date_internal, release_date_internal, internal_release_date, etc.
                        const standardDateFields = [
                            'releases_date_internal',
                            'release_date_internal', 
                            'internal_release_date',
                            'releases_date_external',
                            'release_date_external',
                            'external_release_date'
                        ];
                        
                        for (const fieldName of standardDateFields) {
                            if (matchedRelease[fieldName]) {
                                launchDate = matchedRelease[fieldName];
                                console.log(`  ✅ Found release date in standard field "${fieldName}": ${launchDate}`);
                                break;
                            }
                        }
                        
                        // If not found in standard fields, check custom_fields for external release date
                        if (!launchDate && matchedRelease.custom_fields) {
                            console.log(`  📋 Custom fields found for "${matchedRelease.name}":`, {
                                type: Array.isArray(matchedRelease.custom_fields) ? 'array' : typeof matchedRelease.custom_fields,
                                count: Array.isArray(matchedRelease.custom_fields) 
                                    ? matchedRelease.custom_fields.length 
                                    : Object.keys(matchedRelease.custom_fields).length,
                                fields: Array.isArray(matchedRelease.custom_fields)
                                    ? matchedRelease.custom_fields.map((cf: any) => ({ key: cf.key, name: cf.name, value: cf.value }))
                                    : Object.entries(matchedRelease.custom_fields).map(([k, v]: [string, any]) => ({ key: k, name: v?.name, value: v?.value }))
                            });
                            
                            let externalDateValue: string | null = null;
                            
                            // Helper function to check if a field matches release date fields (internal or external)
                            const isReleaseDateField = (key: string | null | undefined, name: string | null | undefined): boolean => {
                                if (!key && !name) return false;
                                const searchText = `${key || ''} ${name || ''}`.toLowerCase();
                                return (searchText.includes('external') || searchText.includes('internal')) && 
                                       (searchText.includes('release') || searchText.includes('date'));
                            };
                            
                            // Handle array format (Aha API typically returns custom_fields as array)
                            if (Array.isArray(matchedRelease.custom_fields)) {
                                // First, try exact match for "Releases date (external)" or "Releases date (internal)"
                                let externalDateField = matchedRelease.custom_fields.find((cf: any) => {
                                    const key = cf.key?.toLowerCase() || '';
                                    const name = cf.name?.toLowerCase() || '';
                                    return (key.includes('releases date (external)') || 
                                            name.includes('releases date (external)') ||
                                            key.includes('release date (external)') ||
                                            name.includes('release date (external)') ||
                                            key.includes('releases date (internal)') ||
                                            name.includes('releases date (internal)') ||
                                            key.includes('release date (internal)') ||
                                            name.includes('release date (internal)'));
                                });
                                
                                // If no exact match, try fuzzy match
                                if (!externalDateField) {
                                    externalDateField = matchedRelease.custom_fields.find((cf: any) => 
                                        isReleaseDateField(cf.key, cf.name)
                                    );
                                }
                                
                                if (externalDateField && externalDateField.value) {
                                    externalDateValue = externalDateField.value;
                                    console.log(`  ✅ Found external release date in custom field "${externalDateField.name || externalDateField.key}": ${externalDateValue}`);
                                } else {
                                    console.log(`  ⚠️ No external release date field found in custom_fields`);
                                }
                            } 
                            // Handle object format
                            else if (typeof matchedRelease.custom_fields === 'object') {
                                // Look for keys that might contain release date (internal or external)
                                for (const [key, value] of Object.entries(matchedRelease.custom_fields)) {
                                    const field = value as any;
                                    if (isReleaseDateField(key, field?.name)) {
                                        const fieldValue = field?.value || field;
                                        if (fieldValue) {
                                            externalDateValue = String(fieldValue);
                                            console.log(`  ✅ Found release date in custom field "${key}" (${field?.name || 'no name'}): ${externalDateValue}`);
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            if (externalDateValue) {
                                launchDate = externalDateValue;
                            }
                        } else {
                            console.log(`  ⚠️ No custom_fields found for "${matchedRelease.name}"`);
                        }
                        
                        // Fall back to end_date, then start_date
                        if (!launchDate) {
                            launchDate = matchedRelease.end_date || matchedRelease.start_date || null;
                            if (launchDate) {
                                console.log(`  📅 Using fallback date (end_date/start_date): ${launchDate}`);
                            }
                        }
                        
                        // Log all available standard fields for debugging
                        if (!launchDate) {
                            console.log(`  🔍 Available standard fields on release:`, Object.keys(matchedRelease).filter(k => 
                                k.includes('date') || k.includes('release') || k.includes('internal') || k.includes('external')
                            ));
                        }
                        
                        if (launchDate) {
                            // Use the exact name from Aha (not the search term) to ensure consistency
                            releaseDateMap.set(matchedRelease.name, launchDate);
                            console.log(`✅ Found date for "${releaseName}" (matched as "${matchedRelease.name}"): ${launchDate}`);
                        } else {
                            console.warn(`⚠️ Release "${releaseName}" found in Aha (as "${matchedRelease.name}") but has no date`);
                            // Log available fields for debugging
                            const customFieldsList = Array.isArray(matchedRelease.custom_fields)
                                ? matchedRelease.custom_fields.map((cf: any) => ({
                                    key: cf.key,
                                    name: cf.name,
                                    value: cf.value,
                                    valueType: typeof cf.value
                                }))
                                : matchedRelease.custom_fields 
                                    ? Object.entries(matchedRelease.custom_fields).map(([k, v]: [string, any]) => ({
                                        key: k,
                                        name: v?.name,
                                        value: v?.value,
                                        valueType: typeof v?.value
                                    }))
                                    : [];
                            
                            console.log(`   Available fields:`, {
                                start_date: matchedRelease.start_date,
                                end_date: matchedRelease.end_date,
                                custom_fields_count: Array.isArray(matchedRelease.custom_fields) 
                                    ? matchedRelease.custom_fields.length 
                                    : (matchedRelease.custom_fields ? Object.keys(matchedRelease.custom_fields).length : 0),
                                custom_fields: customFieldsList
                            });
                        }
                    } else {
                        console.warn(`❌ Release "${releaseName}" not found in Aha API (searched ${allReleases.length} releases)`);
                        // Log similar release names for debugging
                        const similar = allReleases
                            .filter((r: any) => r.name && (
                                r.name.toLowerCase().includes(releaseName.toLowerCase().slice(-5)) ||
                                releaseName.toLowerCase().includes(r.name.toLowerCase().slice(-5))
                            ))
                            .slice(0, 5)
                            .map((r: any) => r.name);
                        if (similar.length > 0) {
                            console.log(`   Similar release names in Aha:`, similar);
                        }
                    }
                });
            } catch (ahaError: any) {
                console.error("Error fetching releases from Aha:", ahaError);
                // Continue without Aha dates - we'll still return what we have from epics
            }
        }

        // Convert to sorted array and include dates
        // Use all release names from both the original set and the ones found in Aha
        const allReleaseNames = new Set<string>();
        releaseNames.forEach(name => allReleaseNames.add(name));
        releaseDateMap.forEach((_, name) => allReleaseNames.add(name));
        
        const releaseData = Array.from(allReleaseNames)
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

