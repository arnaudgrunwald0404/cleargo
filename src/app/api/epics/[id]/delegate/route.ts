import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendSlackNotification } from '@/lib/slack/notifications';
import { getEpic } from '@/lib/epics';
import { canRolesPerform } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export type DelegationType =
  | 'SINGLE_TASK'
  | 'CATEGORY_EXCLUDING_GATES'
  | 'CATEGORY_INCLUDING_GATES'
  | 'TEMPLATE_EXCLUDING_GATES'
  | 'TEMPLATE_INCLUDING_GATES';

interface DelegationRequest {
  delegationType: DelegationType;
  newApproverEmail: string;
  taskId: string; // epic_criterion_status id
  category: string;
  isGate: boolean;
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
    if (!delegationType || !newApproverEmail || !taskId || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the new approver's user info (including Slack handle)
    const { data: newApprover, error: approverError } = await supabase
      .from('app_user')
      .select('id, email, first_name, last_name, slack_handle')
      .eq('email', newApproverEmail)
      .single();

    if (approverError || !newApprover) {
      return NextResponse.json({ error: 'New approver not found' }, { status: 404 });
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

    // Get old approver info for logging and permission check
    const { data: oldTask } = await supabase
      .from('epic_criterion_status')
      .select('decision_owner_id, criterion:criterion_id(label)')
      .eq('id', taskId)
      .single();

    const oldApproverId = oldTask?.decision_owner_id || null;
    const resolvedTaskLabel = oldTask?.criterion?.label || taskLabel || 'Approval task';

    // Permission check: Use permission matrix + allow current approver to delegate their own tasks
    const hasDelegationPermission = canRolesPerform(delegatorRoles, 'criteria.delegate');
    const isCurrentApprover = oldApproverId === delegatorId;

    if (!hasDelegationPermission && !isCurrentApprover) {
      return NextResponse.json({ 
        error: 'Forbidden: You do not have permission to delegate this task. Only CPO, Super Admin, or the current approver can delegate tasks.' 
      }, { status: 403 });
    }

    // Handle different delegation types
    switch (delegationType) {
      case 'SINGLE_TASK': {
        // Delegate only this specific task
        const { error } = await supabase
          .from('epic_criterion_status')
          .update({ decision_owner_id: newApproverId })
          .eq('id', taskId);

        if (error) throw error;

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
          }
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid delegation type' }, { status: 400 });
    }

    // Send Slack notification to new approver if they have a Slack handle
    if (newApprover.slack_handle) {
      try {
        const epicUrl = process.env.NEXT_PUBLIC_APP_URL 
          ? `${process.env.NEXT_PUBLIC_APP_URL}/epics/${epicId}`
          : undefined;

        await sendSlackNotification({
          type: 'delegation',
          priority: 'medium',
          recipient: {
            id: newApproverId,
            email: newApproverEmail,
            slack_handle: newApprover.slack_handle,
            name: `${newApprover.first_name || ''} ${newApprover.last_name || ''}`.trim() || newApproverEmail,
          },
          launch_id: epicId,
          metadata: {
            epic_name: epic.name,
            epic_id: epicId,
            task_label: taskLabel || 'Approval task',
            category: category,
            delegation_type: delegationType,
            delegated_by: delegatorName,
            epic_url: epicUrl,
          },
        });
      } catch (slackError) {
        // Log error but don't fail the delegation
        console.error('Failed to send Slack notification for delegation:', slackError);
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

