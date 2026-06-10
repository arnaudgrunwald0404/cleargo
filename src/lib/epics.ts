import { createClient, createAdminClient } from '@/lib/supabase/server';
import { CreateEpicDTO, Epic } from '@/types/epics';
import {
    computeEpicReleaseStatus,
    type EpicForStatus,
    type RetroForStatus,
} from '@/lib/epic-release-status';
import { getActiveReleaseScheduleRows } from '@/lib/release-schedule';

export async function instantiateEpicMatrix(epicId: string, tier: string) {
    const supabase = createClient();

    // 1. Fetch all active criteria
    const { data: criteria, error: criteriaError } = await supabase
        .from('criterion')
        .select('*')
        .eq('is_active', true);

    if (criteriaError) {
        console.error('Error fetching criteria:', criteriaError);
        throw new Error('Failed to fetch criteria for instantiation');
    }

    if (!criteria || criteria.length === 0) {
        return; // Nothing to instantiate
    }

    // 2. Filter based on tier applicability (ALL, TIER_1_ONLY, TIER_1_AND_2, TIER_2_ONLY, TIER_3_ONLY)
    const applicableCriteria = criteria.filter((c) => {
        if (c.tier_applicability === 'ALL') return true;
        if (c.tier_applicability === 'TIER_1_ONLY' && tier === 'TIER_1') return true;
        if (c.tier_applicability === 'TIER_1_AND_2' && (tier === 'TIER_1' || tier === 'TIER_2')) return true;
        if (c.tier_applicability === 'TIER_2_ONLY' && tier === 'TIER_2') return true;
        if (c.tier_applicability === 'TIER_3_ONLY' && tier === 'TIER_3') return true;
        return false;
    });

    if (applicableCriteria.length === 0) {
        return;
    }

    // 3. Prepare rows for epic_criterion_status
    const rows = applicableCriteria.map((c) => ({
        epic_id: epicId,
        criterion_id: c.id,
        status: 'NOT_SET',
    }));

    // 4. Insert rows
    const { error: insertError } = await supabase
        .from('epic_criterion_status')
        .insert(rows);

    if (insertError) {
        console.error('Error instantiating matrix:', insertError);
        throw new Error('Failed to insert epic criteria');
    }
}

