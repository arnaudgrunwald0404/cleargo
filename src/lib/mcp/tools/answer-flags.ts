/**
 * Tool: answer-flags
 *
 * Answers one or more open interview flags on an artifact. Flags are questions
 * the AI raised during drafting because it couldn't ground a claim. Answering
 * them provides the missing information so the next re-draft can incorporate it.
 *
 * Supports two modes:
 * - Bulk: pass `answers` as an array of { flagKey, answer } pairs
 * - Single: pass `flagKey` + `answer` for a one-off
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { actorCan } from '@/lib/permissions-server';
import type { McpAuthInfo } from '@/lib/oauth/tokens';

const AnswerSchema = z.object({
  flagKey: z.string().describe('The flag_key of the flag to answer'),
  answer: z.string().max(5000).describe('The answer text'),
});

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  /** Single-flag mode: answer one flag by key. Mutually exclusive with `answers`. */
  flagKey: z.string().optional().describe('Answer a single flag by its flag_key'),
  answer: z.string().max(5000).optional().describe('Answer for the single flag'),
  /** Bulk mode: answer multiple flags at once. Mutually exclusive with flagKey/answer. */
  answers: z.array(AnswerSchema).optional().describe('Array of { flagKey, answer } pairs to answer'),
});

export async function answerFlags(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!(await actorCan(actor, 'launchArtifact.draft', supabase))) {
    return { error: 'You do not have permission to answer artifact questions.' };
  }


  // Fetch the artifact
  const { data: artifact, error: fetchError } = await supabase
    .from('launch_artifact')
    .select('id')
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .single();

  if (fetchError || !artifact) {
    return { error: fetchError?.message ?? 'Artifact not found' };
  }

  // Build the answer list from either mode
  const toAnswer: Array<{ flagKey: string; answer: string }> = [];

  if (parsed.data.answers && parsed.data.answers.length > 0) {
    toAnswer.push(...parsed.data.answers);
  } else if (parsed.data.flagKey && parsed.data.answer) {
    toAnswer.push({ flagKey: parsed.data.flagKey, answer: parsed.data.answer });
  } else {
    return { error: 'Provide either (flagKey + answer) or answers[]' };
  }

  const now = new Date().toISOString();
  const answered: Array<{ flag_key: string; question: string | null }> = [];
  const failures: Array<{ flag_key: string; error: string }> = [];

  for (const { flagKey, answer } of toAnswer) {
    const { data: flag, error } = await supabase
      .from('launch_artifact_flag')
      .select('flag_key, question, status')
      .eq('launch_artifact_id', artifact.id)
      .eq('flag_key', flagKey)
      .in('status', ['open', 'asked'])
      .single();

    if (error || !flag) {
      failures.push({ flag_key: flagKey, error: error?.message ?? 'Flag not found or already answered' });
      continue;
    }

    const { error: updateError } = await supabase
      .from('launch_artifact_flag')
      .update({
        answer,
        status: 'answered',
        answered_at: now,
      })
      .eq('launch_artifact_id', artifact.id)
      .eq('flag_key', flagKey);

    if (updateError) {
      failures.push({ flag_key: flagKey, error: updateError.message });
      continue;
    }

    answered.push({ flag_key: flag.flag_key, question: flag.question });
  }

  return {
    success: true,
    artifact_id: artifact.id,
    answered: answered,
    failures: failures,
    summary: `${answered.length}/${toAnswer.length} flags answered`,
  };
}