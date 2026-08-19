/**
 * Assembles the grounding context for a Story Brief: epic metadata + Aha-vs-Jira delivery
 * validation. This is what gets persisted as `epic_story_brief.context_snapshot` and fed into
 * the generator prompt alongside any pasted call notes/transcript.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { validateEpicDelivery, type DeliveryValidationResult } from './delivery-validator';

export interface StoryBriefEpicSummary {
  id: string;
  name: string;
  tier: string | null;
  aha_id: string | null;
  jira_epic_key: string | null;
  owner_email: string | null;
  target_launch_date: string | null;
  scheduled_ga_dev_date: string | null;
  status: string | null;
}

export interface StoryBriefContext {
  epic: StoryBriefEpicSummary;
  validation: DeliveryValidationResult;
}

export async function assembleStoryBriefContext(epicId: string): Promise<StoryBriefContext> {
  const supabase = createAdminClient();

  const { data: epic, error } = await supabase
    .from('epic')
    .select(
      'id, name, tier, aha_id, aha_fields, jira_epic_key, owner_email, target_launch_date, scheduled_ga_dev_date, status'
    )
    .eq('id', epicId)
    .single();

  if (error || !epic) {
    throw new Error(`Epic ${epicId} not found: ${error?.message || 'unknown error'}`);
  }

  const validation = await validateEpicDelivery(epic, supabase);

  return {
    epic: {
      id: epic.id,
      name: epic.name,
      tier: epic.tier ?? null,
      aha_id: epic.aha_id ?? null,
      jira_epic_key: epic.jira_epic_key ?? validation.jira_epic_key,
      owner_email: epic.owner_email ?? null,
      target_launch_date: epic.target_launch_date ?? null,
      scheduled_ga_dev_date: epic.scheduled_ga_dev_date ?? null,
      status: epic.status ?? null,
    },
    validation,
  };
}
