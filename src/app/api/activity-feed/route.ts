import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export interface ActivityFeedItem {
    id: string;
    type: 'criterion_change' | 'epic_added' | 'release_updated' | 'feedback_added' | 'delegation';
    title: string;
    description: string;
    timestamp: string;
    actor?: {
        name: string;
        email: string;
        first_name?: string | null;
        last_name?: string | null;
        avatar_url?: string | null;
    };
    entity_type?: string;
    entity_id?: string;
    epic_id?: string; // For feedback and criterion activities linked to epics
}

function firstItem<T>(value: T | T[] | null | undefined): T | undefined {
    if (!value) return undefined;
    return Array.isArray(value) ? value[0] : value;
}

function normalizeActor(actor: any): ActivityFeedItem['actor'] | undefined {
    const candidate = firstItem(actor);
    if (!candidate) return undefined;

    const email = candidate.email ?? '';
    if (!email) return undefined;

    const name = candidate.name ?? candidate.full_name ?? email;

    return {
        name,
        email,
        first_name: candidate.first_name ?? null,
        last_name: candidate.last_name ?? null,
        avatar_url: candidate.avatar_url ?? null,
    };
}

export async function GET(req: NextRequest) {
    // #region agent log
    const fs = require('fs');
    const logEntry1 = {location:'activity-feed/route.ts:47',message:'GET activity-feed called',data:{url:req.url,hasCookies:req.cookies.getAll().length>0,cookieNames:req.cookies.getAll().map(c=>c.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry1) + '\n'); } catch(e) {}
    // #endregion
    try {
        // #region agent log
        const envCheck = {hasSupabaseUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasPublishableKey:!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,hasAnonKey:!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY};
        const logEntry2 = {location:'activity-feed/route.ts:50',message:'Before createClient - env check',data:envCheck,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry2) + '\n'); } catch(e) {}
        // #endregion
        const supabase = createClient();
        // #region agent log
        const logEntry3 = {location:'activity-feed/route.ts:52',message:'After createClient - before getUser',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry3) + '\n'); } catch(e) {}
        // #endregion
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        // #region agent log
        const logEntry4 = {location:'activity-feed/route.ts:54',message:'After getUser',data:{hasUser:!!user,userEmail:user?.email,authError:authError?.message,authErrorCode:authError?.code,authErrorStatus:authError?.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry4) + '\n'); } catch(e) {}
        // #endregion

        if (!user) {
            // #region agent log
            const logEntry5 = {location:'activity-feed/route.ts:58',message:'Returning 401 - no user',data:{authError:authError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
            try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry5) + '\n'); } catch(e) {}
            // #endregion
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = req.nextUrl.searchParams;
        const limit = parseInt(searchParams.get('limit') || '20');

        // Fetch recent audit log entries
        const { data: auditLogs, error: auditError } = await supabase
            .from('audit_log')
            .select(`
                id,
                entity_type,
                entity_id,
                taken_at,
                json_diff,
                actor:actor_id (
                    name,
                    email,
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .order('taken_at', { ascending: false })
            .limit(limit * 2);

        if (auditError) throw auditError;

        // Fetch recent feedback
        const { data: feedbackItems, error: feedbackError } = await supabase
            .from('feedback')
            .select(`
                id,
                feedback_text,
                source,
                created_at,
                epic:epic_id (
                    id,
                    name
                ),
                attributed_to:attributed_to_id (
                    name,
                    email,
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (feedbackError) console.warn('Failed to fetch feedback:', feedbackError);

        // Transform audit logs into activity feed items
        const activities: ActivityFeedItem[] = [];
        // Track entities we've already added to prevent duplicates
        const seenEntities = new Set<string>();

        // Collect criterion status IDs to fetch epic_ids in batch
        const criterionStatusIds: string[] = [];

        for (const log of auditLogs || []) {
            let activity: ActivityFeedItem | null = null;

            // Create a unique key for this entity
            const entityKey = `${log.entity_type}:${log.entity_id}`;

            // Parse different types of activities
            if (log.entity_type === 'criterion' || log.entity_type === 'launch_criterion_status' || log.entity_type === 'epic_criterion_status') {
                // Criteria status change
                const diff = log.json_diff;
                const statusChange = diff?.status || diff?.readiness_status;
                
                if (statusChange) {
                    // For criterion status changes, we need to fetch epic_id
                    if (log.entity_type === 'epic_criterion_status' || log.entity_type === 'launch_criterion_status') {
                        criterionStatusIds.push(log.entity_id);
                    }
                    
                    activity = {
                        id: log.id,
                        type: 'criterion_change',
                        title: 'Criterion Updated',
                        description: `Status changed from "${statusChange.old || 'N/A'}" to "${statusChange.new || 'N/A'}"`,
                        timestamp: log.taken_at,
                        actor: normalizeActor(log.actor),
                        entity_type: log.entity_type,
                        entity_id: log.entity_id,
                    };
                }
            } else if (log.entity_type === 'launch' || log.entity_type === 'epic') {
                const diff = log.json_diff;
                
                // Check if it's a new epic/launch (created event)
                // Look for creation indicators:
                // 1. source field indicates 'aha_sync' (epic created via Aha sync)
                // 2. All object-type diff fields have only "new" values (no "old" values), indicating creation
                const isCreation = diff?.source === 'aha_sync' || 
                    (diff && Object.keys(diff).length > 5 && 
                     Object.values(diff).every((v: any) => {
                         // Skip non-object values (like 'source' string)
                         if (!v || typeof v !== 'object' || Array.isArray(v)) return true;
                         // For objects, check if they have 'new' but no 'old' (creation indicator)
                         return v.new !== undefined && v.old === undefined;
                     }));
                
                if (isCreation) {
                    // Only add if we haven't seen this entity before
                    if (!seenEntities.has(entityKey)) {
                        activity = {
                            id: log.id,
                            type: 'epic_added',
                            title: log.entity_type === 'epic' ? 'New Epic Created' : 'New Launch Created',
                            description: diff.name?.new || diff.title?.new || 'A new item has been added',
                            timestamp: log.taken_at,
                            actor: normalizeActor(log.actor),
                            entity_type: log.entity_type,
                            entity_id: log.entity_id,
                        };
                        seenEntities.add(entityKey);
                    }
                } else if (diff?.release_id || diff?.release) {
                    // Release assignment change - only add if we haven't seen this entity for release updates
                    const releaseKey = `${entityKey}:release`;
                    if (!seenEntities.has(releaseKey)) {
                        activity = {
                            id: log.id,
                            type: 'release_updated',
                            title: 'Release Updated',
                            description: `${log.entity_type === 'epic' ? 'Epic' : 'Launch'} assigned to release`,
                            timestamp: log.taken_at,
                            actor: normalizeActor(log.actor),
                            entity_type: log.entity_type,
                            entity_id: log.entity_id,
                        };
                        seenEntities.add(releaseKey);
                    }
                }
            } else if (log.entity_type === 'delegation') {
                // Delegation event
                const diff = log.json_diff;
                const delegationTypeLabels: Record<string, string> = {
                    'SINGLE_TASK': 'task',
                    'CATEGORY_EXCLUDING_GATES': 'category (excluding GATE)',
                    'CATEGORY_INCLUDING_GATES': 'category (including GATE)',
                    'TEMPLATE_EXCLUDING_GATES': 'template (excluding GATE)',
                    'TEMPLATE_INCLUDING_GATES': 'template (including GATE)',
                };
                
                const scope = delegationTypeLabels[diff?.delegation_type] || diff?.delegation_type || 'task';
                const taskLabel = diff?.task_label || 'Approval task';
                const epicName = diff?.epic_name || 'Unknown epic';
                const newApproverEmail = diff?.new_approver_email || 'Unknown';
                
                activity = {
                    id: log.id,
                    type: 'delegation',
                    title: 'Task Delegated',
                    description: `${taskLabel} for ${epicName} delegated to ${newApproverEmail} (${scope})`,
                    timestamp: log.taken_at,
                    actor: normalizeActor(log.actor),
                    entity_type: log.entity_type,
                    entity_id: log.entity_id,
                };
            }

            if (activity) {
                activities.push(activity);
            }

            if (activities.length >= limit) {
                break;
            }
        }

        // Fetch epic_ids for criterion status activities in batch
        if (criterionStatusIds.length > 0) {
            const { data: criterionStatuses } = await supabase
                .from('epic_criterion_status')
                .select('id, epic_id')
                .in('id', criterionStatusIds);

            if (criterionStatuses) {
                const epicIdMap = new Map(criterionStatuses.map(cs => [cs.id, cs.epic_id]));
                // Update activities with epic_id
                for (const activity of activities) {
                    if (activity.type === 'criterion_change' && 
                        (activity.entity_type === 'epic_criterion_status' || activity.entity_type === 'launch_criterion_status') &&
                        activity.entity_id) {
                        activity.epic_id = epicIdMap.get(activity.entity_id);
                    }
                }
            }
        }

        // Add feedback activities
        for (const feedback of feedbackItems || []) {
            const epic = firstItem(feedback.epic);
            const epicName = epic?.name || 'Unknown Epic';
            const epicId = epic?.id;
            const truncatedFeedback = feedback.feedback_text.length > 100 
                ? feedback.feedback_text.substring(0, 100) + '...'
                : feedback.feedback_text;

            activities.push({
                id: feedback.id,
                type: 'feedback_added',
                title: 'Feedback Added',
                description: `${epicName}: "${truncatedFeedback}"`,
                timestamp: feedback.created_at,
                actor: normalizeActor(feedback.attributed_to),
                entity_type: 'feedback',
                entity_id: feedback.id,
                epic_id: epicId,
            });

            if (activities.length >= limit) {
                break;
            }
        }

        // Sort all activities by timestamp
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        // Trim to limit
        const finalActivities = activities.slice(0, limit);

        return NextResponse.json({ activities: finalActivities });

    } catch (error) {
        console.error('Error fetching activity feed:', error);
        return NextResponse.json({ error: 'Failed to fetch activity feed' }, { status: 500 });
    }
}

