import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAhaClient } from '@/lib/aha/client';
import { getReleaseEpics, updateEpicCustomFields } from '@/lib/aha/client';
import { resolveRole } from '@/lib/roles';
import { mapEpicToEpic, shouldProcessEpic } from '@/lib/aha/mapping';
import { upsertEpicFromAha, getUserByEmail, getFallbackProductOpsUser, instantiateReleaseCriteriaForEpic, clearAhaRecordNotFound } from '@/lib/db/epics';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check permissions - only SUPERADMIN, CPO, PRODUCT_OPS, PRODUCT
        const role = await resolveRole(user.email);
        const allowedRoles = ['SUPERADMIN', 'CPO', 'PRODUCT_OPS', 'PRODUCT'];
        if (!allowedRoles.includes(role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { releaseIds } = body;

        if (!Array.isArray(releaseIds) || releaseIds.length === 0) {
            return NextResponse.json({ error: 'releaseIds array is required' }, { status: 400 });
        }

        // Validate that we have release IDs (not empty strings, etc.)
        const validReleaseIds = releaseIds.filter(id => id && typeof id === 'string' && id.trim().length > 0);
        if (validReleaseIds.length === 0) {
            return NextResponse.json({ error: 'No valid release IDs provided' }, { status: 400 });
        }

        if (validReleaseIds.length !== releaseIds.length) {
            console.warn(`⚠️ Filtered out ${releaseIds.length - validReleaseIds.length} invalid release IDs`);
        }

        console.log(`🔄 Starting sync for ${validReleaseIds.length} SELECTED release(s) ONLY:`, validReleaseIds);
        console.log(`⚠️ IMPORTANT: Only these ${validReleaseIds.length} release(s) will be processed. No other releases will be touched.`);

        const client = getAhaClient();
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

        // Get owner for new epics
        const owner = await getUserByEmail(user.email) || await getFallbackProductOpsUser();
        const ownerId = owner == null ? null : typeof owner === 'string' ? owner : owner.id;

        let totalEpics = 0;
        let syncedEpics = 0;
        let updatedClearGOCandidate = 0;
        const errors: string[] = [];

        // Get release names for logging (fetch from Aha to get names for the IDs)
        const { getReleases } = await import('@/lib/aha/client');
        const releaseNameMap = new Map<string, string>();
        try {
            let page = 1;
            let hasMore = true;
            while (hasMore && page <= 10) { // Limit to 10 pages to avoid too many requests
                const response = await getReleases({ per_page: 50, page });
                const releases = response.releases || [];
                releases.forEach((r: any) => {
                    if (validReleaseIds.includes(r.id)) {
                        releaseNameMap.set(r.id, r.name);
                    }
                });
                hasMore = releases.length === 50 && releaseNameMap.size < validReleaseIds.length;
                page++;
            }
        } catch (error) {
            console.warn('Could not fetch release names for logging:', error);
        }

        // Process ONLY the selected releases (no other releases will be processed)
        for (const releaseId of releaseIds) {
            try {
                const releaseName = releaseNameMap.get(releaseId) || releaseId;
                console.log(`📦 Processing SELECTED release: "${releaseName}" (ID: ${releaseId}) - this is one of the releases you selected`);

                // Fetch all epics for this SPECIFIC release (paginated)
                const releaseEpics: any[] = [];
                let epicPage = 1;
                const epicsPerPage = 50;
                let hasMoreEpics = true;

                while (hasMoreEpics) {
                    const epicsResponse = await getReleaseEpics(releaseId, { per_page: epicsPerPage, page: epicPage });
                    // Handle different response structures
                    let epics: any[] = [];
                    if (Array.isArray(epicsResponse)) {
                        epics = epicsResponse;
                    } else if (epicsResponse?.epics && Array.isArray(epicsResponse.epics)) {
                        epics = epicsResponse.epics;
                    } else if (epicsResponse?.data && Array.isArray(epicsResponse.data)) {
                        epics = epicsResponse.data;
                    }
                    releaseEpics.push(...epics);
                    
                    hasMoreEpics = epics.length === epicsPerPage;
                    epicPage++;
                }

                console.log(`   Found ${releaseEpics.length} epics in SELECTED release "${releaseName}" (ID: ${releaseId})`);

                // Step 1: For ALL epics in this release, set ClearGO Candidate = Yes first
                console.log(`   Step 1: Setting ClearGO Candidate = Yes for ALL ${releaseEpics.length} epics in "${releaseName}"...`);
                for (const epic of releaseEpics) {
                    try {
                        // Check if epic already has ClearGO Candidate = Yes
                        const cleargoCandidate = Array.isArray(epic.custom_fields)
                            ? epic.custom_fields.find((f: any) => f?.key === 'cleargo_candidate')
                            : null;
                        const cleargoCandidateValue = cleargoCandidate?.value?.name || cleargoCandidate?.value;
                        const isClearGOCandidate = cleargoCandidateValue === 'Yes' || cleargoCandidateValue === true;

                        // Set ClearGO Candidate to Yes if not already set
                        if (!isClearGOCandidate) {
                            try {
                                await updateEpicCustomFields(epic.id, {
                                    cleargo_candidate: 'Yes',
                                });
                                updatedClearGOCandidate++;
                                console.log(`     ✅ Set ClearGO Candidate = Yes for epic ${epic.reference_num || epic.id}`);
                            } catch (updateError: any) {
                                console.warn(`     ⚠️ Failed to set ClearGO Candidate for epic ${epic.reference_num || epic.id}:`, updateError.message);
                                errors.push(`Failed to set ClearGO Candidate for epic ${epic.reference_num || epic.id}: ${updateError.message}`);
                            }
                        } else {
                            console.log(`     ℹ️ Epic ${epic.reference_num || epic.id} already has ClearGO Candidate = Yes`);
                        }
                    } catch (epicError: any) {
                        console.error(`     ❌ Error setting ClearGO Candidate for epic ${epic.reference_num || epic.id}:`, epicError);
                        errors.push(`Failed to set ClearGO Candidate for epic ${epic.reference_num || epic.id}: ${epicError.message}`);
                    }
                }

                // Step 2: Now do a full refresh - fetch and sync ALL epics from THIS selected release only
                console.log(`   Step 2: Doing full refresh of ALL ${releaseEpics.length} epics in SELECTED release "${releaseName}" (ID: ${releaseId})...`);
                for (const epic of releaseEpics) {
                    totalEpics++;
                    try {
                        // Fetch full epic data (this will now have ClearGO Candidate = Yes)
                        const fullEpic = await client.getEpic(epic.id);
                        
                        // Verify ClearGO Candidate is set (for logging)
                        const cleargoCandidate = Array.isArray(fullEpic.custom_fields)
                            ? fullEpic.custom_fields.find((f: any) => f?.key === 'cleargo_candidate')
                            : null;
                        const cleargoCandidateValue = cleargoCandidate?.value?.name || cleargoCandidate?.value;
                        const isClearGOCandidate = cleargoCandidateValue === 'Yes' || cleargoCandidateValue === true;
                        
                        if (!isClearGOCandidate) {
                            console.warn(`     ⚠️ Epic ${epic.reference_num || epic.id} still doesn't have ClearGO Candidate = Yes after update. Retrying...`);
                            // Retry setting it
                            try {
                                await updateEpicCustomFields(epic.id, {
                                    cleargo_candidate: 'Yes',
                                });
                                // Fetch again
                                const retryEpic = await client.getEpic(epic.id);
                                Object.assign(fullEpic, retryEpic);
                            } catch (retryError: any) {
                                console.error(`     ❌ Failed to set ClearGO Candidate on retry:`, retryError);
                            }
                        }
                        
                        // Map and upsert epic (this will sync all fields)
                        const epicData = await mapEpicToEpic(fullEpic, fieldsToLoad);
                        const savedEpic = await upsertEpicFromAha(epicData, ownerId);
                        await clearAhaRecordNotFound(savedEpic.id);

                        // Instantiate criteria if needed
                        await instantiateReleaseCriteriaForEpic(savedEpic.id, epicData.tier ?? 'TIER_3');

                        syncedEpics++;
                        console.log(`     ✅ Synced epic ${epic.reference_num || epic.id} from "${releaseName}"`);
                    } catch (epicError: any) {
                        console.error(`     ❌ Error syncing epic ${epic.reference_num || epic.id}:`, epicError);
                        errors.push(`Epic ${epic.reference_num || epic.id}: ${epicError.message}`);
                        const ahaId = epic.reference_num || epic.id;
                        if (epicError?.message?.includes('404') || epicError?.message?.toLowerCase().includes('record not found')) {
                            const { setAhaRecordNotFoundByAhaId } = await import('@/lib/db/epics');
                            await setAhaRecordNotFoundByAhaId(ahaId);
                        }
                    }
                }
            } catch (releaseError: any) {
                console.error(`❌ Error processing release ${releaseId}:`, releaseError);
                errors.push(`Release ${releaseId}: ${releaseError.message}`);
            }
        }

        const processedReleaseNames = validReleaseIds.map(id => releaseNameMap.get(id) || id).join(', ');
        console.log(`✅ Sync completed for SELECTED releases ONLY: ${syncedEpics}/${totalEpics} epics synced from ${validReleaseIds.length} selected release(s), ${updatedClearGOCandidate} ClearGO Candidate fields updated`);
        console.log(`📋 Processed ONLY these releases: ${processedReleaseNames}`);

        return NextResponse.json({
            success: true,
            message: `Successfully synced ${syncedEpics} epic(s) from ${validReleaseIds.length} selected release(s)`,
            synced: syncedEpics,
            total: totalEpics,
            updatedClearGOCandidate,
            processedReleaseIds: validReleaseIds,
            processedReleaseNames: validReleaseIds.map(id => releaseNameMap.get(id) || id),
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Error syncing releases:', error);
        return NextResponse.json(
            { error: 'Failed to sync releases', details: error.message },
            { status: 500 }
        );
    }
}
