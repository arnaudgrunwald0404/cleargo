import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification, syncUserSlackHandle } from '@/lib/slack/notifications';
import { getEpic } from '@/lib/epics';
import { canRolesPerform, canRolesPerformWithRules } from '@/lib/permissions';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { sendCriteriaAssignmentNotifications } from '@/lib/db/epics';
import { getReleaseNameFromEpic, getEpicsForRelease } from '@/lib/services/releaseAnalyticsService';
import { trackActivityFromAction } from '@/lib/services/userActivityService';

export const dynamic = 'force-dynamic';

export type DelegationType =
  | 'SINGLE_TASK'
  | 'TEMPLATE_SINGLE_TASK'
  | 'CATEGORY_EXCLUDING_GATES'
  | 'CATEGORY_INCLUDING_GATES'
  | 'RELEASE_CATEGORY_INCLUDING_GATES'
  | 'TEMPLATE_EXCLUDING_GATES'
  | 'TEMPLATE_INCLUDING_GATES'
  | 'POST_LAUNCH_OWNER';

interface DelegationRequest {
  delegationType: DelegationType;
  newApproverEmail: string;
  taskId?: string; // epic_criterion_status id (not required for POST_LAUNCH_OWNER)
  category?: string; // Not required for POST_LAUNCH_OWNER
  isGate?: boolean; // Not required for POST_LAUNCH_OWNER
  taskLabel?: string; // Optional task label for notifications
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: DelegationRequest = await req.json();
    const { delegationType, newApproverEmail, taskId, category, isGate, taskLabel } = body;

