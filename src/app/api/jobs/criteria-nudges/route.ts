/**
 * Scheduled job: Send nudge notifications for criteria based on due dates
 * Runs daily to remind decision owners about criteria approaching or past due dates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle, canReceiveSlackNotification } from '@/lib/slack/notifications';
import { sendEmailNotification } from '@/lib/email/notifications';
import { groupCriteriaByEpicDueDateAndAssignee } from '@/lib/slack/notification-groups';
import { buildCriteriaNudgeMessage } from '@/lib/slack/templates';
import { getSettings } from '@/lib/settings-db';
import { getReleaseNameFromEpic } from '@/lib/services/releaseAnalyticsService';
import { resolveProductManagerUserId } from '@/lib/services/successMeasurementService';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const DEBUG_LOG_PATH = '/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log';
const debugLog = (location: string, message: string, data: any, hypothesisId: string) => {
    try {
        const logEntry = { location, message, data, timestamp: Date.now(), runId: 'debug1', hypothesisId };
        const logLine = JSON.stringify(logEntry) + '\n';
        appendFileSync(DEBUG_LOG_PATH, logLine);
        // Also log to console for immediate visibility
        console.log(`[DEBUG ${hypothesisId}] ${location}: ${message}`, data);
    } catch (e: any) {
        // If directory doesn't exist, try to create it
        if (e.code === 'ENOENT') {
            try {
                mkdirSync(dirname(DEBUG_LOG_PATH), { recursive: true });
                appendFileSync(DEBUG_LOG_PATH, JSON.stringify({ location, message, data, timestamp: Date.now(), runId: 'debug1', hypothesisId }) + '\n');
                console.log(`[DEBUG ${hypothesisId}] ${location}: ${message}`, data);
            } catch (e2) {
                console.error(`[DEBUG] Failed to write log:`, e2);
                console.log(`[DEBUG ${hypothesisId}] ${location}: ${message}`, data);
            }
        } else {
            console.error(`[DEBUG] Failed to write log:`, e);
            console.log(`[DEBUG ${hypothesisId}] ${location}: ${message}`, data);
        }
    }
};

// Match Home list rules: Success Defined criterion (metrics, goals, reporting)
const isSuccessDefinedCriterion = (c: { criterion?: { label?: string } | null }): boolean =>
    ((c.criterion?.label ?? '') as string).toLowerCase().includes('success defined');

// Normalize release names by removing "Release " prefix (handles multiple occurrences)
const normalizeReleaseName = (name: string): string => {
    if (!name) return name;
    let normalized = name.trim();
    while (normalized.toLowerCase().startsWith('release ')) {
        normalized = normalized.substring(8).trim();
    }
    return normalized;
};

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for job execution

export async function GET(request: NextRequest) {
    try {
        // Verify this is a legitimate cron request (optional: add auth header check)
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Use admin client for cron jobs to bypass RLS since there's no authenticated user context
        const supabase = createAdminClient();
        const settings = await getSettings(supabase);
        
        // Check for test_email query parameter to filter to a single user
        const testEmail = request.nextUrl.searchParams.get('test_email')?.toLowerCase();

        // Get nudge frequency settings (same for Slack and Email)
        const nudge1WeekBefore = settings.slack_nudge_1_week_before ?? true;
        const nudgeOnDueDate = settings.slack_nudge_on_due_date ?? true;
        const nudgeDailyAfter = settings.slack_nudge_daily_after_due ?? true;
        
        // Check if email notifications are enabled
        const emailNotificationsEnabled = settings.email_notifications_enabled !== false;
        const emailCriteriaNudgeEnabled = settings.email_criteria_nudge !== false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString().split('T')[0];

        const oneWeekFromNow = new Date(today);
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        const oneWeekFromNowStr = oneWeekFromNow.toISOString().split('T')[0];

        // Build query conditions for criteria that need nudging
        const conditions: string[] = [];

        if (nudge1WeekBefore) {
            conditions.push(`condition_due_date.eq.${oneWeekFromNowStr}`);
        }

        if (nudgeOnDueDate) {
            conditions.push(`condition_due_date.eq.${todayStr}`);
        }

        if (nudgeDailyAfter) {
            conditions.push(`condition_due_date.lt.${todayStr}`);
        }

        if (conditions.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No nudge types enabled',
                count: 0,
            });
        }

        // Query criteria that match nudge conditions
        // We'll need to query separately for each condition type since Supabase doesn't support OR queries easily
        const allCriteria: any[] = [];
        
        // Helper function to check if epic has cleargo_candidate = "Yes"
        // Returns false for "No", null, undefined, or missing values
        const isClearGOCandidate = (epic: any): boolean => {
            const epicId = epic?.id || 'unknown';
            const epicName = epic?.name || 'unknown';
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:82',message:'isClearGOCandidate called',data:{epicId,epicName,hasAhaFields:!!epic?.aha_fields,ahaFieldsType:typeof epic?.aha_fields,ahaFieldsKeys:epic?.aha_fields?Object.keys(epic.aha_fields):null,cleargoCandidatePath1:epic?.aha_fields?.custom_fields?.cleargo_candidate,cleargoCandidatePath2:epic?.aha_fields?.cleargo_candidate},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            // Check if epic has aha_fields
            if (!epic?.aha_fields) {
                // Epic has no aha_fields - exclude it (shouldn't happen for synced epics)
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:85',message:'No aha_fields - EXCLUDING',data:{epicId,epicName},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return false;
            }
            
            if (typeof epic.aha_fields !== 'object') {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:90',message:'aha_fields not object - EXCLUDING',data:{epicId,epicName,ahaFieldsType:typeof epic.aha_fields},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return false;
            }
            
            // Try multiple possible structures for aha_fields
            // Structure 1: aha_fields.custom_fields.cleargo_candidate (expected structure)
            let customFields = epic.aha_fields.custom_fields;
            
            // Structure 2: aha_fields might be the custom_fields directly (legacy)
            if (!customFields && typeof epic.aha_fields === 'object') {
                // Check if cleargo_candidate is directly in aha_fields
                if ('cleargo_candidate' in epic.aha_fields) {
                    customFields = epic.aha_fields;
                }
            }
            
            if (!customFields || typeof customFields !== 'object') {
                // No custom_fields found - exclude epic
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:107',message:'No custom_fields found - EXCLUDING',data:{epicId,epicName,hasCustomFields:!!epic.aha_fields.custom_fields,customFieldsType:typeof epic.aha_fields.custom_fields},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return false;
            }
            
            const cleargoCandidate = customFields.cleargo_candidate;
            
            // Handle case-insensitive comparison and various formats
            const normalizedValue = typeof cleargoCandidate === 'string' 
                ? cleargoCandidate.trim() 
                : cleargoCandidate;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:110',message:'Checking cleargo_candidate value',data:{epicId,epicName,cleargoCandidate,normalizedValue,cleargoCandidateType:typeof cleargoCandidate},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            // Explicitly exclude "No", null, undefined, false, and only include "Yes" or true
            if (normalizedValue === null || normalizedValue === undefined) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:118',message:'cleargo_candidate is null/undefined - EXCLUDING',data:{epicId,epicName},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return false;
            }
            if (normalizedValue === false) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:121',message:'cleargo_candidate is false - EXCLUDING',data:{epicId,epicName},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return false;
            }
            if (typeof normalizedValue === 'string') {
                const lowerValue = normalizedValue.toLowerCase();
                // Exclude: "no", "false", empty string, or any other value that's not "yes"
                if (lowerValue === 'no' || lowerValue === 'false' || lowerValue === '') {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:127',message:'cleargo_candidate is "no"/"false"/empty - EXCLUDING',data:{epicId,epicName,lowerValue},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    return false;
                }
                // Only return true for "Yes" or "Yes - UI Framework" (case-insensitive)
                if (lowerValue === 'yes' || lowerValue === 'yes - ui framework') {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:131',message:'cleargo_candidate is "yes" - INCLUDING',data:{epicId,epicName,lowerValue},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                    // #endregion
                    return true;
                }
                // Any other string value is not "Yes", so exclude
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:135',message:'cleargo_candidate is other string value - EXCLUDING',data:{epicId,epicName,lowerValue},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
                // #endregion
                return false;
            }
            
            // For boolean values, only true is acceptable
            const result = normalizedValue === true;
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:139',message:'Boolean cleargo_candidate check',data:{epicId,epicName,normalizedValue,result},timestamp:Date.now(),runId:'debug1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            return result;
        };

        // When test_email is provided, we want to see ALL criteria for that user, even if already nudged today
        // So we'll skip the last_nudge_sent_at filter in test mode
        const shouldFilterByNudgeDate = !testEmail;

        if (nudge1WeekBefore) {
            let query = supabase
                .from('epic_criterion_status')
                .select(
                    `
                    id,
                    epic_id,
                    criterion_id,
                    decision_owner_id,
                    condition_due_date,
                    status,
                    last_nudge_sent_at,
                    criterion:criterion_id (
                        label,
                        category
                    ),
                    epic:epic_id (
                        name,
                        aha_fields
                    ),
                    decision_owner:decision_owner_id (
                        id,
                        email,
                        first_name,
                        last_name,
                        slack_handle
                    )
                `
                )
                .eq('condition_due_date', oneWeekFromNowStr)
                .in('status', ['NOT_SET', 'CONDITIONAL'])
                .not('decision_owner_id', 'is', null);
            
            if (shouldFilterByNudgeDate) {
                query = query.or(`last_nudge_sent_at.is.null,last_nudge_sent_at.lt.${todayStr}`);
            }
            
            const { data: weekBeforeCriteria, error: weekError } = await query;

            if (weekError) {
                console.error('Error fetching 1-week-before criteria:', weekError);
            } else if (weekBeforeCriteria) {
                allCriteria.push(
                    ...weekBeforeCriteria.map((c: any) => ({ ...c, nudgeType: '1_week_before' }))
                );
            }
        }

        if (nudgeOnDueDate) {
            let query = supabase
                .from('epic_criterion_status')
                .select(
                    `
                    id,
                    epic_id,
                    criterion_id,
                    decision_owner_id,
                    condition_due_date,
                    status,
                    last_nudge_sent_at,
                    criterion:criterion_id (
                        label,
                        category
                    ),
                    epic:epic_id (
                        name,
                        aha_fields
                    ),
                    decision_owner:decision_owner_id (
                        id,
                        email,
                        first_name,
                        last_name,
                        slack_handle
                    )
                `
                )
                .eq('condition_due_date', todayStr)
                .in('status', ['NOT_SET', 'CONDITIONAL'])
                .not('decision_owner_id', 'is', null);
            
            if (shouldFilterByNudgeDate) {
                query = query.or(`last_nudge_sent_at.is.null,last_nudge_sent_at.lt.${todayStr}`);
            }
            
            const { data: dueDateCriteria, error: dueError } = await query;

            if (dueError) {
                console.error('Error fetching due-date criteria:', dueError);
            } else if (dueDateCriteria) {
                allCriteria.push(...dueDateCriteria.map((c: any) => ({ ...c, nudgeType: 'on_due_date' })));
            }
        }

        if (nudgeDailyAfter) {
            // For daily after nudges, only include criteria that haven't been nudged today
            // or haven't been nudged at all (last_nudge_sent_at is null)
            // Unless test_email is provided, then show all criteria
            let query = supabase
                .from('epic_criterion_status')
                .select(
                    `
                    id,
                    epic_id,
                    criterion_id,
                    decision_owner_id,
                    condition_due_date,
                    status,
                    last_nudge_sent_at,
                    criterion:criterion_id (
                        label,
                        category
                    ),
                    epic:epic_id (
                        name,
                        aha_fields
                    ),
                    decision_owner:decision_owner_id (
                        id,
                        email,
                        first_name,
                        last_name,
                        slack_handle
                    )
                `
                )
                .lt('condition_due_date', todayStr)
                .in('status', ['NOT_SET', 'CONDITIONAL'])
                .not('decision_owner_id', 'is', null);
            
            if (shouldFilterByNudgeDate) {
                query = query.or(`last_nudge_sent_at.is.null,last_nudge_sent_at.lt.${todayStr}`);
            }
            
            const { data: overdueCriteria, error: overdueError } = await query;

            if (overdueError) {
                console.error('Error fetching overdue criteria:', overdueError);
            } else if (overdueCriteria) {
                allCriteria.push(...overdueCriteria.map((c: any) => ({ ...c, nudgeType: 'daily_after' })));
            }
        }

        // Debug: If test_email is provided and no criteria found, check what's in the database
        let debugInfo: any = null;
        // Note: We check allCriteria.length here (before cleargo_candidate filter) for debug purposes
        if (allCriteria.length === 0 && testEmail) {
            debugInfo = { test_email: testEmail };
            
            // Query to see what criteria exist for this user
            // Use admin client (already created above) to bypass RLS since this is a cron job
            const { data: userDataArray, error: userError } = await supabase
                .from('app_user')
                .select('id, email')
                .ilike('email', testEmail)
                .limit(1);
            
            const userData = userDataArray && userDataArray.length > 0 ? userDataArray[0] : null;
            
            if (userError) {
                debugInfo.user_found = false;
                debugInfo.user_error = userError.message;
                debugInfo.user_error_code = userError.code;
                console.log(`   Error querying user ${testEmail}:`, userError.message);
            } else if (!userData) {
                debugInfo.user_found = false;
                debugInfo.user_error = 'User not found in app_user table';
                debugInfo.note = `No user found with email "${testEmail}". The user must exist in the app_user table to receive nudges.`;
                debugInfo.suggestion = 'Ensure the user has logged in at least once, or create the user record in the app_user table.';
                
                // Also check for overdue criteria without decision_owner_id to help diagnose
                // Use admin client (already created above) to bypass RLS
                const { data: criteriaWithoutOwner } = await supabase
                    .from('epic_criterion_status')
                    .select(`
                        id,
                        condition_due_date,
                        status,
                        decision_owner_id,
                        criterion:criterion_id (label),
                        epic:epic_id (name)
                    `)
                    .lt('condition_due_date', todayStr)
                    .is('decision_owner_id', null)
                    .limit(5);
                
                debugInfo.overdue_criteria_without_owner = criteriaWithoutOwner?.length || 0;
                if (criteriaWithoutOwner && criteriaWithoutOwner.length > 0) {
                    debugInfo.sample_unassigned_criteria = criteriaWithoutOwner.slice(0, 5).map((c: any) => ({
                        criterion: c.criterion?.label || 'Unknown',
                        epic: c.epic?.name || 'Unknown',
                        status: c.status,
                        due_date: c.condition_due_date
                    }));
                }
                
                console.log(`   User ${testEmail} not found in database`);
            } else {
                debugInfo.user_found = true;
                debugInfo.user_id = userData.id;
                
                // Check for overdue criteria assigned to this user
                // Use admin client (already created above) to bypass RLS
                const { data: debugCriteria, error: debugError } = await supabase
                    .from('epic_criterion_status')
                    .select(`
                        id,
                        epic_id,
                        criterion_id,
                        decision_owner_id,
                        condition_due_date,
                        status,
                        last_nudge_sent_at,
                        criterion:criterion_id (label),
                        epic:epic_id (name)
                    `)
                    .eq('decision_owner_id', userData.id)
                    .lt('condition_due_date', todayStr);
                
                debugInfo.overdue_criteria_assigned = debugCriteria?.length || 0;
                console.log(`🔍 DEBUG for ${testEmail} (user_id: ${userData.id}):`);
                console.log(`   Found ${debugCriteria?.length || 0} overdue criteria assigned to this user`);
                
                if (debugCriteria && debugCriteria.length > 0) {
                    const statusBreakdown = debugCriteria.reduce((acc: any, c: any) => {
                        acc[c.status] = (acc[c.status] || 0) + 1;
                        return acc;
                    }, {});
                    debugInfo.status_breakdown = statusBreakdown;
                    debugInfo.not_set_or_conditional_count = debugCriteria.filter((c: any) => ['NOT_SET', 'CONDITIONAL'].includes(c.status)).length;
                    debugInfo.can_be_nudged_count = debugCriteria.filter((c: any) => {
                        const correctStatus = ['NOT_SET', 'CONDITIONAL'].includes(c.status);
                        const notNudgedToday = !c.last_nudge_sent_at || c.last_nudge_sent_at < todayStr;
                        return correctStatus && notNudgedToday;
                    }).length;
                    
                    console.log(`   Status breakdown:`, statusBreakdown);
                    console.log(`   Criteria with NOT_SET or CONDITIONAL: ${debugInfo.not_set_or_conditional_count}`);
                    console.log(`   Criteria that can be nudged: ${debugInfo.can_be_nudged_count}`);
                    
                    // Show first few examples
                    debugInfo.sample_criteria = debugCriteria.slice(0, 5).map((c: any) => ({
                        criterion: c.criterion?.label || 'Unknown',
                        epic: c.epic?.name || 'Unknown',
                        status: c.status,
                        due_date: c.condition_due_date,
                        last_nudge: c.last_nudge_sent_at || 'never',
                        can_be_nudged: ['NOT_SET', 'CONDITIONAL'].includes(c.status) && (!c.last_nudge_sent_at || c.last_nudge_sent_at < todayStr)
                    }));
                } else {
                    // Check if there are overdue criteria without decision_owner_id
                    // Use admin client (already created above) to bypass RLS
                    const { data: criteriaWithoutOwner } = await supabase
                        .from('epic_criterion_status')
                        .select(`
                            id,
                            condition_due_date,
                            status,
                            decision_owner_id,
                            criterion:criterion_id (label),
                            epic:epic_id (name)
                        `)
                        .lt('condition_due_date', todayStr)
                        .is('decision_owner_id', null)
                        .limit(5);
                    
                    debugInfo.overdue_criteria_without_owner = criteriaWithoutOwner?.length || 0;
                    if (criteriaWithoutOwner && criteriaWithoutOwner.length > 0) {
                        console.log(`   ⚠️  Found ${criteriaWithoutOwner.length} overdue criteria WITHOUT decision_owner_id`);
                        debugInfo.sample_unassigned_criteria = criteriaWithoutOwner.slice(0, 5).map((c: any) => ({
                            criterion: c.criterion?.label || 'Unknown',
                            epic: c.epic?.name || 'Unknown',
                            status: c.status,
                            due_date: c.condition_due_date
                        }));
                    } else {
                        console.log(`   No overdue criteria found for this user`);
                    }
                }
            }
        }
        
        // Filter out criteria for epics where cleargo_candidate is not "Yes" (i.e., 'no' or null)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:429',message:'Starting cleargo_candidate filter',data:{totalCriteria:allCriteria.length,sampleEpics:allCriteria.slice(0,3).map((c:any)=>({epicId:c.epic_id,epicName:c.epic?.name,cleargoCandidate:c.epic?.aha_fields?.custom_fields?.cleargo_candidate}))},timestamp:Date.now(),runId:'debug1',hypothesisId:'G'})}).catch(()=>{});
        // #endregion
        const filteredByClearGOCandidate = allCriteria.filter((c: any) => {
            const epic = c.epic;
            if (!epic) {
                console.warn(`⚠️ Criterion ${c.id} has no epic data, excluding from reminders`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:432',message:'Criterion has no epic - EXCLUDING',data:{criterionId:c.id,epicId:c.epic_id},timestamp:Date.now(),runId:'debug1',hypothesisId:'H'})}).catch(()=>{});
                // #endregion
                return false; // Exclude if epic not found
            }
            
            const isCandidate = isClearGOCandidate(epic);
            const epicId = c.epic_id || epic?.id || 'no-id';
            const epicName = epic?.name || 'unknown';
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:442',message:'Filter check result',data:{epicId,epicName,criterionId:c.id,isCandidate,cleargoCandidate:epic?.aha_fields?.custom_fields?.cleargo_candidate,cleargoCandidateDirect:epic?.aha_fields?.cleargo_candidate},timestamp:Date.now(),runId:'debug1',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            // Debug logging for epics that are being excluded
            if (!isCandidate) {
                const cleargoValue = epic?.aha_fields?.custom_fields?.cleargo_candidate;
                console.log(`🚫 Excluding epic "${epic.name}" (${epicId}) - cleargo_candidate: ${JSON.stringify(cleargoValue)}, aha_fields structure: ${JSON.stringify(Object.keys(epic?.aha_fields || {}))}`);
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:449',message:'Epic cleargo_candidate is not Yes - EXCLUDING',data:{epicId,epicName:epic.name,cleargoValue,criterionId:c.id},timestamp:Date.now(),runId:'debug1',hypothesisId:'I'})}).catch(()=>{});
                // #endregion
            }
            
            return isCandidate;
        });
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:446',message:'After cleargo_candidate filter',data:{before:allCriteria.length,after:filteredByClearGOCandidate.length,excluded:allCriteria.length-filteredByClearGOCandidate.length},timestamp:Date.now(),runId:'debug1',hypothesisId:'J'})}).catch(()=>{});
        // #endregion
        
        if (filteredByClearGOCandidate.length !== allCriteria.length) {
            const excludedCount = allCriteria.length - filteredByClearGOCandidate.length;
            console.log(`📋 Filtered ${excludedCount} criteria from epics where cleargo_candidate is not "Yes"`);
            
            // Log examples of excluded epics for debugging
            const excludedEpics = new Set<string>();
            allCriteria.forEach((c: any) => {
                if (!filteredByClearGOCandidate.includes(c)) {
                    const epic = c.epic;
                    if (epic?.name) {
                        const epicId = c.epic_id || epic?.id || 'no-id';
                        const cleargoValue = epic?.aha_fields?.custom_fields?.cleargo_candidate;
                        excludedEpics.add(`${epic.name} (ID: ${epicId}, cleargo_candidate: ${JSON.stringify(cleargoValue)})`);
                    }
                }
            });
            if (excludedEpics.size > 0 && excludedEpics.size <= 5) {
                console.log(`   Excluded epics: ${Array.from(excludedEpics).join(', ')}`);
            }
        }
        
        if (filteredByClearGOCandidate.length === 0) {
            const response: any = {
                success: true,
                message: testEmail 
                    ? `No criteria need nudging for ${testEmail}. See debug_info for details.`
                    : 'No criteria need nudging',
                count: 0,
            };
            
            // Always include debug_info when test_email is provided
            if (testEmail) {
                response.debug_info = debugInfo || { test_email: testEmail, note: 'Debug info collection failed or was skipped' };
            }
            
            return NextResponse.json(response);
        }
        
        // Use filtered criteria going forward
        const allCriteriaFiltered = filteredByClearGOCandidate;

        // If test_email is provided, filter allCriteriaFiltered to only that user's criteria
        // This ensures we see their criteria even if they've been nudged today
        let criteriaToProcess = allCriteriaFiltered;
        if (testEmail) {
            criteriaToProcess = allCriteriaFiltered.filter((c: any) => {
                const ownerEmail = c.decision_owner?.email?.toLowerCase();
                return ownerEmail === testEmail;
            });
            console.log(`🧪 TEST MODE: Filtered ${allCriteriaFiltered.length} total criteria to ${criteriaToProcess.length} for ${testEmail}`);
        }

        // Filter out criteria for epics with past release dates or released status
        // Rules:
        // - Past release date / released status → exclude ALL criteria reminders
        // - Future/today release date → include all criteria reminders
        const epicIds = [...new Set(criteriaToProcess.map((c: any) => c.epic_id))];
        if (epicIds.length > 0) {
            // #region agent log
            debugLog('route.ts:570', 'Re-fetching epic data for release date filter', {epicIds:epicIds.slice(0,10),epicIdsCount:epicIds.length,criteriaCount:criteriaToProcess.length}, 'B');
            // #endregion
            const { data: epicsWithReleases } = await supabase
                .from('epic')
                .select('id, aha_fields, status')
                .in('id', epicIds);
            // #region agent log
            if (epicsWithReleases) {
                debugLog('route.ts:575', 'Re-fetched epic data', {fetchedCount:epicsWithReleases.length,epics:epicsWithReleases.slice(0,5).map((e:any)=>({id:e.id,cleargoCandidate:e.aha_fields?.custom_fields?.cleargo_candidate,status:e.status}))}, 'B');
            }
            // #endregion
            
            const { data: releasesData } = await supabase
                .from('release_schedule')
                .select('release_name, launch_date')
                .eq('archived', false);
            
            const releaseToDate = new Map<string, string | null>();
            // Normalize release names: create a map with both original and normalized versions
            // This handles cases where epics have "Release 2026.2" but DB has "2026.2" or vice versa
            if (releasesData) {
                for (const release of releasesData) {
                    const originalName = release.release_name;
                    const normalizedName = normalizeReleaseName(originalName);
                    // Store both original and normalized versions
                    releaseToDate.set(originalName, release.launch_date);
                    if (normalizedName !== originalName) {
                        releaseToDate.set(normalizedName, release.launch_date);
                    }
                }
            }
            
            // #region agent log
            const release2026_2InMap = Array.from(releaseToDate.keys()).filter(rn => rn.includes('2026.2'));
            const all2026_2Variants = [
                ...Array.from(releaseToDate.keys()).filter(rn => rn.includes('2026.2')),
                ...Array.from(releaseToDate.keys()).filter(rn => normalizeReleaseName(rn).includes('2026.2'))
            ];
            console.log('🗓️ RELEASE DATE MAP DEBUG:', {
                releaseCount: releaseToDate.size,
                allReleaseNames: Array.from(releaseToDate.keys()),
                release2026_2Entries: release2026_2InMap.map(rn => ({name: rn, date: releaseToDate.get(rn), normalized: normalizeReleaseName(rn)})),
                all2026_2Variants: [...new Set(all2026_2Variants)].map(rn => ({name: rn, date: releaseToDate.get(rn)})),
                today: todayStr,
                todayObj: today.toISOString()
            });
            debugLog('route.ts:586', 'Release date map built', {releaseCount:releaseToDate.size,allReleaseNames:Array.from(releaseToDate.keys()),release2026_2Entries:release2026_2InMap.map(rn => ({name: rn, date: releaseToDate.get(rn)})),today:todayStr}, 'A');
            // #endregion
            
            // Released statuses that indicate past release
            const releasedStatuses = ['Released_Cohort_1', 'Released_GA', 'Released_Retroed'];
            
            // Filter criteria: exclude past releases and released epics
            const beforeFilterCount = criteriaToProcess.length;
            criteriaToProcess = criteriaToProcess.filter((c: any) => {
                const epic = epicsWithReleases?.find((e: any) => e.id === c.epic_id);
                if (!epic) {
                    // #region agent log
                    debugLog('route.ts:598', 'Epic not found in DB', {criterionId:c.id,epicId:c.epic_id,epicName:c.epic?.name}, 'B');
                    // #endregion
                    return true; // Keep if epic not found (shouldn't happen)
                }
                
                // Check if epic has released status
                if (epic.status && releasedStatuses.includes(epic.status)) {
                    // #region agent log
                    debugLog('route.ts:606', 'Epic has released status - EXCLUDING', {epicId:epic.id,epicStatus:epic.status,criterionId:c.id,epicName:c.epic?.name}, 'C');
                    // #endregion
                    return false; // Exclude criteria for released epics
                }
                
                // Check release date
                const releaseName = getReleaseNameFromEpic({ ...epic, name: '', tier: null, status: '', created_at: '', updated_at: '' } as any);
                if (!releaseName) {
                    // #region agent log
                    debugLog('route.ts:613', 'No release name found - KEEPING', {epicId:epic.id,criterionId:c.id,epicName:c.epic?.name,ahaFieldsKeys:Object.keys(epic.aha_fields||{}),ahaFieldsSample:JSON.stringify(epic.aha_fields).substring(0,200)}, 'D');
                    // #endregion
                    return true; // Keep if no release assigned
                }
                
                // Normalize release name for lookup (handle "Release " prefix variations)
                const normalizedReleaseName = normalizeReleaseName(releaseName);
                
                // Try both original and normalized names, plus fuzzy matching for edge cases
                let releaseDate = releaseToDate.get(releaseName) || releaseToDate.get(normalizedReleaseName);
                
                // If still not found, try fuzzy matching (case-insensitive contains)
                if (!releaseDate) {
                    for (const [dbReleaseName, dbDate] of releaseToDate.entries()) {
                        const dbNormalized = normalizeReleaseName(dbReleaseName);
                        if (normalizedReleaseName.toLowerCase() === dbNormalized.toLowerCase() ||
                            normalizedReleaseName.toLowerCase() === dbReleaseName.toLowerCase() ||
                            releaseName.toLowerCase() === dbReleaseName.toLowerCase()) {
                            releaseDate = dbDate;
                            break;
                        }
                    }
                }
                
                // #region agent log
                const releaseNameInMap = releaseToDate.has(releaseName) || releaseToDate.has(normalizedReleaseName);
                const is2026_2 = releaseName.includes('2026.2') || normalizedReleaseName.includes('2026.2');
                if (is2026_2) {
                    const all2026_2InDb = Array.from(releaseToDate.keys()).filter(rn => {
                        const rnNorm = normalizeReleaseName(rn);
                        return rn.includes('2026.2') || rnNorm.includes('2026.2');
                    });
                    console.log('🔍 RELEASE 2026.2 MATCH CHECK:', {
                        epicId: epic.id,
                        epicName: c.epic?.name,
                        releaseName,
                        normalizedReleaseName,
                        releaseNameFound: releaseToDate.has(releaseName),
                        normalizedNameFound: releaseToDate.has(normalizedReleaseName),
                        releaseDate,
                        all2026_2Releases: all2026_2InDb.map(rn => ({name: rn, date: releaseToDate.get(rn), normalized: normalizeReleaseName(rn)})),
                        matchedViaFuzzy: !releaseToDate.has(releaseName) && !releaseToDate.has(normalizedReleaseName) && !!releaseDate
                    });
                }
                debugLog('route.ts:620', 'Checking release name match', {epicId:epic.id,releaseName,normalizedReleaseName,releaseNameInMap,releaseNameFound:releaseToDate.has(releaseName),normalizedNameFound:releaseToDate.has(normalizedReleaseName),allReleaseNames:Array.from(releaseToDate.keys()).filter(rn=>rn.includes('2026.2')||normalizedReleaseName.includes(rn)||rn.includes(normalizedReleaseName)),criterionId:c.id,epicName:c.epic?.name}, 'M');
                // #endregion
                if (!releaseDate) {
                    // #region agent log
                    if (is2026_2) {
                        console.log('⚠️ RELEASE 2026.2 HAS NO DATE - KEEPING:', {
                            epicId: epic.id,
                            epicName: c.epic?.name,
                            releaseName,
                            normalizedReleaseName,
                            closestMatches: Array.from(releaseToDate.keys()).filter((rn:string)=>{
                                const rnNorm = normalizeReleaseName(rn);
                                return rn.toLowerCase().includes(releaseName.toLowerCase()) || 
                                       releaseName.toLowerCase().includes(rn.toLowerCase()) ||
                                       rnNorm.toLowerCase().includes(normalizedReleaseName.toLowerCase()) ||
                                       normalizedReleaseName.toLowerCase().includes(rnNorm.toLowerCase());
                            })
                        });
                    }
                    debugLog('route.ts:625', 'Release has no date - KEEPING', {epicId:epic.id,releaseName,releaseNameInMap,closestMatches:Array.from(releaseToDate.keys()).filter((rn:string)=>rn.toLowerCase().includes(releaseName.toLowerCase())||releaseName.toLowerCase().includes(rn.toLowerCase())),criterionId:c.id,epicName:c.epic?.name}, 'E');
                    // #endregion
                    return true; // Keep if release has no date
                }
                
                const releaseDateObj = new Date(releaseDate);
                releaseDateObj.setHours(0, 0, 0, 0);
                
                // #region agent log
                const daysDiff = Math.ceil((releaseDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                const willExclude = releaseDateObj < today;
                if (is2026_2) {
                    console.log('📅 RELEASE 2026.2 DATE CHECK:', {
                        epicId: epic.id,
                        epicName: c.epic?.name,
                        releaseName,
                        releaseDate,
                        releaseDateObj: releaseDateObj.toISOString(),
                        today: today.toISOString(),
                        daysDiff,
                        willExclude,
                        action: willExclude ? 'EXCLUDING (PAST)' : 'KEEPING (FUTURE/TODAY)'
                    });
                }
                debugLog('route.ts:634', 'Checking release date', {epicId:epic.id,releaseName,releaseDate,releaseDateObj:releaseDateObj.toISOString(),today:today.toISOString(),daysDiff,willExclude,action:willExclude?'EXCLUDING':'KEEPING',criterionId:c.id,epicName:c.epic?.name}, 'F');
                // #endregion
                
                // Past release: only notify for Success Defined criterion that is still due (not GO)
                if (willExclude) {
                    return isSuccessDefinedCriterion(c) && c.status !== 'GO';
                }
                
                // Today or future: exclude items rated n/a (consistent with Home list)
                return c.status !== 'NOT_APPLICABLE';
            });
            
            console.log(`📅 Filtered criteria: ${beforeFilterCount} -> ${criteriaToProcess.length} (excluded past releases and released status epics)`);
            // #region agent log
            debugLog('route.ts:653', 'After past release filter', {before:beforeFilterCount,after:criteriaToProcess.length,excluded:beforeFilterCount-criteriaToProcess.length}, 'K');
            // #endregion
        }

        // Add missing metrics reminders for Product Managers on past releases
        // Rules:
        // - Past release date + missing metrics + track_offline = false → include "missing metrics" reminder for PM
        // - Past release date + missing metrics + track_offline = true → exclude
        // - Past release date + has metrics → exclude
        // Note: We need to check ALL epics (not just those in allCriteriaFiltered) to find past releases with missing metrics
        // But we still filter by cleargo_candidate = "Yes" in the loop below
        const allEpicIdsForMissingMetrics = [...new Set(allCriteria.map((c: any) => c.epic_id))];
        if (allEpicIdsForMissingMetrics.length > 0) {
            const { data: allEpics } = await supabase
                .from('epic')
                .select('id, aha_fields, status, name')
                .in('id', allEpicIdsForMissingMetrics);
            
            const { data: allReleasesData } = await supabase
                .from('release_schedule')
                .select('release_name, launch_date')
                .eq('archived', false);
            
            const allReleaseToDate = new Map<string, string | null>();
            if (allReleasesData) {
                for (const release of allReleasesData) {
                    allReleaseToDate.set(release.release_name, release.launch_date);
                }
            }
            
            // Get track_offline status for all epics
            const { data: allSuccessConfigs } = await supabase
                .from('epic_success_configs')
                .select('epic_id, track_offline')
                .in('epic_id', allEpicIdsForMissingMetrics);
            
            const allTrackOfflineByEpic = new Map<string, boolean>();
            if (allSuccessConfigs) {
                for (const config of allSuccessConfigs) {
                    allTrackOfflineByEpic.set(config.epic_id, config.track_offline === true);
                }
            }
            
            // Get epics that have metrics configured
            const { data: allEpicsWithMetrics } = await supabase
                .from('epic_success_metrics')
                .select('epic_id')
                .in('epic_id', allEpicIdsForMissingMetrics);
            
            const allEpicsWithMetricsSet = new Set<string>();
            if (allEpicsWithMetrics) {
                for (const metric of allEpicsWithMetrics) {
                    allEpicsWithMetricsSet.add(metric.epic_id);
                }
            }
            
            // Get "Success Defined" criterion due dates for epics
            const { data: successDefinedCriteria } = await supabase
                .from('epic_criterion_status')
                .select(`
                    epic_id,
                    condition_due_date,
                    criterion:criterion_id(label)
                `)
                .in('epic_id', allEpicIdsForMissingMetrics);
            
            const successDefinedDueDateByEpic = new Map<string, string | null>();
            if (successDefinedCriteria) {
                for (const c of successDefinedCriteria) {
                    const criterion = Array.isArray(c.criterion) ? c.criterion[0] : c.criterion;
                    if (criterion?.label && typeof criterion.label === 'string' && criterion.label.toLowerCase().includes('success defined')) {
                        successDefinedDueDateByEpic.set(c.epic_id, c.condition_due_date);
                    }
                }
            }
            
            // Get PM user IDs and user data for epics
            const pmUserIdByEpic = new Map<string, string>();
            const pmUserDataByEpic = new Map<string, any>();
            
            for (const epic of (allEpics || [])) {
                // Skip epics where cleargo_candidate is not "Yes"
                if (!isClearGOCandidate(epic)) continue;
                
                const releaseName = getReleaseNameFromEpic({ ...epic, name: epic.name || '', tier: null, status: epic.status || '', created_at: '', updated_at: '' } as any);
                if (!releaseName) continue;
                
                const releaseDate = allReleaseToDate.get(releaseName);
                if (!releaseDate) continue;
                
                const releaseDateObj = new Date(releaseDate);
                releaseDateObj.setHours(0, 0, 0, 0);
                
                // Only process past releases
                if (releaseDateObj >= today) continue;
                
                // Check if epic is missing metrics and track_offline is false
                const hasMetrics = allEpicsWithMetricsSet.has(epic.id);
                const trackOffline = allTrackOfflineByEpic.get(epic.id) || false;
                
                // Skip if has metrics or tracking offline
                if (hasMetrics || trackOffline) continue;
                
                // Get PM user ID
                const pmUserId = await resolveProductManagerUserId(epic.id);
                if (!pmUserId) continue;
                
                pmUserIdByEpic.set(epic.id, pmUserId);
                
                // Get PM user data
                const { data: pmUser } = await supabase
                    .from('app_user')
                    .select('id, email, first_name, last_name, slack_handle')
                    .eq('id', pmUserId)
                    .single();
                
                if (pmUser) {
                    pmUserDataByEpic.set(epic.id, pmUser);
                }
            }
            
            // Add missing metrics reminders to criteriaToProcess for PMs
            for (const [epicId, pmUser] of pmUserDataByEpic.entries()) {
                const epic = allEpics?.find((e: any) => e.id === epicId);
                if (!epic) continue;
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:720',message:'Adding missing metrics reminder',data:{epicId,epicName:epic.name,cleargoCandidate:epic.aha_fields?.custom_fields?.cleargo_candidate,isCandidate:isClearGOCandidate(epic)},timestamp:Date.now(),runId:'debug1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                
                const successDefinedDueDate = successDefinedDueDateByEpic.get(epicId);
                
                // Create a virtual "missing metrics" criterion reminder
                // Use today as due date, or Success Defined due date if available
                const dueDate = successDefinedDueDate || todayStr;
                
                // Add to criteriaToProcess as a special missing metrics reminder
                criteriaToProcess.push({
                    id: `missing-metrics-${epicId}`,
                    epic_id: epicId,
                    criterion_id: null,
                    condition_due_date: dueDate,
                    status: 'NOT_SET',
                    last_nudge_sent_at: null,
                    nudgeType: 'missing_metrics',
                    criterion: {
                        label: 'Missing Success Metrics',
                        category: 'ANALYTICS_AND_METRICS',
                    },
                    epic: {
                        name: epic.name,
                        aha_fields: epic.aha_fields,
                    },
                    decision_owner: {
                        id: pmUser.id,
                        email: pmUser.email,
                        first_name: pmUser.first_name,
                        last_name: pmUser.last_name,
                        slack_handle: pmUser.slack_handle,
                    },
                });
            }
            
            if (pmUserDataByEpic.size > 0) {
                console.log(`📊 Added ${pmUserDataByEpic.size} missing metrics reminders for PMs on past releases`);
            }
        }

        // Log all notifications before filtering
        // #region agent log
        const release2026_2Criteria = criteriaToProcess.filter((c:any)=>{
            const releaseName = c.epic?.aha_fields?.standard_fields?.aha_release_name || 
                                c.epic?.aha_fields?.standard_fields?.release?.name ||
                                c.epic?.aha_fields?.custom_fields?.release_target_after_pod_planning;
            return releaseName && (releaseName.includes('2026.2') || releaseName.toLowerCase().includes('release 2026.2'));
        });
        console.log('🔍 RELEASE 2026.2 DEBUG:', {
            totalCriteria: criteriaToProcess.length,
            release2026_2Count: release2026_2Criteria.length,
            release2026_2Criteria: release2026_2Criteria.map((c:any)=>({
                epicId: c.epic_id,
                epicName: c.epic?.name,
                criterion: c.criterion?.label,
                dueDate: c.condition_due_date,
                decisionOwner: c.decision_owner?.email,
                releaseName: c.epic?.aha_fields?.standard_fields?.aha_release_name||c.epic?.aha_fields?.custom_fields?.release_target_after_pod_planning
            }))
        });
        debugLog('route.ts:837', 'Final criteria count before notifications', {totalCriteria:criteriaToProcess.length,release2026_2Count:release2026_2Criteria.length,release2026_2Criteria:release2026_2Criteria.map((c:any)=>({epicId:c.epic_id,epicName:c.epic?.name,criterion:c.criterion?.label,dueDate:c.condition_due_date,decisionOwner:c.decision_owner?.email,releaseName:c.epic?.aha_fields?.standard_fields?.aha_release_name||c.epic?.aha_fields?.custom_fields?.release_target_after_pod_planning})),sampleCriteria:criteriaToProcess.slice(0,5).map((c:any)=>({epicId:c.epic_id,epicName:c.epic?.name,criterion:c.criterion?.label,dueDate:c.condition_due_date}))}, 'L');
        // #endregion
        const notificationsByEmail = new Map<string, any[]>();
        for (const c of criteriaToProcess) {
            const ownerEmail = c.decision_owner?.email?.toLowerCase() || 'unknown';
            if (!notificationsByEmail.has(ownerEmail)) {
                notificationsByEmail.set(ownerEmail, []);
            }
            notificationsByEmail.get(ownerEmail)!.push({
                criterion_id: c.criterion_id,
                criterion_label: c.criterion?.label,
                epic_name: c.epic?.name,
                due_date: c.condition_due_date,
                nudge_type: c.nudgeType,
                assignee_email: ownerEmail,
                assignee_name: `${c.decision_owner?.first_name || ''} ${c.decision_owner?.last_name || ''}`.trim() || ownerEmail,
                has_slack_handle: !!c.decision_owner?.slack_handle,
            });
        }

        const uniqueEmails = Array.from(notificationsByEmail.keys()).filter(e => e !== 'unknown');
        const allowedForSlack = new Set<string>();
        
        for (const email of uniqueEmails) {
            if (await canReceiveSlackNotification(email)) allowedForSlack.add(email);
        }
        
        if (testEmail) {
            console.log(`🧪 TEST MODE: Filtering to test email: ${testEmail}`);
        }

        console.log('📋 Slack Nudge Notifications - ALL NOTIFICATIONS (before filtering):');
        console.log(`   Total criteria needing nudges: ${criteriaToProcess.length}${testEmail ? ` (filtered from ${allCriteriaFiltered.length} total)` : ` (${allCriteriaFiltered.length} total)`}`);
        console.log(`   Slack recipients: per-user flag in User Management (${allowedForSlack.size} user(s) enabled)`);
        for (const [email, criteria] of notificationsByEmail.entries()) {
            const firstCriterion = criteriaToProcess.find((c: any) =>
                c.decision_owner?.email?.toLowerCase() === email
            );
            const slackHandle = firstCriterion?.decision_owner?.slack_handle;
            const willSend = allowedForSlack.has(email);
            const status = willSend ? '✅ WILL SEND' : '📝 LOGGED ONLY';
            const nudgeTypes = [...new Set(criteria.map((c) => c.nudge_type))];
            console.log(`   ${status} - ${email} (Slack: ${slackHandle || 'none'}): ${criteria.length} criteria (${nudgeTypes.join(', ')})`);
            if (criteria.length <= 5) {
                criteria.forEach((c) => {
                    console.log(`      - ${c.criterion_label} (${c.epic_name}) - ${c.nudge_type} - Due: ${c.due_date}`);
                });
            } else {
                console.log(`      ... ${criteria.length} criteria (showing first 3)`);
                criteria.slice(0, 3).forEach((c) => {
                    console.log(`      - ${c.criterion_label} (${c.epic_name}) - ${c.nudge_type} - Due: ${c.due_date}`);
                });
            }
        }

        // Filter criteria for Slack (requires per-user flag)
        const filteredCriteriaForSlack = criteriaToProcess.filter((c: any) => {
            const ownerEmail = c.decision_owner?.email?.toLowerCase();
            return ownerEmail && allowedForSlack.has(ownerEmail);
        });

        // Filter criteria for Email (all users, if email notifications are enabled)
        const filteredCriteriaForEmail = emailNotificationsEnabled && emailCriteriaNudgeEnabled
            ? criteriaToProcess.filter((c: any) => {
                const ownerEmail = c.decision_owner?.email?.toLowerCase();
                return !!ownerEmail;
            })
            : [];

        const filteredCriteria = filteredCriteriaForSlack; // Keep for backward compatibility

        if (filteredCriteria.length === 0 && filteredCriteriaForEmail.length === 0) {
            return NextResponse.json({
                success: true,
                message: testEmail 
                    ? `No criteria found for test email ${testEmail} or user doesn't have notifications enabled`
                    : 'No assignees have notifications enabled (all notifications logged)',
                count: 0,
                debug: {
                    total_before_filter: allCriteriaFiltered.length,
                    notifications_by_email: Object.fromEntries(
                        Array.from(notificationsByEmail.entries()).map(([email, criteria]) => [
                            email,
                            {
                                count: criteria.length,
                                nudge_types: [...new Set(criteria.map((c) => c.nudge_type))],
                            },
                        ])
                    ),
                },
            });
        }

        console.log(`✅ Sending Slack notifications to ${filteredCriteria.length} criteria (${criteriaToProcess.length} total were logged)`);
        if (emailNotificationsEnabled && emailCriteriaNudgeEnabled) {
            console.log(`✅ Sending Email notifications to ${filteredCriteriaForEmail.length} criteria`);
        }

        console.log(`✅ After filter: ${filteredCriteria.length} criteria will receive Slack nudges`);

        // Group all criteria by assignee for Slack (one message per user)
        const groupedByAssigneeForSlack = new Map<string, any[]>();
        for (const criterion of filteredCriteria) {
            const ownerEmail = criterion.decision_owner?.email?.toLowerCase();
            if (!ownerEmail) continue;
            
            if (!groupedByAssigneeForSlack.has(ownerEmail)) {
                groupedByAssigneeForSlack.set(ownerEmail, []);
            }
            groupedByAssigneeForSlack.get(ownerEmail)!.push(criterion);
        }

        // Group all criteria by assignee for Email (one message per user)
        const groupedByAssigneeForEmail = new Map<string, any[]>();
        for (const criterion of filteredCriteriaForEmail) {
            const ownerEmail = criterion.decision_owner?.email?.toLowerCase();
            if (!ownerEmail) continue;
            
            if (!groupedByAssigneeForEmail.has(ownerEmail)) {
                groupedByAssigneeForEmail.set(ownerEmail, []);
            }
            groupedByAssigneeForEmail.get(ownerEmail)!.push(criterion);
        }

        // Keep backward compatibility
        const groupedByAssignee = groupedByAssigneeForSlack;

        const notificationsSent: any[] = [];
        const errors: any[] = [];

        // Helper function to add delay between notifications
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Helper function to calculate urgency score (lower = more urgent)
        const getUrgencyScore = (criterion: any): number => {
            const dueDate = criterion.condition_due_date ? new Date(criterion.condition_due_date) : null;
            if (!dueDate) return 999; // No due date = least urgent
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDateNormalized = new Date(dueDate);
            dueDateNormalized.setHours(0, 0, 0, 0);
            
            const daysDiff = Math.ceil((dueDateNormalized.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            // Most overdue = most urgent (negative days, so -100 is more urgent than -1)
            // Then due today (0)
            // Then due in 1 week (7)
            return -daysDiff;
        };

        // Process each assignee (one message per user)
        let notificationCount = 0;
        for (const [email, criteria] of groupedByAssignee.entries()) {
            // Add delay between notifications to avoid rate limiting (500ms between each)
            if (notificationCount > 0) {
                await delay(500);
            }

            // Sort criteria by urgency (most urgent first)
            criteria.sort((a, b) => getUrgencyScore(a) - getUrgencyScore(b));

            // Get user info from first criterion
            const firstCriterion = criteria[0];
            const assigneeId = firstCriterion.decision_owner?.id;
            const assigneeEmail = firstCriterion.decision_owner?.email?.toLowerCase();
            const assigneeName = `${firstCriterion.decision_owner?.first_name || ''} ${firstCriterion.decision_owner?.last_name || ''}`.trim() || assigneeEmail;
            let assigneeSlackHandle = firstCriterion.decision_owner?.slack_handle;

            if (!assigneeSlackHandle) {
                // Try to sync Slack handle before skipping
                console.log(`Attempting to sync Slack handle for ${assigneeEmail}...`);
                const syncedHandle = await syncUserSlackHandle(assigneeEmail!);
                
                if (syncedHandle) {
                    assigneeSlackHandle = syncedHandle;
                    console.log(`Successfully synced Slack handle for ${assigneeEmail}: ${syncedHandle}`);
                } else {
                    console.log(`Skipping nudge for ${assigneeEmail} - no Slack handle found`);
                    continue;
                }
            }

            try {
                // Determine overall priority based on most urgent criterion
                const mostUrgent = criteria[0];
                const mostUrgentDueDate = mostUrgent.condition_due_date ? new Date(mostUrgent.condition_due_date) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                let overallPriority: 'high' | 'medium' = 'medium';
                if (mostUrgentDueDate) {
                    const daysDiff = Math.ceil((mostUrgentDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff < 0) {
                        overallPriority = 'high'; // Overdue = high priority
                    }
                }

                // Extract release names from epics and fetch release dates
                const epicIds = [...new Set(criteria.map(c => c.epic_id))];
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:963',message:'Fetching epic data before sending notification',data:{epicIds,email:assigneeEmail,criteriaCount:criteria.length},timestamp:Date.now(),runId:'debug1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                const { data: epicsData } = await supabase
                    .from('epic')
                    .select('id, name, aha_fields')
                    .in('id', epicIds);
                // #region agent log
                if (epicsData) {
                    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:968',message:'Epic data before sending notification',data:{epics:epicsData.map((e:any)=>({id:e.id,name:e.name,cleargoCandidate:e.aha_fields?.custom_fields?.cleargo_candidate,cleargoCandidateDirect:e.aha_fields?.cleargo_candidate,isCandidate:isClearGOCandidate(e)}))},timestamp:Date.now(),runId:'debug1',hypothesisId:'C'})}).catch(()=>{});
                }
                // #endregion
                
                const epicToRelease = new Map<string, string>();
                const releaseNames = new Set<string>();
                
                if (epicsData) {
                    for (const epic of epicsData) {
                        const releaseName = getReleaseNameFromEpic(epic as any);
                        if (releaseName) {
                            epicToRelease.set(epic.id, releaseName);
                            releaseNames.add(releaseName);
                        }
                    }
                }
                
                // Fetch release dates - need to normalize release names for lookup
                // Build a map of normalized -> original release names for lookup
                const normalizedToOriginal = new Map<string, string>();
                for (const releaseName of releaseNames) {
                    const normalized = normalizeReleaseName(releaseName);
                    if (normalized !== releaseName) {
                        normalizedToOriginal.set(normalized, releaseName);
                    }
                }
                
                // Fetch all releases that might match (original and normalized names)
                const allReleaseNamesToFetch = new Set<string>();
                releaseNames.forEach(rn => {
                    allReleaseNamesToFetch.add(rn);
                    allReleaseNamesToFetch.add(normalizeReleaseName(rn));
                });
                
                const { data: releasesData } = await supabase
                    .from('release_schedule')
                    .select('release_name, launch_date')
                    .in('release_name', Array.from(allReleaseNamesToFetch))
                    .eq('archived', false);
                
                const releaseToDate = new Map<string, string | null>();
                if (releasesData) {
                    for (const release of releasesData) {
                        const originalName = release.release_name;
                        const normalizedName = normalizeReleaseName(originalName);
                        // Store both original and normalized versions
                        releaseToDate.set(originalName, release.launch_date);
                        if (normalizedName !== originalName) {
                            releaseToDate.set(normalizedName, release.launch_date);
                        }
                    }
                }
                
                // Group criteria by release, then by epic within each release
                const criteriaByRelease = new Map<string, Map<string, any[]>>();
                const noReleaseCriteria: any[] = [];
                
                for (const c of criteria) {
                    const releaseName = epicToRelease.get(c.epic_id);
                    if (!releaseName) {
                        noReleaseCriteria.push(c);
                        continue;
                    }
                    
                    // Normalize release name for consistent grouping
                    const normalizedReleaseName = normalizeReleaseName(releaseName);
                    // Use normalized name for grouping, but try to find original name for date lookup
                    const releaseNameForGrouping = releaseToDate.has(releaseName) ? releaseName : 
                                                   (releaseToDate.has(normalizedReleaseName) ? normalizedReleaseName : releaseName);
                    
                    if (!criteriaByRelease.has(releaseNameForGrouping)) {
                        criteriaByRelease.set(releaseNameForGrouping, new Map());
                    }
                    const releaseMap = criteriaByRelease.get(releaseNameForGrouping)!;
                    
                    const epicId = c.epic_id;
                    if (!releaseMap.has(epicId)) {
                        releaseMap.set(epicId, []);
                    }
                    releaseMap.get(epicId)!.push(c);
                }
                
                // Sort releases by launch date (closest future first, then past releases)
                const sortedReleases = Array.from(criteriaByRelease.entries()).sort((a, b) => {
                    // Try both original and normalized names for date lookup
                    const dateA = releaseToDate.get(a[0]) || releaseToDate.get(normalizeReleaseName(a[0]));
                    const dateB = releaseToDate.get(b[0]) || releaseToDate.get(normalizeReleaseName(b[0]));
                    
                    // No date = put at end
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    
                    const dateAObj = new Date(dateA);
                    const dateBObj = new Date(dateB);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // Future releases first (ascending by date)
                    // Then past releases (descending by date)
                    const isAFuture = dateAObj >= today;
                    const isBFuture = dateBObj >= today;
                    
                    if (isAFuture && isBFuture) {
                        return dateAObj.getTime() - dateBObj.getTime(); // Closest future first
                    }
                    if (isAFuture) return -1; // Future before past
                    if (isBFuture) return 1; // Past after future
                    return dateBObj.getTime() - dateAObj.getTime(); // Most recent past first
                });
                
                // Build release groups with epic subgroups
                const releaseGroups: any[] = [];
                
                for (const [releaseName, epicMap] of sortedReleases) {
                    const releaseDate = releaseToDate.get(releaseName);
                    const epicGroups = Array.from(epicMap.entries()).map(([epicId, epicCriteria]) => {
                        const epic = epicCriteria[0].epic;
                        return {
                            epic_id: epicId,
                            epic_name: epic?.name || 'Unknown Epic',
                            criteria: epicCriteria.map((c) => ({
                                id: c.id,
                                criterion_id: c.criterion_id,
                                label: c.criterion?.label || 'Unknown',
                                category: c.criterion?.category || 'Unknown',
                                due_date: c.condition_due_date,
                                status: c.status,
                                nudge_type: c.nudgeType,
                            })),
                        };
                    });
                    
                    releaseGroups.push({
                        release_name: releaseName,
                        release_date: releaseDate,
                        epic_groups: epicGroups,
                    });
                }
                
                // Add criteria without releases at the end
                if (noReleaseCriteria.length > 0) {
                    const noReleaseEpicMap = new Map<string, any[]>();
                    for (const c of noReleaseCriteria) {
                        const epicId = c.epic_id;
                        if (!noReleaseEpicMap.has(epicId)) {
                            noReleaseEpicMap.set(epicId, []);
                        }
                        noReleaseEpicMap.get(epicId)!.push(c);
                    }
                    
                    const noReleaseEpicGroups = Array.from(noReleaseEpicMap.entries()).map(([epicId, epicCriteria]) => {
                        const epic = epicCriteria[0].epic;
                        return {
                            epic_id: epicId,
                            epic_name: epic?.name || 'Unknown Epic',
                            criteria: epicCriteria.map((c) => ({
                                id: c.id,
                                criterion_id: c.criterion_id,
                                label: c.criterion?.label || 'Unknown',
                                category: c.criterion?.category || 'Unknown',
                                due_date: c.condition_due_date,
                                status: c.status,
                                nudge_type: c.nudgeType,
                            })),
                        };
                    });
                    
                    releaseGroups.push({
                        release_name: null,
                        release_date: null,
                        epic_groups: noReleaseEpicGroups,
                    });
                }
                
                // Flatten epic groups for backward compatibility
                const epicGroups = releaseGroups.flatMap(rg => rg.epic_groups);

                // Send Slack notification
                await sendSlackNotification({
                    type: 'criteria_nudge',
                    priority: overallPriority,
                    recipient: {
                        id: assigneeId!,
                        email: assigneeEmail!,
                        slack_handle: assigneeSlackHandle,
                        name: assigneeName,
                    },
                    launch_id: epicGroups[0]?.epic_id, // Use first epic ID for compatibility
                    metadata: {
                        release_groups: releaseGroups,
                        epic_groups: epicGroups, // Keep for backward compatibility
                        total_criteria_count: criteria.length,
                        criteria: criteria.map((c) => ({
                            id: c.id,
                            label: c.criterion?.label || 'Unknown',
                            category: c.criterion?.category || 'Unknown',
                            due_date: c.condition_due_date,
                            epic_id: c.epic_id,
                            epic_name: c.epic?.name || 'Unknown',
                            nudge_type: c.nudgeType,
                        })),
                        nudge_type: 'combined', // Indicates this is a combined message
                    },
                });

                // Send Email notification (if enabled) - reuse release groups from Slack
                if (emailNotificationsEnabled && emailCriteriaNudgeEnabled) {
                    const emailCriteria = groupedByAssigneeForEmail.get(assigneeEmail!);
                    if (emailCriteria && emailCriteria.length > 0) {
                        try {
                            // Reuse the same release groups structure (already built for Slack)
                            // Convert to email format (same structure)
                            await sendEmailNotification({
                                type: 'criteria_nudge',
                                recipientEmail: assigneeEmail!,
                                userId: assigneeId!,
                                metadata: {
                                    recipientName: assigneeName,
                                    release_groups: releaseGroups, // Reuse same release groups
                                    total_criteria_count: emailCriteria.length,
                                    appUrl: process.env.NEXT_PUBLIC_APP_URL || '',
                                },
                            });
                            console.log(`Sent email nudge to ${assigneeEmail} for ${emailCriteria.length} criteria`);
                        } catch (emailError: any) {
                            console.error(`Failed to send email nudge to ${assigneeEmail}:`, emailError);
                        }
                    }
                }

                // Update last_nudge_sent_at for all criteria
                const criterionIds = criteria.map((c) => c.id);
                const { error: updateError } = await supabase
                    .from('epic_criterion_status')
                    .update({ last_nudge_sent_at: todayStr })
                    .in('id', criterionIds);

                if (updateError) {
                    console.error(`Failed to update last_nudge_sent_at for criteria:`, updateError);
                    // Continue anyway - notification was sent
                }

                notificationsSent.push({
                    assignee_email: assigneeEmail,
                    criteria_count: criteria.length,
                    epic_count: epicGroups.length,
                });

                notificationCount++;
                console.log(
                    `Sent combined Slack nudge to ${assigneeEmail} for ${criteria.length} criteria across ${epicGroups.length} epics`
                );
            } catch (error: any) {
                console.error(`Failed to send Slack nudge to ${assigneeEmail}:`, error);
                errors.push({
                    assignee_email: assigneeEmail,
                    error: error.message,
                });
                notificationCount++;
            }
        }

        // Process email-only users (users who don't have Slack enabled but have email enabled)
        if (emailNotificationsEnabled && emailCriteriaNudgeEnabled) {
            for (const [email, criteria] of groupedByAssigneeForEmail.entries()) {
                // Skip if already processed in Slack loop
                if (groupedByAssigneeForSlack.has(email)) {
                    continue;
                }

                // Add delay between notifications
                if (notificationCount > 0) {
                    await delay(500);
                }

                // Sort criteria by urgency
                criteria.sort((a, b) => getUrgencyScore(a) - getUrgencyScore(b));

                const firstCriterion = criteria[0];
                const assigneeId = firstCriterion.decision_owner?.id;
                const assigneeEmail = firstCriterion.decision_owner?.email?.toLowerCase();
                const assigneeName = `${firstCriterion.decision_owner?.first_name || ''} ${firstCriterion.decision_owner?.last_name || ''}`.trim() || assigneeEmail;

                try {
                    // Build release groups for email (same logic as Slack)
                    const emailEpicIds = [...new Set(criteria.map(c => c.epic_id))];
                    const { data: emailEpicsData } = await supabase
                        .from('epic')
                        .select('id, name, aha_fields')
                        .in('id', emailEpicIds);
                    
                    const emailEpicToRelease = new Map<string, string>();
                    const emailReleaseNames = new Set<string>();
                    
                    if (emailEpicsData) {
                        for (const epic of emailEpicsData) {
                            const releaseName = getReleaseNameFromEpic(epic as any);
                            if (releaseName) {
                                emailEpicToRelease.set(epic.id, releaseName);
                                emailReleaseNames.add(releaseName);
                            }
                        }
                    }
                    
                    const { data: emailReleasesData } = await supabase
                        .from('release_schedule')
                        .select('release_name, launch_date')
                        .in('release_name', Array.from(emailReleaseNames))
                        .eq('archived', false);
                    
                    const emailReleaseToDate = new Map<string, string | null>();
                    if (emailReleasesData) {
                        for (const release of emailReleasesData) {
                            emailReleaseToDate.set(release.release_name, release.launch_date);
                        }
                    }
                    
                    // Group email criteria by release
                    const emailCriteriaByRelease = new Map<string, Map<string, any[]>>();
                    const emailNoReleaseCriteria: any[] = [];
                    
                    for (const c of criteria) {
                        const releaseName = emailEpicToRelease.get(c.epic_id);
                        if (!releaseName) {
                            emailNoReleaseCriteria.push(c);
                            continue;
                        }
                        
                        if (!emailCriteriaByRelease.has(releaseName)) {
                            emailCriteriaByRelease.set(releaseName, new Map());
                        }
                        const releaseMap = emailCriteriaByRelease.get(releaseName)!;
                        
                        const epicId = c.epic_id;
                        if (!releaseMap.has(epicId)) {
                            releaseMap.set(epicId, []);
                        }
                        releaseMap.get(epicId)!.push(c);
                    }
                    
                    // Sort releases (same logic as Slack)
                    const emailSortedReleases = Array.from(emailCriteriaByRelease.entries()).sort((a, b) => {
                        const dateA = emailReleaseToDate.get(a[0]);
                        const dateB = emailReleaseToDate.get(b[0]);
                        
                        if (!dateA && !dateB) return 0;
                        if (!dateA) return 1;
                        if (!dateB) return -1;
                        
                        const dateAObj = new Date(dateA);
                        const dateBObj = new Date(dateB);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        
                        const isAFuture = dateAObj >= today;
                        const isBFuture = dateBObj >= today;
                        
                        if (isAFuture && isBFuture) {
                            return dateAObj.getTime() - dateBObj.getTime();
                        }
                        if (isAFuture) return -1;
                        if (isBFuture) return 1;
                        return dateBObj.getTime() - dateAObj.getTime();
                    });
                    
                    // Build email release groups
                    const emailReleaseGroups: any[] = [];
                    
                    for (const [releaseName, epicMap] of emailSortedReleases) {
                        const releaseDate = emailReleaseToDate.get(releaseName);
                        const epicGroups = Array.from(epicMap.entries()).map(([epicId, epicCriteria]) => {
                            const epic = epicCriteria[0].epic;
                            return {
                                epic_id: epicId,
                                epic_name: epic?.name || 'Unknown Epic',
                                criteria: epicCriteria.map((c) => ({
                                    id: c.id,
                                    criterion_id: c.criterion_id,
                                    label: c.criterion?.label || 'Unknown',
                                    category: c.criterion?.category || 'Unknown',
                                    due_date: c.condition_due_date,
                                    status: c.status,
                                    nudge_type: c.nudgeType,
                                })),
                            };
                        });
                        
                        emailReleaseGroups.push({
                            release_name: releaseName,
                            release_date: releaseDate,
                            epic_groups: epicGroups,
                        });
                    }
                    
                    // Add criteria without releases
                    if (emailNoReleaseCriteria.length > 0) {
                        const emailNoReleaseEpicMap = new Map<string, any[]>();
                        for (const c of emailNoReleaseCriteria) {
                            const epicId = c.epic_id;
                            if (!emailNoReleaseEpicMap.has(epicId)) {
                                emailNoReleaseEpicMap.set(epicId, []);
                            }
                            emailNoReleaseEpicMap.get(epicId)!.push(c);
                        }
                        
                        const emailNoReleaseEpicGroups = Array.from(emailNoReleaseEpicMap.entries()).map(([epicId, epicCriteria]) => {
                            const epic = epicCriteria[0].epic;
                            return {
                                epic_id: epicId,
                                epic_name: epic?.name || 'Unknown Epic',
                                criteria: epicCriteria.map((c) => ({
                                    id: c.id,
                                    criterion_id: c.criterion_id,
                                    label: c.criterion?.label || 'Unknown',
                                    category: c.criterion?.category || 'Unknown',
                                    due_date: c.condition_due_date,
                                    status: c.status,
                                    nudge_type: c.nudgeType,
                                })),
                            };
                        });
                        
                        emailReleaseGroups.push({
                            release_name: null,
                            release_date: null,
                            epic_groups: emailNoReleaseEpicGroups,
                        });
                    }
                    
                    await sendEmailNotification({
                        type: 'criteria_nudge',
                        recipientEmail: assigneeEmail!,
                        userId: assigneeId!,
                        metadata: {
                            recipientName: assigneeName,
                            release_groups: emailReleaseGroups,
                            total_criteria_count: criteria.length,
                            appUrl: process.env.NEXT_PUBLIC_APP_URL || '',
                        },
                    });

                    // Update last_nudge_sent_at for all criteria
                    const criterionIds = criteria.map((c) => c.id);
                    const { error: updateError } = await supabase
                        .from('epic_criterion_status')
                        .update({ last_nudge_sent_at: todayStr })
                        .in('id', criterionIds);

                    if (updateError) {
                        console.error(`Failed to update last_nudge_sent_at for criteria:`, updateError);
                    }

                    notificationsSent.push({
                        assignee_email: assigneeEmail,
                        criteria_count: criteria.length,
                        epic_count: emailReleaseGroups.flatMap(rg => rg.epic_groups).length,
                    });

                    notificationCount++;
                    console.log(`Sent email nudge to ${assigneeEmail} for ${criteria.length} criteria`);
                } catch (error: any) {
                    console.error(`Failed to send email nudge to ${assigneeEmail}:`, error);
                    errors.push({
                        assignee_email: assigneeEmail,
                        error: error.message,
                    });
                    notificationCount++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: testEmail 
                ? `🧪 TEST MODE: Processed ${filteredCriteria.length} criteria needing nudges for ${testEmail}`
                : `Processed ${filteredCriteria.length} criteria needing nudges`,
            notifications_sent: notificationsSent.length,
            errors: errors.length,
            details: {
                notifications: notificationsSent,
                errors,
            },
            ...(testEmail && debugInfo ? { debug_info: debugInfo } : {}),
            debug: {
                total_before_filter: allCriteria.length,
                filtered_for_test: testEmail ? criteriaToProcess.length : allCriteria.length,
                filtered_count: filteredCriteria.length,
                notifications_by_email: Object.fromEntries(
                    Array.from(notificationsByEmail.entries()).map(([email, criteria]) => {
                        const firstCriterion = criteriaToProcess.find((c: any) =>
                            c.decision_owner?.email?.toLowerCase() === email
                        );
                        const slackHandle = firstCriterion?.decision_owner?.slack_handle;
                        const willSend = allowedForSlack.has(email);
                        return [
                            email,
                            {
                                count: criteria.length,
                                nudge_types: [...new Set(criteria.map((c) => c.nudge_type))],
                                slack_handle: slackHandle || null,
                                will_send: willSend,
                            },
                        ];
                    })
                ),
            },
        });
    } catch (error: any) {
        console.error('Criteria nudge job error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error.message },
            { status: 500 }
        );
    }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
    return GET(request);
}

