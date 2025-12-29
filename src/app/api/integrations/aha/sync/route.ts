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
} from '@/lib/db/epics';
import { getSettings } from '@/lib/settings-db';

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
 */
export async function POST(req: NextRequest) {
    try {
        // Auth check - require admin role
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
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

        console.log('🔄 Manual Aha sync started', { product, perPage, page, force, syncAll, user: user.email });

        const client = getAhaClient();
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

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
                
                if (!syncedReleaseNames.has(epicReleaseName)) {
                    console.log(`⏭️  Skipping epic ${epicData.aha_id}: Release "${epicReleaseName}" not synced in system`);
                    results.skipped_release_not_synced++;
                    results.skipped++;
                    continue;
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