export async function createEpic(data: CreateEpicDTO): Promise<Epic> {
    const supabase = createClient();

    // 1. Insert Epic (status is computed from dates on read; only Cancelled is stored as override)
    const { data: epic, error } = await supabase
        .from('epic')
        .insert({
            name: data.name,
            tier: data.tier,
            product_id: data.product_id,
            owner_id: data.owner_id,
            target_launch_date: data.target_launch_date,
            aha_id: data.aha_id,
            aha_url: data.aha_url,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating epic:', error);
        throw error;
    }

    // 2. Instantiate Matrix
    await instantiateEpicMatrix(epic.id, epic.tier);

    return epic as Epic;
}

async function applyComputedStatusToEpics(epics: any[]): Promise<any[]> {
    if (!epics || epics.length === 0) return epics;
    try {
        const supabase = createClient();
        const ids = epics.map((e) => e.id);
        const [retrosResult, releaseSchedule] = await Promise.all([
            supabase
                .from('epic_retros')
                .select('epic_id, day_marker, status')
                .in('epic_id', ids),
            getActiveReleaseScheduleRows(),
        ]);
        const { data: retros } = retrosResult;
        const byEpic = new Map<string, RetroForStatus[]>();
        for (const r of retros || []) {
            const list = byEpic.get(r.epic_id) ?? [];
            list.push({ day_marker: r.day_marker, status: r.status ?? 'PENDING' });
            byEpic.set(r.epic_id, list);
        }
        return epics.map((epic) => {
            const retrosForStatus = byEpic.get(epic.id) ?? [];
            const epicForStatus: EpicForStatus = {
                id: epic.id,
                status: epic.status,
                target_launch_date: epic.target_launch_date,
                scheduled_ga_dev_date: epic.scheduled_ga_dev_date,
                aha_fields: epic.aha_fields,
            };
            const status = computeEpicReleaseStatus(epicForStatus, retrosForStatus, {
                releaseSchedule,
            });
            return { ...epic, status };
        });
    } catch {
        return epics;
    }
}

/** Attach criteria_red_flag_count and criteria_red_flag_names (NO_GO criteria) to each epic. Uses admin client so RLS does not hide rows. */
async function enrichEpicsWithRedFlagCounts(epics: any[]): Promise<any[]> {
    if (!epics?.length) return epics;
    try {
        const supabase = createAdminClient();
        const ids = epics.map((e) => e.id);
        const { data: rows } = await supabase
            .from('epic_criterion_status')
            .select('epic_id, criterion:criterion_id(label)')
            .eq('status', 'NO_GO')
            .in('epic_id', ids);
        const namesByEpic = new Map<string, string[]>();
        for (const row of rows || []) {
            const label = (row.criterion as { label?: string } | null)?.label;
            const list = namesByEpic.get(row.epic_id) ?? [];
            list.push(typeof label === 'string' && label ? label : 'No Go criterion');
            namesByEpic.set(row.epic_id, list);
        }
        return epics.map((e) => {
            const names = namesByEpic.get(e.id) ?? [];
            return {
                ...e,
                criteria_red_flag_count: names.length,
                criteria_red_flag_names: names,
            };
        });
    } catch {
        return epics;
    }
}

export async function getEpics() {
    // ALWAYS return empty array on any error - never throw
    try {
        // Use direct PostgREST request - Supabase JS client has issues with JWT keys
        // Direct requests work reliably with legacy JWT keys
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        
        if (serviceRoleKey && supabaseUrl) {
            try {
                // Try epic table first
                // Filter: archived is not true (includes false and null)
                // PostgREST syntax: or=(archived.is.null,archived.eq.false)
                let response = await fetch(`${supabaseUrl}/rest/v1/epic?select=*&or=(archived.is.null,archived.eq.false)&order=created_at.desc`, {
                    method: 'GET',
                    headers: {
                        'apikey': serviceRoleKey,
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });
                
                // If epic table doesn't exist, try launch table
                if (!response.ok && response.status === 404) {
                    response = await fetch(`${supabaseUrl}/rest/v1/launch?select=*&order=created_at.desc`, {
                        method: 'GET',
                        headers: {
                            'apikey': serviceRoleKey,
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        }
                    });
                }
                
                if (response.ok) {
                    const directData = await response.json();
                    if (directData && Array.isArray(directData)) {
                        const withStatus = await applyComputedStatusToEpics(directData);
                        return await enrichEpicsWithRedFlagCounts(withStatus);
                    }
                }
            } catch (directError: any) {
                console.warn('Direct PostgREST request error:', directError?.message);
            }
        }
        
        let supabase;
        try {
            supabase = createClient();
        } catch (clientError: any) {
            console.warn('Failed to create Supabase client:', clientError?.message);
            return [];
        }

        // Try 'epic' table first, fallback to 'launch' if it doesn't exist
        // Exclude archived epics from the main list (archived != true, includes false and null)
        let { data, error } = await supabase
            .from('epic')
            .select('*')
            .or('archived.is.null,archived.eq.false')
            .order('created_at', { ascending: false });
        
        // If epic table doesn't exist, try launch table
        if (error && (error.code === '42P01' || error.code === 'PGRST' || error.message?.includes('relation') || error.message?.includes('does not exist'))) {
            const retryResult = await supabase
                .from('launch')
                .select('*')
                .order('created_at', { ascending: false });
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            // Check if it's a JWT validation error
            const isJWTError = error?.code === 'PGRST301' || 
                              error?.message?.includes('JWT') || 
                              error?.message?.includes('Expected 3 parts');
            
            if (isJWTError) {
                // Check which key format was actually used (from client metadata if available)
                const keyFormat = (supabase as any).__keyFormat;
                const usingNewFormat = keyFormat === 'new' || 
                    (!keyFormat && (process.env.SUPABASE_SECRET_KEY?.startsWith('sb_secret_') || 
                                    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')));
                
                const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
                const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
                const hasLegacyKeys = !!serviceRoleKey || !!anonKey;
                
                if (usingNewFormat && hasLegacyKeys) {
                    // We have new keys but also legacy keys - try using legacy keys
                    console.warn('⚠️  New format keys detected but PostgREST doesn\'t support them yet.');
                    console.warn('   Attempting to use legacy keys instead...');
                    console.warn('   To avoid this warning, use legacy keys: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY');
                    
                    // Try recreating client with legacy keys
                    try {
                        const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
                        const legacyKey = serviceRoleKey || anonKey;
                        const fallbackClient = createSupabaseClient(
                            process.env.NEXT_PUBLIC_SUPABASE_URL!,
                            legacyKey
                        );
                        
                        // Retry query with legacy client
                        const retryResult = await fallbackClient
                            .from('epic')
                            .select('*')
                            .order('created_at', { ascending: false });
                        
                        if (!retryResult.error) {
                            console.log('✅ Successfully used legacy keys for database query');
                            const withStatus = await applyComputedStatusToEpics(retryResult.data || []);
                            return await enrichEpicsWithRedFlagCounts(withStatus);
                        }
                        
                        // If epic table doesn't exist, try launch table
                        if (retryResult.error && (retryResult.error.code === '42P01' || retryResult.error.message?.includes('does not exist'))) {
                            const launchResult = await fallbackClient
                                .from('launch')
                                .select('*')
                                .order('created_at', { ascending: false });
                            if (!launchResult.error) {
                                console.log('✅ Successfully used legacy keys for database query');
                                const withStatus = await applyComputedStatusToEpics(launchResult.data || []);
                                return await enrichEpicsWithRedFlagCounts(withStatus);
                            }
                        }
                    } catch (fallbackError) {
                        console.error('Failed to use legacy keys:', fallbackError);
                    }
                }
                
                if (usingNewFormat) {
                    // PostgREST doesn't fully support new format keys yet - it expects JWT format
                    console.error('❌ PostgREST JWT validation error with new format Supabase keys');
                    console.error('   Error:', error?.message || 'JWT validation failed');
                    console.error('');
                    console.error('   ⚠️  SOLUTION: PostgREST (database queries) doesn\'t support new format keys yet.');
                    console.error('   Please use legacy JWT keys for now:');
                    console.error('');
                    console.error('   1. Go to Supabase Dashboard → Settings → API');
                    console.error('   2. Click on "Legacy anon, service_role API keys" tab');
                    console.error('   3. Copy the "anon" key to NEXT_PUBLIC_SUPABASE_ANON_KEY');
                    console.error('   4. Copy the "service_role" key to SUPABASE_SERVICE_ROLE_KEY');
                    console.error('   5. Restart your dev server');
                    console.error('');
                    return [];
                } else {
                    // Legacy JWT keys - check if this is a real error or something else
                    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
                    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
                    const hasLegacyKeys = !!serviceRoleKey || !!anonKey;
                    
                    if (hasLegacyKeys) {
                        // We have legacy keys but still getting JWT error
                        // According to Supabase docs: https://supabase.com/docs/guides/api/api-keys
                        // Legacy JWT keys should work with PostgREST, so this might indicate:
                        // - Invalid/expired keys
                        // - Key/project mismatch
                        // - PostgREST configuration issue
                        console.error('❌ Supabase API key validation error with legacy JWT keys');
                        console.error('   Error message:', error?.message || 'JWT validation failed');
                        console.error('   Error code:', error?.code || 'NO_CODE');
                        console.error('   Error details:', error?.details || 'No details');
                        console.error('   Error hint:', error?.hint || 'No hint');
                        console.error('');
                        console.error('   📚 Reference: https://supabase.com/docs/guides/api/api-keys');
                        console.error('');
                        
                        // Check which key is actually being used
                        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
                        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
                        const keyFormat = (supabase as any).__keyFormat;
                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                        
                        console.error('   Diagnostics:');
                        console.error('   - Key format detected:', keyFormat || 'unknown');
                        console.error('   - SUPABASE_SERVICE_ROLE_KEY present:', !!serviceRoleKey);
                        console.error('   - NEXT_PUBLIC_SUPABASE_ANON_KEY present:', !!anonKey);
                        console.error('   - Supabase URL:', supabaseUrl);
                        if (serviceRoleKey) {
                            console.error('   - Service role key length:', serviceRoleKey.length);
                            console.error('   - Service role key preview:', serviceRoleKey.substring(0, 50) + '...');
                            // Extract project ref from JWT if possible
                            try {
                                const parts = serviceRoleKey.split('.');
                                if (parts.length === 3) {
                                    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
                                    console.error('   - JWT payload ref:', payload.ref || 'not found');
                                    console.error('   - JWT payload role:', payload.role || 'not found');
                                }
                            } catch (e) {
                                // Ignore JWT parsing errors
                            }
                        }
                        console.error('');
                        console.error('   Possible causes:');
                        console.error('   1. Key is invalid, expired, or for a different project');
                        console.error('   2. NEXT_PUBLIC_SUPABASE_URL doesn\'t match the key\'s project');
                        console.error('   3. PostgREST configuration issue');
                        console.error('   4. Network/connectivity problem');
                        console.error('');
                        console.error('   Solutions:');
                        console.error('   1. Verify keys in Supabase Dashboard → Settings → API → "Legacy anon, service_role API keys"');
                        console.error('   2. Ensure NEXT_PUBLIC_SUPABASE_URL matches your project');
                        console.error('   3. Copy fresh keys and restart dev server');
                        console.error('   4. Check Supabase project status page');
                    } else {
                        // No legacy keys found
                        console.error('❌ Supabase API key validation error detected!');
                        console.error('   Error:', error?.message || 'JWT validation failed');
                        console.error('   No legacy keys found in environment variables');
                        console.error('   Please set SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
                    }
                    return [];
                }
            }
            
            // Safely log other error information
            try {
                const errorInfo: any = {
                    message: error?.message || 'Unknown error',
                    code: error?.code || 'NO_CODE',
                };
                
                // Only add these if they exist
                if (error?.details) errorInfo.details = error.details;
                if (error?.hint) errorInfo.hint = error.hint;
                
                console.error('Database query error:', errorInfo.message, `(${errorInfo.code})`);
                if (errorInfo.details) console.error('  Details:', errorInfo.details);
                if (errorInfo.hint) console.error('  Hint:', errorInfo.hint);
            } catch (logError) {
                // If even logging fails, just return empty array
                console.error('Failed to log error details');
            }
            
            return [];
        }

        const withStatus = await applyComputedStatusToEpics(data || []);
        return await enrichEpicsWithRedFlagCounts(withStatus);
    } catch (error: any) {
        console.error('Exception in getEpics:', error?.message || String(error));
        return [];
    }
}

export async function getEpic(id: string) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from('epic')
        .select(`
      *,
      product:product_id (name),
      owner:app_user!owner_id (name, email, first_name, last_name, avatar_url),
      aha_fields
    `)
        .eq('id', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return null;
        }
        throw error;
    }

    const { data: retros } = await supabase
        .from('epic_retros')
        .select('day_marker, status')
        .eq('epic_id', id);
    const retrosForStatus: RetroForStatus[] = (retros || []).map((r) => ({
        day_marker: r.day_marker,
        status: r.status ?? 'PENDING',
    }));
    const releaseSchedule = await getActiveReleaseScheduleRows();

    const epicForStatus: EpicForStatus = {
        id: data.id,
        status: data.status,
        target_launch_date: data.target_launch_date,
        scheduled_ga_dev_date: data.scheduled_ga_dev_date,
        aha_fields: data.aha_fields,
    };
    const computedStatus = computeEpicReleaseStatus(epicForStatus, retrosForStatus, {
        releaseSchedule: releaseSchedule ?? [],
    });
    return { ...data, status: computedStatus };
}

export type EpicUpdatePayload = Partial<CreateEpicDTO> & {
    /** Only 'Cancelled' is stored; all other statuses are computed from dates. */
    status?: 'Cancelled';
    actual_gtm_access_date?: string | null;
    gtm_access_confirmed?: boolean;
    gtm_access_na?: boolean;
    actual_internal_readiness_date?: string | null;
    internal_readiness_confirmed?: boolean;
    internal_readiness_na?: boolean;
};

export async function updateEpic(id: string, updates: EpicUpdatePayload) {
    const supabase = createClient();
    const { status, ...rest } = updates;
    const payload: Record<string, unknown> = { ...rest };
    if (status === 'Cancelled') {
        payload.status = 'Cancelled';
    }

    const { data, error } = await supabase
        .from('epic')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function deleteEpic(id: string) {
    const supabase = createClient();

    // Before deleting the epic, we need to clean up storage files for attachments
    // The database records will cascade delete, but storage files need explicit deletion
    
    // Get all criterion status IDs for this epic
    const { data: criterionStatuses, error: statusError } = await supabase
        .from('epic_criterion_status')
        .select('id')
        .eq('epic_id', id);

    if (statusError) {
        console.error('Error fetching criterion statuses for epic deletion:', statusError);
        // Continue with deletion even if we can't fetch statuses
    } else if (criterionStatuses && criterionStatuses.length > 0) {
        const statusIds = criterionStatuses.map(cs => cs.id);
        const allStoragePaths: string[] = [];
        
        // Get attachments linked directly to criterion statuses
        const { data: statusAttachments } = await supabase
            .from('criterion_attachment')
            .select('storage_path')
            .in('launch_criterion_status_id', statusIds);

        if (statusAttachments) {
            statusAttachments.forEach(a => {
                if (a.storage_path) allStoragePaths.push(a.storage_path);
            });
        }

        // Get comment IDs for these criterion statuses
        const { data: comments } = await supabase
            .from('criterion_comment')
            .select('id')
            .in('launch_criterion_status_id', statusIds);

        if (comments && comments.length > 0) {
            const commentIds = comments.map(c => c.id);
            
            // Get attachments linked to comments
            const { data: commentAttachments } = await supabase
                .from('criterion_attachment')
                .select('storage_path')
                .in('comment_id', commentIds);

            if (commentAttachments) {
                commentAttachments.forEach(a => {
                    if (a.storage_path) allStoragePaths.push(a.storage_path);
                });
            }
        }

        // Delete all attachment files from storage
        if (allStoragePaths.length > 0) {
            const { error: storageError } = await supabase.storage
                .from('criterion-attachments')
                .remove(allStoragePaths);

            if (storageError) {
                console.warn('Failed to delete some attachment files from storage:', storageError);
                // Continue with deletion even if storage cleanup fails
            } else {
                console.log(`Deleted ${allStoragePaths.length} attachment file(s) from storage`);
            }
        }
    }

    // Now delete the epic - this will cascade delete:
    // - epic_criterion_status (which cascades to criterion_comment and criterion_attachment records)
    // - decision_snapshot
    // - feedback
    // - meeting_epic junction records
    // - notification_log entries
    const { error } = await supabase
        .from('epic')
        .delete()
        .eq('id', id);

    if (error) {
        throw error;
    }
}