    // Validate inputs
    if (!delegationType || !newApproverEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // For criteria delegations, require taskId and category
    if (delegationType !== 'POST_LAUNCH_OWNER' && (!taskId || !category)) {
      return NextResponse.json({ error: 'Missing required fields for criteria delegation' }, { status: 400 });
    }

    // Get the new accountable's user info (including Slack handle)
    const { data: newApprover, error: approverError } = await supabase
      .from('app_user')
      .select('id, email, first_name, last_name, slack_handle')
      .eq('email', newApproverEmail)
      .single();

    if (approverError || !newApprover) {
      return NextResponse.json({ error: 'New accountable not found' }, { status: 404 });
    }

    const newApproverId = newApprover.id;

    // Get delegator's user ID and roles
    const { data: delegator } = await supabase
      .from('app_user')
      .select('id, first_name, last_name, email, roles')
      .eq('email', user.email)
      .single();

    if (!delegator) {
      return NextResponse.json({ error: 'Delegator not found' }, { status: 404 });
    }

    const delegatorId = delegator.id;
    const delegatorName = `${delegator.first_name || ''} ${delegator.last_name || ''}`.trim() || delegator.email;
    const delegatorRoles = delegator.roles as string[] | null || [];

    // Get epic information for notification
    const epic = await getEpic(epicId);
    if (!epic) {
      return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    // Handle POST_LAUNCH_OWNER delegation separately
    if (delegationType === 'POST_LAUNCH_OWNER') {
      // Get success config
      const { data: successConfig, error: configError } = await supabase
        .from('epic_success_configs')
        .select('post_launch_owner, delegated_post_launch_owner_id')
        .eq('epic_id', epicId)
        .single();

      if (configError || !successConfig) {
        return NextResponse.json({ error: 'Success configuration not found' }, { status: 404 });
      }

      // Permission check: PM or admin can delegate
      const rules = await getEffectivePermissionRules();
      const hasDelegationPermission = canRolesPerformWithRules(delegatorRoles, 'criteria.delegate', rules);
      const isCurrentOwner = successConfig.post_launch_owner === delegatorId || 
                            successConfig.delegated_post_launch_owner_id === delegatorId;

      if (!hasDelegationPermission && !isCurrentOwner) {
        return NextResponse.json({ 
          error: 'Forbidden: You do not have permission to delegate post-launch owner. Only PM, CPO, Super Admin, or the current post-launch owner can delegate.' 
        }, { status: 403 });
      }

      // Update delegated post-launch owner
      const { updateDelegatedPostLaunchOwner } = await import('@/lib/services/successMeasurementService');
      await updateDelegatedPostLaunchOwner(epicId, newApproverId);

      // Log delegation to audit_log
      await supabase.from('audit_log').insert({
        actor_id: delegatorId,
        entity_type: 'delegation',
        entity_id: epicId,
        json_diff: {
          action: 'delegation',
          delegation_type: delegationType,
          old_approver_id: successConfig.delegated_post_launch_owner_id || successConfig.post_launch_owner,
          new_approver_id: newApproverId,
          new_approver_email: newApproverEmail,
          epic_id: epicId,
          epic_name: epic.name,
        },
      });

      // Track activity for usage analytics (if /api/me wasn't called)
      trackActivityFromAction(delegatorId).catch(err => {
        console.error('[POST /api/epics/[id]/delegate] Failed to track activity:', err);
      });

      // Send Slack notification to the newly delegated post-launch owner
      try {
        // Ensure we have a Slack handle; attempt to sync if missing
        let recipientSlackHandle = newApprover.slack_handle || null;
        if (!recipientSlackHandle) {
          const synced = await syncUserSlackHandle(newApprover.email);
          if (synced) recipientSlackHandle = synced;
        }

        const recipientName = `${newApprover.first_name || ''} ${newApprover.last_name || ''}`.trim() || newApprover.email;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL;

        await sendSlackNotification({
          type: 'delegation',
          priority: 'medium',
          recipient: {
            id: newApproverId,
            email: newApprover.email,
            slack_handle: recipientSlackHandle || undefined,
            name: recipientName,
          },
          launch_id: epicId,
          metadata: {
            epic_name: epic.name,
            epic_id: epicId,
            task_label: 'Post-Launch Owner',
            category: 'Post-Launch',
            delegation_type: delegationType,
            delegated_by: delegatorName,
            ...(appUrl ? { epic_url: `${appUrl}/epics/${epicId}` } : {}),
          },
        });
      } catch (slackError) {
        console.warn('Failed to send Slack notification for post-launch owner delegation:', slackError);
        // Do not fail the request if Slack sending fails
      }

      return NextResponse.json({ 
        success: true,
        message: 'Post-launch owner delegation completed successfully',
      });
    }

    // For criteria delegations, get old accountable info for logging and permission check
    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required for criteria delegations' }, { status: 400 });
    }

    const { data: oldTask } = await supabase
      .from('epic_criterion_status')
      .select('decision_owner_id, criterion:criterion_id(label)')
      .eq('id', taskId)
      .single();

    const oldApproverId = oldTask?.decision_owner_id || null;
    const criterionLabel = Array.isArray(oldTask?.criterion) && oldTask.criterion.length > 0 
        ? oldTask.criterion[0].label 
        : (oldTask?.criterion as any)?.label;
    const resolvedTaskLabel = criterionLabel || taskLabel || 'Approval task';

    // Permission check: Use permission matrix + allow current accountable to delegate their own tasks
    const rulesForCriteria = await getEffectivePermissionRules();
    const hasDelegationPermission = canRolesPerformWithRules(delegatorRoles, 'criteria.delegate', rulesForCriteria);
    const isCurrentApprover = oldApproverId === delegatorId;

    if (!hasDelegationPermission && !isCurrentApprover) {
      return NextResponse.json({ 
        error: 'Forbidden: You do not have permission to delegate this task. Only CPO, Super Admin, or the current accountable can delegate tasks.' 
      }, { status: 403 });
    }

    // Track all delegated task IDs for grouped notifications
    let delegatedTaskIds: string[] = [];

    // Handle different delegation types
    switch (delegationType) {
      case 'SINGLE_TASK': {
        // Delegate only this specific task
        const { error } = await supabase
          .from('epic_criterion_status')
          .update({ decision_owner_id: newApproverId })
          .eq('id', taskId);

        if (error) throw error;

        delegatedTaskIds = [taskId];

        // Log delegation to audit_log
        await supabase.from('audit_log').insert({
          actor_id: delegatorId,
          entity_type: 'delegation',
          entity_id: taskId,
          json_diff: {
            action: 'delegation',
            delegation_type: delegationType,
            task_label: resolvedTaskLabel,
            category: category,
            old_approver_id: oldApproverId,
            new_approver_id: newApproverId,
            new_approver_email: newApproverEmail,
            epic_id: epicId,
            epic_name: epic.name,
          },
        });

        // Track activity for usage analytics (if /api/me wasn't called)
        trackActivityFromAction(delegatorId).catch(err => {
          console.error('[POST /api/epics/[id]/delegate] Failed to track activity:', err);
        });
        break;
      }

      case 'TEMPLATE_SINGLE_TASK': {
        // Look up the criterion_id for this task
        const { data: taskRow, error: taskRowError } = await supabase
          .from('epic_criterion_status')
          .select('criterion_id')
          .eq('id', taskId)
          .single();

        if (taskRowError || !taskRow?.criterion_id) {
          return NextResponse.json({ error: 'Criterion not found for this task' }, { status: 404 });
        }

        const criterionId = taskRow.criterion_id;

        // Update the criterion template so all future epics use the new owner
        const { error: templateError } = await supabase
          .from('criterion')
          .update({ decision_owner_email: newApproverEmail })
          .eq('id', criterionId);

        if (templateError) throw templateError;

        // Determine which epic IDs to update: current release epics (if any) + current epic
        let epicIdsToUpdate: string[] = [epicId];
        const releaseName = getReleaseNameFromEpic(epic as any);
        if (releaseName) {
          const releaseEpics = await getEpicsForRelease(releaseName, supabase);
          epicIdsToUpdate = (releaseEpics || []).map((e: any) => e.id);
          if (!epicIdsToUpdate.includes(epicId)) epicIdsToUpdate.push(epicId);
        }

        // Update all matching epic_criterion_status rows
        const { data: affectedTasks, error: fetchAffectedError } = await supabase
          .from('epic_criterion_status')
          .select('id')
          .in('epic_id', epicIdsToUpdate)
          .eq('criterion_id', criterionId);

        if (fetchAffectedError) throw fetchAffectedError;

        const affectedTaskIds = (affectedTasks || []).map((t: any) => t.id);

        if (affectedTaskIds.length > 0) {
          const { error: updateError } = await supabase
            .from('epic_criterion_status')
            .update({ decision_owner_id: newApproverId })
            .in('id', affectedTaskIds);

          if (updateError) throw updateError;

          delegatedTaskIds = affectedTaskIds;

          const auditLogs = affectedTaskIds.map((tid: string) => ({
            actor_id: delegatorId,
            entity_type: 'delegation',
            entity_id: tid,
            json_diff: {
              action: 'delegation',
              delegation_type: delegationType,
              task_label: resolvedTaskLabel,
              category: category,
              criterion_id: criterionId,
              new_approver_id: newApproverId,
              new_approver_email: newApproverEmail,
              epic_id: epicId,
              epic_name: epic.name,
              template_update: true,
              release_name: releaseName ?? null,
              tasks_count: affectedTaskIds.length,
            },
          }));

          await supabase.from('audit_log').insert(auditLogs);

          trackActivityFromAction(delegatorId).catch(err => {
            console.error('[POST /api/epics/[id]/delegate] Failed to track activity:', err);
          });
        }
        break;
      }

      case 'CATEGORY_EXCLUDING_GATES':
      case 'CATEGORY_INCLUDING_GATES': {
        // Get all tasks in this category for this epic
        const { data: tasks, error: fetchError } = await supabase
          .from('epic_criterion_status')
          .select('id, criterion:criterion_id(category, gate)')
          .eq('epic_id', epicId);

        if (fetchError) throw fetchError;

        // Filter tasks by category and gate status
        const taskIds = tasks
          ?.filter((task: any) => {
            const criterion = task.criterion;
            if (!criterion || criterion.category !== category) return false;
            if (delegationType === 'CATEGORY_EXCLUDING_GATES' && criterion.gate) return false;
            return true;
          })
          .map((task: any) => task.id);

        if (taskIds && taskIds.length > 0) {
          const { error } = await supabase
            .from('epic_criterion_status')
            .update({ decision_owner_id: newApproverId })
            .in('id', taskIds);

          if (error) throw error;

          delegatedTaskIds = taskIds;

          // Log delegation to audit_log for each task
          const auditLogs = taskIds.map((tid: string) => ({
            actor_id: delegatorId,
            entity_type: 'delegation',
            entity_id: tid,
            json_diff: {
              action: 'delegation',
              delegation_type: delegationType,
              category: category,
              new_approver_id: newApproverId,
              new_approver_email: newApproverEmail,
              epic_id: epicId,
              epic_name: epic.name,
              tasks_count: taskIds.length,
            },
          }));

          await supabase.from('audit_log').insert(auditLogs);

          // Track activity for usage analytics (if /api/me wasn't called)
          trackActivityFromAction(delegatorId).catch(err => {
            console.error('[POST /api/epics/[id]/delegate] Failed to track activity:', err);
          });
        }
        break;
      }

      case 'RELEASE_CATEGORY_INCLUDING_GATES': {
        const releaseName = getReleaseNameFromEpic(epic as any);
        if (!releaseName) {
          return NextResponse.json(
            { error: 'This epic is not associated with a release. Cannot delegate by release.' },
            { status: 400 }
          );
        }
        const releaseEpics = await getEpicsForRelease(releaseName, supabase);
        const releaseEpicIds = (releaseEpics || []).map((e: any) => e.id);
        if (releaseEpicIds.length === 0) {
          return NextResponse.json(
            { error: 'No epics found for this release.' },
            { status: 400 }
          );
        }
        const { data: releaseTasks, error: fetchReleaseError } = await supabase
          .from('epic_criterion_status')
          .select('id, criterion:criterion_id(category)')
          .in('epic_id', releaseEpicIds);

        if (fetchReleaseError) throw fetchReleaseError;

        const norm = (c: any) => (Array.isArray(c) ? c[0] : c);
        const releaseTaskIds = (releaseTasks || [])
          .filter((task: any) => {
            const criterion = norm(task.criterion);
            return criterion && criterion.category === category;
          })
          .map((task: any) => task.id);

        if (releaseTaskIds.length > 0) {
          const { error } = await supabase
            .from('epic_criterion_status')
            .update({ decision_owner_id: newApproverId })
            .in('id', releaseTaskIds);

          if (error) throw error;

          delegatedTaskIds = releaseTaskIds;

          const auditLogs = releaseTaskIds.map((tid: string) => ({
            actor_id: delegatorId,
            entity_type: 'delegation',
            entity_id: tid,
            json_diff: {
              action: 'delegation',
              delegation_type: delegationType,
              category: category,
              release_name: releaseName,
              new_approver_id: newApproverId,
              new_approver_email: newApproverEmail,
              epic_id: epicId,
              epic_name: epic.name,
              tasks_count: releaseTaskIds.length,
            },
          }));

          await supabase.from('audit_log').insert(auditLogs);

          // Track activity for usage analytics (if /api/me wasn't called)
          trackActivityFromAction(delegatorId).catch(err => {
            console.error('[POST /api/epics/[id]/delegate] Failed to track activity:', err);
          });
        }
        break;
      }

      case 'TEMPLATE_EXCLUDING_GATES':
      case 'TEMPLATE_INCLUDING_GATES': {
        // Update the criterion template (affects all future epics)
        // Get all criteria in this category
        const { data: criteria, error: fetchError } = await supabase
          .from('criterion')
          .select('id, gate, decision_owner_email')
          .eq('category', category);

        if (fetchError) throw fetchError;

        // Filter by gate status if needed
        const criteriaToUpdate = criteria
          ?.filter((criterion: any) => {
            if (delegationType === 'TEMPLATE_EXCLUDING_GATES' && criterion.gate) return false;
            return true;
          })
          .map((criterion: any) => criterion.id);

        if (criteriaToUpdate && criteriaToUpdate.length > 0) {
          // Update the templates
          const { error } = await supabase
            .from('criterion')
            .update({ decision_owner_email: newApproverEmail })
            .in('id', criteriaToUpdate);

          if (error) throw error;

          // Also update tasks in the current epic for consistency
          const { data: currentEpicTasks } = await supabase
            .from('epic_criterion_status')
            .select('id, criterion_id')
            .eq('epic_id', epicId)
            .in('criterion_id', criteriaToUpdate);

          if (currentEpicTasks && currentEpicTasks.length > 0) {
            const currentTaskIds = currentEpicTasks.map((task: any) => task.id);
            await supabase
              .from('epic_criterion_status')
              .update({ decision_owner_id: newApproverId })
              .in('id', currentTaskIds);

            delegatedTaskIds = currentTaskIds;

            // Log delegation to audit_log for each task
            const auditLogs = currentTaskIds.map((tid: string) => ({
              actor_id: delegatorId,
              entity_type: 'delegation',
              entity_id: tid,
              json_diff: {
                action: 'delegation',
                delegation_type: delegationType,
                category: category,
                new_approver_id: newApproverId,
                new_approver_email: newApproverEmail,
                epic_id: epicId,
                epic_name: epic.name,
                template_update: true,
                tasks_count: currentTaskIds.length,
              },
            }));

            await supabase.from('audit_log').insert(auditLogs);

            // Track activity for usage analytics (if /api/me wasn't called)
            trackActivityFromAction(delegatorId).catch(err => {
              console.error('[POST /api/epics/[id]/delegate] Failed to track activity:', err);
            });
          }
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid delegation type' }, { status: 400 });
    }

    // Send grouped assignment notifications for delegated criteria
    if (delegatedTaskIds.length > 0) {
      try {
        await sendCriteriaAssignmentNotifications(epicId, delegatedTaskIds, supabase);
      } catch (notificationError) {
        // Log error but don't fail the delegation
        console.error('Failed to send assignment notifications for delegation:', notificationError);
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Delegation completed successfully',
    });

  } catch (error: any) {
    console.error('Delegation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delegate' },
      { status: 500 }
    );
  }
}

