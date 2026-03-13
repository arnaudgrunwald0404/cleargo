import { createClient } from '@supabase/supabase-js';

const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function getClient() {
  if (!supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseServiceKey);
}

/**
 * Record a status transition in criterion_status_history.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function logStatusChange(params: {
  epicCriterionStatusId: string;
  epicId: string;
  criterionId: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
}): Promise<void> {
  try {
    const supabase = getClient();
    const { error } = await supabase.from('criterion_status_history').insert({
      epic_criterion_status_id: params.epicCriterionStatusId,
      epic_id: params.epicId,
      criterion_id: params.criterionId,
      old_status: params.oldStatus,
      new_status: params.newStatus,
      changed_by: params.changedBy,
      changed_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[logStatusChange] insert failed:', error);
    }
  } catch (err) {
    console.error('[logStatusChange] unexpected error:', err);
  }
}
