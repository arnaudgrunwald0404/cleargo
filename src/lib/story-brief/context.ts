/**
 * Assembles the grounding context for a Story Brief: epic metadata + Aha-vs-Jira delivery
 * validation. This is what gets persisted as `epic_story_brief.context_snapshot` and fed into
 * the generator prompt alongside any pasted call notes/transcript.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { validateEpicDelivery, type DeliveryValidationResult } from './delivery-validator';
import {
  isHarvestEmpty,
  shapeComments,
  shapeTranscripts,
  MAX_COMMENTS,
  MAX_TRANSCRIPTS,
  type HarvestResult,
} from './harvest';

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
  /** Material ClearGo already holds, so the agent asks fewer questions. */
  harvest: HarvestResult;
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
  const harvest = await harvestEpicContext(epicId, supabase);

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
    harvest,
  };
}

/**
 * Pull the sources Aha and Jira cannot cover. Failures are swallowed: a missing
 * comment table or an empty transcript join must not stop a brief being drafted,
 * it just means more questions for the PM.
 */
async function harvestEpicContext(
  epicId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<HarvestResult> {
  let comments: ReturnType<typeof shapeComments> = [];
  let transcripts: ReturnType<typeof shapeTranscripts> = [];

  const { data: commentRows, error: commentError } = await supabase
    .from('epic_comment')
    .select('comment_text, category, movement_cause, from_release, to_release, created_at, created_by')
    .eq('epic_id', epicId)
    .order('created_at', { ascending: false })
    .limit(MAX_COMMENTS);
  if (commentError) {
    console.warn('story-brief harvest: epic_comment unavailable', commentError.message);
  } else {
    comments = shapeComments(commentRows || []);
  }

  // Meetings reach an epic two ways: the meeting_epic join table, and meeting's
  // own epic_id / linked_epic_id. Both are live, so read both and dedupe.
  const transcriptRows = new Map<string, RawTranscriptRow>();

  const { data: directRows, error: directError } = await supabase
    .from('meeting')
    .select('id, title, meeting_date, meeting_transcript(transcript_text)')
    .or(`epic_id.eq.${epicId},linked_epic_id.eq.${epicId}`)
    .limit(MAX_TRANSCRIPTS);
  if (directError) {
    console.warn('story-brief harvest: direct meeting link unavailable', directError.message);
  } else {
    for (const m of directRows || []) collectTranscripts(m as MeetingRow, transcriptRows);
  }

  const { data: joinRows, error: joinError } = await supabase
    .from('meeting_epic')
    .select('meeting:meeting(id, title, meeting_date, meeting_transcript(transcript_text))')
    .eq('epic_id', epicId)
    .limit(MAX_TRANSCRIPTS);
  if (joinError) {
    console.warn('story-brief harvest: meeting_epic join unavailable', joinError.message);
  } else {
    for (const row of joinRows || []) {
      const meeting = (row as { meeting: MeetingRow | null }).meeting;
      if (meeting) collectTranscripts(meeting, transcriptRows);
    }
  }

  transcripts = shapeTranscripts([...transcriptRows.values()]);

  return { comments, transcripts, empty: isHarvestEmpty(comments, transcripts) };
}

interface MeetingRow {
  id?: string | null;
  title?: string | null;
  meeting_date?: string | null;
  meeting_transcript?: Array<{ transcript_text?: string | null }> | null;
}

interface RawTranscriptRow {
  transcript_text: string | null;
  meeting_title: string | null;
  meeting_date: string | null;
}

/**
 * Flatten a meeting's transcripts into the accumulator. Keyed on meeting id so a
 * meeting reachable by both link paths contributes once, not twice.
 */
function collectTranscripts(meeting: MeetingRow, into: Map<string, RawTranscriptRow>): void {
  const key = meeting.id || meeting.title || String(into.size);
  if (into.has(key)) return;
  const first = (meeting.meeting_transcript || []).find((t) => (t.transcript_text || '').trim());
  if (!first) return;
  into.set(key, {
    transcript_text: first.transcript_text ?? null,
    meeting_title: meeting.title ?? null,
    meeting_date: meeting.meeting_date ?? null,
  });
}
