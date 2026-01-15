import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveRole } from '@/lib/roles';
import { getAhaClient } from '@/lib/aha/client';
import { mapEpicToEpic, shouldProcessEpic } from '@/lib/aha/mapping';
import {
    upsertEpicFromAha,
    getUserByEmail,
    getFallbackProductOpsUser,
    instantiateCriteriaForEpic,
    getEpicByAhaId,
    fetchAndUpsertReleaseFromAha,
} from '@/lib/db/epics';
import { getSettings } from '@/lib/settings-db';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Manual sync endpoint to pull epics from Aha on-demand.
 * This complements webhooks by allowing bulk syncs and recovery from missed webhooks.
 * 
 * Query params:
 * - product: (optional) Aha product/workspace ID to filter by
 * - per_page: (optional) Number of epics to fetch per page (default: 50, max: 200)
 * - page: (optional) Page number for pagination (default: 1) - ignored if sync_all=true
 * - force: (optional) If "true", process all epics regardless of filter criteria
 * - sync_all: (optional) If "true", sync all pages of epics (complements webhook system)
 * - release: (optional) If provided, sync epics for this release name efficiently (no full epic scan)
 *
 * Body (optional, JSON):
 * - existingAhaIds: string[] (Aha epic reference numbers currently shown for this release; used for revalidation)
 */
