import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEpic } from '@/lib/aha/client';
import { mapEpicToEpic } from '@/lib/aha/mapping';
import { upsertEpicFromAha, getUserByEmail, getFallbackProductOpsUser } from '@/lib/db/epics';
import { getSettings, getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';

export const dynamic = 'force-dynamic';
export const maxDuration = 20; // Reduced for Netlify serverless timeout limits (~26s max)

export async function POST(req: NextRequest) {
    try {
        // Check authentication
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: settings.ahaFields.sync
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }
        
        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.ahaFields.sync', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        // Get current settings to determine which fields to load
        const settings = await getSettings();
        const fieldsToLoad = settings.aha_fields_to_load || [];

        // Cursor: process next batch after this epic id (so each request syncs different epics)
        let body: { cursor?: string } = {};
        try {
            body = await req.json().catch(() => ({}));
        } catch {
            body = {};
        }
        const cursor = typeof body.cursor === 'string' && body.cursor ? body.cursor : null;

        const MAX_EPICS_PER_REQUEST = 10;

        // Fetch one page of epics in deterministic order (id); if cursor provided, only id > cursor
        let query = supabase
            .from('epic')
            .select('id, aha_id, name')
            .not('aha_id', 'is', null)
            .order('id', { ascending: true });
        if (cursor) {
            query = query.gt('id', cursor);
        }
        const { data: epicsPage, error: pageError } = await query.limit(MAX_EPICS_PER_REQUEST + 1);
        if (pageError) {
            throw new Error(`Failed to fetch epics: ${pageError.message}`);
        }
        const epicsPageList = epicsPage || [];

        if (epicsPageList.length === 0) {
            return NextResponse.json({
                success: true,
                message: cursor ? 'No more epics to synchronize' : 'No epics found to synchronize',
                synced: 0,
                failed: 0,
                total: 0,
                lastProcessedId: null,
                remaining: 0,
            });
        }

        const epicsToProcess = epicsPageList.slice(0, MAX_EPICS_PER_REQUEST);
        const hasMore = epicsPageList.length > MAX_EPICS_PER_REQUEST;

        // Total count only on first request (no cursor) for UI message
        let total = 0;
        if (!cursor) {
            const { count, error: countError } = await supabase
                .from('epic')
                .select('*', { count: 'exact', head: true })
                .not('aha_id', 'is', null);
            if (!countError) total = count ?? 0;
        }

        let synced = 0;
        let failed = 0;
        const errors: Array<{ aha_id: string; name: string; error: string }> = [];
        const startTime = Date.now();
        const MAX_EXECUTION_TIME = 15000; // 15 seconds (more conservative buffer)

        // Process epics with timeout protection
        for (const epicRecord of epicsToProcess) {
            // Check timeout more frequently (before each epic)
            if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                const lastId = epicsToProcess[Math.min(synced + failed, epicsToProcess.length) - 1]?.id ?? cursor;
                console.warn(`Sync timeout approaching, stopping at ${synced + failed} of ${epicsToProcess.length} epics`);
                return NextResponse.json({
                    success: true,
                    message: `Partial synchronization completed (timeout protection)`,
                    synced,
                    failed,
                    total,
                    partial: true,
                    processed: synced + failed,
                    remaining: hasMore ? 1 : 0,
                    lastProcessedId: lastId,
                    errors: errors.length > 0 ? errors : undefined,
                });
            }
            if (!epicRecord.aha_id) continue;

            try {
                // Check timeout before each async operation
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.warn(`Sync timeout approaching during epic processing, stopping`);
                    break;
                }

                // Fetch epic from AHA with timeout protection
                const epicPromise = getEpic(epicRecord.aha_id);
                const timeoutPromise = new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Epic fetch timeout')), 10000)
                );
                const epic = await Promise.race([epicPromise, timeoutPromise]);
                
                // Check timeout again before mapping
                if (Date.now() - startTime > MAX_EXECUTION_TIME) {
                    console.warn(`Sync timeout approaching during mapping, stopping`);
                    break;
                }
                
                // Map epic to epic data with current fieldsToLoad
                const epicData = await mapEpicToEpic(epic, fieldsToLoad);
                
                // Resolve owner
                let ownerId: string | null = null;
                if (epicData.owner_email) {
                    const user = await getUserByEmail(epicData.owner_email);
                    if (user) {
                        ownerId = user.id;
                    } else {
                        ownerId = await getFallbackProductOpsUser();
                    }
                } else {
                    ownerId = await getFallbackProductOpsUser();
                }
                
                // Update epic with new aha_fields
                await upsertEpicFromAha(epicData, ownerId);
                synced++;
                
                // Update aha_record_not_found flag (non-blocking)
                (async () => {
                    try {
                        await supabase.from('epic').update({ aha_record_not_found: false }).eq('id', epicRecord.id);
                    } catch (err) {
                        console.warn(`Failed to update aha_record_not_found for epic ${epicRecord.id}:`, err);
                    }
                })();
            } catch (error: any) {
                console.error(`Failed to sync epic ${epicRecord.aha_id}:`, error);
                failed++;
                errors.push({
                    aha_id: epicRecord.aha_id,
                    name: epicRecord.name,
                    error: error.message || 'Unknown error',
                });
                const isRecordNotFound = error?.message?.includes('404') || error?.message?.toLowerCase().includes('record not found');
                if (isRecordNotFound) {
                    // Non-blocking update
                    (async () => {
                        try {
                            await supabase.from('epic').update({ aha_record_not_found: true }).eq('id', epicRecord.id);
                        } catch (err) {
                            console.warn(`Failed to update aha_record_not_found flag for epic ${epicRecord.id}:`, err);
                        }
                    })();
                }
            }
        }

        const lastProcessedId = epicsToProcess[epicsToProcess.length - 1]?.id ?? null;
        return NextResponse.json({
            success: true,
            message: hasMore
                ? `Synchronized ${synced} of ${epicsToProcess.length} epics (more remaining)`
                : `Synchronized ${synced} epic${synced !== 1 ? 's' : ''}`,
            synced,
            failed,
            total,
            processed: synced + failed,
            remaining: hasMore ? 1 : 0,
            partial: hasMore,
            lastProcessedId,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('Error synchronizing AHA fields:', error);
        return NextResponse.json(
            { error: 'Failed to synchronize AHA fields', details: error.message },
            { status: 500 }
        );
    }
}



