import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  taskId: string; // launch_criterion_status id
  category: string;
  isGate: boolean;
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
    const { delegationType, newApproverEmail, taskId, category, isGate } = body;

    // Validate inputs
    if (!delegationType || !newApproverEmail || !taskId || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the new approver's user ID
    const { data: newApprover, error: approverError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', newApproverEmail)
      .single();

    if (approverError || !newApprover) {
      return NextResponse.json({ error: 'New approver not found' }, { status: 404 });
    }

    const newApproverId = newApprover.id;

    // Handle different delegation types
    switch (delegationType) {
      case 'SINGLE_TASK': {
        // Delegate only this specific task
        const { error } = await supabase
          .from('launch_criterion_status')
          .update({ decision_owner_id: newApproverId })
          .eq('id', taskId);

        if (error) throw error;
        break;
      }

      case 'CATEGORY_EXCLUDING_GATES':
      case 'CATEGORY_INCLUDING_GATES': {
        // Get all tasks in this category for this epic
        const { data: tasks, error: fetchError } = await supabase
          .from('launch_criterion_status')
          .select('id, criterion:criterion_id(category, gate)')
          .eq('launch_id', epicId);

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
            .from('launch_criterion_status')
            .update({ decision_owner_id: newApproverId })
            .in('id', taskIds);

          if (error) throw error;
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
            .from('launch_criterion_status')
            .select('id, criterion_id')
            .eq('launch_id', epicId)
            .in('criterion_id', criteriaToUpdate);

          if (currentEpicTasks && currentEpicTasks.length > 0) {
            const currentTaskIds = currentEpicTasks.map((task: any) => task.id);
            await supabase
              .from('launch_criterion_status')
              .update({ decision_owner_id: newApproverId })
              .in('id', currentTaskIds);
          }
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid delegation type' }, { status: 400 });
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