export async function POST(req: NextRequest) {
    try {
        // Auth check - require admin role
        const supabase = createClient();
        const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        
        if (!supabaseUrl) {
            throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
        }
        
        const supabaseAdmin = supabaseServiceKey ? createSupabaseClient(
            supabaseUrl,
            supabaseServiceKey
        ) : supabase;
        const { data: { user }, error: getUserError } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        
        const role = await resolveRole(user.email);
        if (role !== 'SUPERADMIN' && role !== 'PRODUCT_OPS' && role !== 'CPO') {
            return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const product = searchParams.get('product') || undefined;
        const perPage = Math.min(parseInt(searchParams.get('per_page') || '50'), 200);
        const page = parseInt(searchParams.get('page') || '1');
        const force = searchParams.get('force') === 'true';
        const syncAll = searchParams.get('sync_all') === 'true';
        const releaseName = searchParams.get('release') || undefined;

        // Optional JSON body for UI-driven refreshes (safe if absent)
        let body: any = null;
        try {
            body = await req.json();
        } catch {
            body = null;
        }

        const existingAhaIdsInput = Array.isArray(body?.existingAhaIds) ? body.existingAhaIds : [];
        const existingAhaIds = existingAhaIdsInput
            .filter((id: any) => typeof id === 'string')
            .map((id: string) => id.trim())
            .filter(Boolean);
        const existingAhaIdsSet = new Set(existingAhaIds);

        console.log('🔄 Manual Aha sync started', { product, perPage, page, force, syncAll, releaseName, user: user.email });

        const client = getAhaClient();
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

        // Fetch all synced release names from release_schedule table
        const { data: syncedReleases, error: releasesError } = await supabase
            .from('release_schedule')
            .select('release_name');
        
        if (releasesError) {
            console.warn('⚠️ Failed to fetch synced releases:', releasesError);
        }
        
        const syncedReleaseNames = new Set<string>(
            (syncedReleases || []).map((r: any) => r.release_name)
        );
        
        console.log(`📋 Found ${syncedReleaseNames.size} synced releases in system`);

        const resolveOwnerId = async (ownerEmail: string | null): Promise<string | null> => {
            if (ownerEmail) {
                const ownerUser = await getUserByEmail(ownerEmail);
                if (ownerUser) return ownerUser.id;
                return await getFallbackProductOpsUser();
            }
            return await getFallbackProductOpsUser();
        };

        // If a release is provided, use an efficient release-based sync (no full epic scan)
        if (releaseName) {
            const results = {
                total: 0,
                processed: 0,
                created: 0,
                updated: 0,
                skipped: 0,
                skipped_no_release: 0,
                skipped_release_not_synced: 0,
                removed_from_release: 0,
                errors: [] as string[],
            };

            // 1) Resolve Aha release id by name (exact, then case-insensitive)
            let matchedRelease: any | null = null;
            let releasePage = 1;
            const releasesPerPage = 50;
            let hasMoreReleases = true;

            while (hasMoreReleases && !matchedRelease) {
                const resp: any = await client.getReleases({ per_page: releasesPerPage, page: releasePage });
                const releases: any[] = resp?.releases || [];

                matchedRelease = releases.find((r: any) => r?.name === releaseName) ||
                    releases.find((r: any) => typeof r?.name === 'string' && r.name.toLowerCase() === releaseName.toLowerCase()) ||
                    null;

                hasMoreReleases = releases.length === releasesPerPage;
                releasePage++;
            }

            if (!matchedRelease?.id) {
                return NextResponse.json(
                    { error: `Release "${releaseName}" not found in Aha`, details: 'Release lookup failed' },
                    { status: 404 }
                );
            }

            // 2) Fetch all epics for this release (paginated)
            const releaseEpicSummaries: any[] = [];
            let epicPage = 1;
            let hasMoreEpics = true;
            while (hasMoreEpics) {
                const resp: any = await client.getReleaseEpics(matchedRelease.id, { per_page: perPage, page: epicPage });

                let epics: any[] = [];
                if (Array.isArray(resp)) {
                    epics = resp;
                } else if (resp?.epics && Array.isArray(resp.epics)) {
                    epics = resp.epics;
                } else if (resp?.data && Array.isArray(resp.data)) {
                    epics = resp.data;
                }

                releaseEpicSummaries.push(...epics);
                hasMoreEpics = epics.length === perPage;
                epicPage++;
            }

            const releaseAhaIds = new Set<string>(
                releaseEpicSummaries
                    .map((e: any) => e?.reference_num || e?.id)
                    .filter((id: any) => typeof id === 'string' && id.trim())
                    .map((id: string) => id.trim())
            );

            results.total = releaseAhaIds.size;

            // 3) Revalidate previously-shown epics that are no longer in this release
            for (const ahaId of existingAhaIds) {
                if (releaseAhaIds.has(ahaId)) continue;

                try {
                    const fullEpic = await client.getEpic(ahaId);
                    const shouldProcess = force || (await shouldProcessEpic(fullEpic));
                    
                    if (!shouldProcess) {
                        // Epic doesn't match filter criteria, but we still need to check if it exists
                        // and archive it if cleargo_candidate is empty
                        try {
                            const existingEpic = await getEpicByAhaId(ahaId);
                            if (existingEpic) {
                                // Check cleargo_candidate value from Aha epic
                                const cleargoCandidate = Array.isArray(fullEpic.custom_fields)
                                    ? fullEpic.custom_fields.find((f: any) => f?.key === 'cleargo_candidate')?.value
                                    : null;
                                const cleargoCandidateValue = cleargoCandidate?.name || cleargoCandidate;
                                const isClearGOCandidate = cleargoCandidateValue === 'Yes' || cleargoCandidateValue === true;
                                
                                // Archive if cleargo_candidate is not "Yes"
                                // Check if archived field exists (migration may not have run yet)
                                const currentArchived = (existingEpic as any).archived;
                                if (!isClearGOCandidate && currentArchived !== true) {
                                    try {
                                        if (!supabaseAdmin) {
                                            console.error(`Cannot archive epic ${ahaId}: supabaseAdmin is not available`);
                                        } else {
                                            const { error: archiveError } = await supabaseAdmin
                                                .from('epic')
                                                .update({ archived: true, updated_at: new Date().toISOString() })
                                                .eq('id', existingEpic.id);
                                            
                                            if (archiveError) {
                                                // Check if error is due to missing column
                                                if (archiveError.message?.includes('archived') || archiveError.code === '42703') {
                                                    console.warn(`Cannot archive epic ${ahaId}: archived column may not exist yet. Please run migration 20260117000000_add_archived_to_epic.sql`);
                                                } else {
                                                    console.error(`Failed to archive epic ${ahaId}:`, archiveError);
                                                }
                                            } else {
                                                console.log(`📦 Archived epic ${ahaId} (${existingEpic.name}) - cleargo_candidate is empty/not "Yes"`);
                                            }
                                        }
                                    } catch (archiveErr: any) {
                                        console.error(`Error archiving epic ${ahaId}:`, archiveErr);
                                    }
                                }
                            }
                        } catch (checkErr: any) {
                            console.error(`Error checking existing epic ${ahaId} for archiving:`, checkErr);
                        }
                        results.skipped++;
                        continue;
                    }

                    const epicData = await mapEpicToEpic(fullEpic, fieldsToLoad);

                    // Apply same release validation as main sync loop
                    const epicRelease = epicData.aha_release_name;
                    if (!epicRelease) {
                        results.skipped_no_release++;
                        results.skipped++;
                        continue;
                    }

                    const existingEpic = await getEpicByAhaId(epicData.aha_id);
                    const isNewEpic = !existingEpic;

                    const ownerId = await resolveOwnerId(epicData.owner_email);
                    const savedEpic = await upsertEpicFromAha(epicData, ownerId);

                    if (isNewEpic) {
                        await instantiateCriteriaForEpic(savedEpic.id, savedEpic.tier);
                        results.created++;
                    } else {
                        results.updated++;
                    }

                    results.processed++;
                    results.removed_from_release++;
                } catch (epicError) {
                    const errorMsg = `Error revalidating epic ${ahaId}: ${(epicError as Error).message}`;
                    console.error(errorMsg);
                    results.errors.push(errorMsg);
                }
            }

            // 4) Sync all epics currently in the release
            for (const summary of releaseEpicSummaries) {
                const ahaId = (summary?.reference_num || summary?.id) as string | undefined;
                if (!ahaId) continue;

                try {
                    const fullEpic = await client.getEpic(ahaId);
                    const shouldProcess = force || (await shouldProcessEpic(fullEpic));
                    
                    if (!shouldProcess) {
                        // Epic doesn't match filter criteria, but we still need to check if it exists
                        // and archive it if cleargo_candidate is empty
                        try {
                            const existingEpic = await getEpicByAhaId(ahaId);
                            if (existingEpic) {
                                // Check cleargo_candidate value from Aha epic
                                const cleargoCandidate = Array.isArray(fullEpic.custom_fields)
                                    ? fullEpic.custom_fields.find((f: any) => f?.key === 'cleargo_candidate')?.value
                                    : null;
                                const cleargoCandidateValue = cleargoCandidate?.name || cleargoCandidate;
                                const isClearGOCandidate = cleargoCandidateValue === 'Yes' || cleargoCandidateValue === true;
                                
                                // Archive if cleargo_candidate is not "Yes"
                                // Check if archived field exists (migration may not have run yet)
                                const currentArchived = (existingEpic as any).archived;
                                if (!isClearGOCandidate && currentArchived !== true) {
                                    try {
                                        if (!supabaseAdmin) {
                                            console.error(`Cannot archive epic ${ahaId}: supabaseAdmin is not available`);
                                        } else {
                                            const { error: archiveError } = await supabaseAdmin
                                                .from('epic')
                                                .update({ archived: true, updated_at: new Date().toISOString() })
                                                .eq('id', existingEpic.id);
                                            
                                            if (archiveError) {
                                                // Check if error is due to missing column
                                                if (archiveError.message?.includes('archived') || archiveError.code === '42703') {
                                                    console.warn(`Cannot archive epic ${ahaId}: archived column may not exist yet. Please run migration 20260117000000_add_archived_to_epic.sql`);
                                                } else {
                                                    console.error(`Failed to archive epic ${ahaId}:`, archiveError);
                                                }
                                            } else {
                                                console.log(`📦 Archived epic ${ahaId} (${existingEpic.name}) - cleargo_candidate is empty/not "Yes"`);
                                            }
                                        }
                                    } catch (archiveErr: any) {
                                        console.error(`Error archiving epic ${ahaId}:`, archiveErr);
                                    }
                                }
                            }
                        } catch (checkErr: any) {
                            console.error(`Error checking existing epic ${ahaId} for archiving:`, checkErr);
                        }
                        results.skipped++;
                        continue;
                    }

                    const epicData = await mapEpicToEpic(fullEpic, fieldsToLoad);

                    const epicRelease = epicData.aha_release_name;
                    if (!epicRelease) {
                        results.skipped_no_release++;
                        results.skipped++;
                        continue;
                    }

                    // Auto-fetch release from Aha API if it doesn't exist in system
                    if (!syncedReleaseNames.has(epicRelease)) {
                        try {
                            const fetchedDate = await fetchAndUpsertReleaseFromAha(epicRelease);
                            syncedReleaseNames.add(epicRelease);

                            if (fetchedDate === null) {
                                console.log(`⚠️ Release "${epicRelease}" not found in Aha or has no date, continuing with epic sync`);
                            }
                        } catch (fetchError) {
                            console.error(`Failed to auto-fetch release "${epicRelease}" from Aha:`, fetchError);
                            const errorMsg = `Failed to auto-fetch release "${epicRelease}": ${(fetchError as Error).message}`;
                            results.errors.push(errorMsg);
                        }
                    }

                    const existingEpic = await getEpicByAhaId(epicData.aha_id);
                    const isNewEpic = !existingEpic;

                    const ownerId = await resolveOwnerId(epicData.owner_email);
                    const savedEpic = await upsertEpicFromAha(epicData, ownerId);

                    if (isNewEpic) {
                        await instantiateCriteriaForEpic(savedEpic.id, savedEpic.tier);
                        results.created++;
                    } else {
                        results.updated++;
                    }

                    results.processed++;
                } catch (epicError) {
                    const errorMsg = `Error processing epic ${ahaId}: ${(epicError as Error).message}`;
                    console.error(errorMsg);
                    results.errors.push(errorMsg);
                }
            }

            console.log('✅ Manual Aha release sync completed', results);

            return NextResponse.json({
                success: true,
                message: `Release sync completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
                results,
            });
        }

        // Fetch all epics from Aha (paginated if sync_all=true)
        let allEpics: any[] = [];
        
        if (syncAll) {
            // Fetch all pages
            let currentPage = 1;
            let hasMore = true;
            
            while (hasMore) {
                try {
                    const response = await client.getEpics({ product, per_page: perPage, page: currentPage });
                    
                    // Handle different response structures
                    let epics: any[] = [];
                    if (Array.isArray(response)) {
                        epics = response;
                    } else if (response?.epics && Array.isArray(response.epics)) {
                        epics = response.epics;
                    } else if (response?.data && Array.isArray(response.data)) {
                        epics = response.data;
                    }
                    
                    allEpics = allEpics.concat(epics);
                    hasMore = epics.length === perPage;
                    currentPage++;
                    
                    console.log(`📥 Fetched page ${currentPage - 1}: ${epics.length} epics (total: ${allEpics.length})`);
                } catch (fetchError) {
                    console.error(`❌ Failed to fetch page ${currentPage} from Aha:`, fetchError);
                    throw new Error(`Failed to fetch epics from Aha (page ${currentPage}): ${(fetchError as Error).message}`);
                }
            }
            
            console.log(`📥 Fetched ${allEpics.length} total epics from Aha (${currentPage - 1} pages)`);
        } else {
            // Single page fetch (backward compatible)
            let response: any;
            try {
                response = await client.getEpics({ product, per_page: perPage, page });
            } catch (fetchError) {
                console.error('❌ Failed to fetch epics from Aha:', fetchError);
                throw new Error(`Failed to fetch epics from Aha: ${(fetchError as Error).message}`);
            }
            
            // Handle different response structures
            if (Array.isArray(response)) {
                allEpics = response;
            } else if (response?.epics && Array.isArray(response.epics)) {
                allEpics = response.epics;
            } else if (response?.data && Array.isArray(response.data)) {
                allEpics = response.data;
            } else {
                console.error('⚠️ Unexpected Aha API response structure:', {
                    responseType: typeof response,
                    isArray: Array.isArray(response),
                    keys: response ? Object.keys(response) : [],
                    response: JSON.stringify(response).substring(0, 500)
                });
                throw new Error('Unexpected Aha API response structure. Check logs for details.');
            }
            
            console.log(`📥 Fetched ${allEpics.length} epics from Aha (page ${page})`);
        }

        const results = {
            total: allEpics.length,
            processed: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            skipped_no_release: 0,
            skipped_release_not_synced: 0,
            errors: [] as string[],
        };

        for (const ahaEpic of allEpics) {
            try {
                // Check filter criteria (unless force is true)
                if (!force && !(await shouldProcessEpic(ahaEpic))) {
                    console.log(`⏭️  Skipping epic ${ahaEpic.reference_num || ahaEpic.id}: Does not match filter criteria`);
                    results.skipped++;
                    continue;
                }

                // Fetch full epic details to ensure all custom fields are loaded
                let fullEpic = ahaEpic;
                try {
                    fullEpic = await client.getEpic(ahaEpic.reference_num || ahaEpic.id);
                } catch (fetchError) {
                    console.warn(`Could not fetch full details for ${ahaEpic.reference_num}, using partial data`);
                }

                // Map Aha epic to our schema
                const epicData = await mapEpicToEpic(fullEpic, fieldsToLoad);
                
                // Check if epic's release is synced in the system
                const epicReleaseName = epicData.aha_release_name;
                if (!epicReleaseName) {
                    console.log(`⏭️  Skipping epic ${epicData.aha_id}: No release assigned`);
                    results.skipped_no_release++;
                    results.skipped++;
                    continue;
                }
                
                // If release filter is specified, only process epics for that release
                if (releaseName && epicReleaseName !== releaseName) {
                    console.log(`⏭️  Skipping epic ${epicData.aha_id}: Release "${epicReleaseName}" does not match filter "${releaseName}"`);
                    results.skipped++;
                    continue;
                }
                
                // Auto-fetch release from Aha API if it doesn't exist in system
                if (!syncedReleaseNames.has(epicReleaseName)) {
                    try {
                        const fetchedDate = await fetchAndUpsertReleaseFromAha(epicReleaseName);
                        // Add to syncedReleaseNames set so we don't fetch it again in this sync
                        syncedReleaseNames.add(epicReleaseName);
                        
                        if (fetchedDate === null) {
                            // Release not found in Aha or has no date - still continue processing epic
                            console.log(`⚠️ Release "${epicReleaseName}" not found in Aha or has no date, continuing with epic sync`);
                        }
                    } catch (fetchError) {
                        // If fetch fails, log error but continue processing epic
                        console.error(`Failed to auto-fetch release "${epicReleaseName}" from Aha:`, fetchError);
                        const errorMsg = `Failed to auto-fetch release "${epicReleaseName}": ${(fetchError as Error).message}`;
                        results.errors.push(errorMsg);
                        // Continue processing epic anyway - release might be created manually later
                    }
                }

                // Check if epic already exists
                const existingEpic = await getEpicByAhaId(epicData.aha_id);
                const isNewEpic = !existingEpic;

                // Resolve owner
                let ownerId: string | null = null;
                if (epicData.owner_email) {
                    const ownerUser = await getUserByEmail(epicData.owner_email);
                    if (ownerUser) {
                        ownerId = ownerUser.id;
                    } else {
                        ownerId = await getFallbackProductOpsUser();
                    }
                } else {
                    ownerId = await getFallbackProductOpsUser();
                }

                // Upsert epic
                const savedEpic = await upsertEpicFromAha(epicData, ownerId);

                // Instantiate criteria for new epics
                if (isNewEpic) {
                    await instantiateCriteriaForEpic(savedEpic.id, savedEpic.tier);
                    results.created++;
                    console.log(`🆕 Created epic: ${savedEpic.name} (${savedEpic.aha_id})`);
                } else {
                    results.updated++;
                    console.log(`🔄 Updated epic: ${savedEpic.name} (${savedEpic.aha_id})`);
                }

                results.processed++;

            } catch (epicError) {
                const errorMsg = `Error processing epic ${ahaEpic.reference_num || ahaEpic.id}: ${(epicError as Error).message}`;
                console.error(errorMsg);
                results.errors.push(errorMsg);
            }
        }

        console.log('✅ Manual Aha sync completed', results);

        const skipReasons = [];
        if (results.skipped_no_release > 0) {
            skipReasons.push(`${results.skipped_no_release} with no release`);
        }
        if (results.skipped_release_not_synced > 0) {
            skipReasons.push(`${results.skipped_release_not_synced} with unsynced release`);
        }
        const skipMessage = skipReasons.length > 0 ? ` (${skipReasons.join(', ')})` : '';
        
        return NextResponse.json({
            success: true,
            message: `Sync completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped${skipMessage}`,
            results,
        });

    } catch (error) {
        console.error('Manual Aha sync error:', error);
        console.error('Error stack:', (error as Error).stack);
        return NextResponse.json(
            { error: 'Sync failed', details: (error as Error).message },
            { status: 500 }
        );
    }
}

/**
 * GET endpoint to check sync status and list available products
 */
export async function GET(req: NextRequest) {
    try {
        // Auth check
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const client = getAhaClient();
        
        // Test connection and list products
        const [connectionTest, productsResponse] = await Promise.all([
            client.testConnection(),
            client.getProducts(),
        ]);

        const products = (productsResponse.products || []).map((p: any) => ({
            id: p.id,
            reference_prefix: p.reference_prefix,
            name: p.name,
        }));

        return NextResponse.json({
            success: true,
            connection: {
                status: 'connected',
                user: connectionTest.user?.name || connectionTest.user?.email,
            },
            products,
            instructions: {
                sync_all: 'POST /api/integrations/aha/sync',
                sync_product: 'POST /api/integrations/aha/sync?product=PRODUCT_ID',
                force_all: 'POST /api/integrations/aha/sync?force=true',
            },
        });

    } catch (error) {
        console.error('Aha sync status error:', error);
        return NextResponse.json(
            { 
                success: false, 
                connection: { status: 'error', message: (error as Error).message },
                error: (error as Error).message 
            },
            { status: 500 }
        );
    }
}

