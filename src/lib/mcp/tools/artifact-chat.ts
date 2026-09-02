/**
 * Tool: artifact-chat
 *
 * Multi-turn conversational interface for working with launch artifacts.
 * The agent reads the current state of the artifact (ai_draft + flags + context)
 * and answers questions, explains decisions, suggests improvements, or helps
 * the user understand what's missing.
 *
 * This is a read-only analysis tool — it does not modify the artifact. For
 * edits, use update-artifact, draft-section, or answer-flags.
 *
 * Conversation mode:
 * - "question": Ask about the artifact's content, gaps, or grounding
 * - "review": Get a structured review with strengths, weaknesses, and action items
 * - "summary": Get a high-level summary of the artifact's current state
 * - "free": Open-ended conversation (default)
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  message: z.string().describe('Your question, request, or comment about the artifact'),
  mode: z.enum(['question', 'review', 'summary', 'free']).optional()
    .describe('Conversation mode: question (ask about content), review (structured critique), summary (high-level state), free (open-ended)')
    .default('free'),
});

/** Count top-level sections and their completion status. */
function analyzeSections(aiDraft: Record<string, unknown>): Array<{
  section: string;
  present: boolean;
  hasContent: boolean;
  hasClaims: boolean;
  claimCount: number;
  groundedClaims: number;
}> {
  const sections: Array<{ section: string; present: boolean; hasContent: boolean; hasClaims: boolean; claimCount: number; groundedClaims: number }> = [];

  if (!aiDraft || typeof aiDraft !== 'object') return sections;

  for (const [key, value] of Object.entries(aiDraft)) {
    if (key === 'overall_confidence') continue;

    const isObject = value && typeof value === 'object' && !Array.isArray(value);
    const hasContent = isObject ? Object.keys(value as object).length > 0 : false;

    let claimCount = 0, groundedClaims = 0;
    const claims = isObject ? (value as Record<string, unknown>).claims : undefined;
    if (Array.isArray(claims)) {
      claimCount = claims.length;
      groundedClaims = claims.filter(
        (c) => (c as Record<string, unknown>)?.grounded === true
      ).length;
    }

    sections.push({
      section: key,
      present: true,
      hasContent,
      hasClaims: claimCount > 0,
      claimCount,
      groundedClaims,
    });
  }

  return sections;
}

/** Count open flags across the draft. */
function countFlags(
  flags: Array<{ status?: string }> = []
): { open: number; asked: number; total: number } {
  const open = flags.filter((f) => f.status === 'open').length;
  const asked = flags.filter((f) => f.status === 'asked').length;
  return { open, asked, total: flags.length };
}

export async function artifactChat(supabase: SupabaseClient, args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }


  // Fetch artifact with full context
  const { data: artifact, error: fetchError } = await supabase
    .from('launch_artifact')
    .select('*')
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .single();

  if (fetchError || !artifact) {
    return { error: fetchError?.message ?? 'Artifact not found' };
  }

  // Fetch flags
  const { data: flags } = await supabase
    .from('launch_artifact_flag')
    .select('*')
    .eq('launch_artifact_id', artifact.id);

  // Analyze current state
  const aiDraft = artifact.ai_draft as Record<string, unknown> | null;
  const sections = aiDraft ? analyzeSections(aiDraft) : [];
  const flagCounts = countFlags(flags || []);

  // Build context summary for the response
  const context = {
    artifact_type: artifact.artifact_type,
    status: artifact.status,
    generation: artifact.generation,
    version: artifact.version,
    sections: sections.length,
    sections_with_claims: sections.filter((s) => s.hasClaims).length,
    total_claims: sections.reduce((sum, s) => sum + s.claimCount, 0),
    grounded_claims: sections.reduce((sum, s) => sum + s.groundedClaims, 0),
    open_flags: flagCounts.open + flagCounts.asked,
    doc_url: artifact.doc_url,
    change_request_note: artifact.change_request_note,
    overall_confidence: aiDraft?.overall_confidence as string | undefined,
  };

  // Route to the appropriate mode
  switch (parsed.data.mode) {
    case 'summary':
      return {
        mode: 'summary',
        context,
        section_status: sections.map((s) => ({
          section: s.section,
          has_content: s.hasContent,
          claims: `${s.groundedClaims}/${s.claimCount} grounded`,
        })),
        flags: flagCounts.open + flagCounts.asked > 0
          ? `${flagCounts.open} open, ${flagCounts.asked} asked`
          : 'No outstanding flags',
      };

    case 'review':
      return {
        mode: 'review',
        context,
        completeness: {
          total_sections: sections.length,
          filled_sections: sections.filter((s) => s.hasContent).length,
          sections_with_claims: sections.filter((s) => s.hasClaims).length,
        },
        grounding: {
          total_claims: context.total_claims,
          grounded: context.grounded_claims,
          ungrounded: context.total_claims - context.grounded_claims,
          rate: context.total_claims > 0 ? `${Math.round(context.grounded_claims / context.total_claims * 100)}%` : 'N/A',
        },
        gaps: sections.filter((s) => !s.hasContent).map((s) => s.section),
        open_flags: flags?.filter((f) => ['open', 'asked'].includes(f.status)).map((f) => ({
          flag_key: f.flag_key,
          section: f.section,
          question: f.question,
        })) || [],
        readiness: assessReadiness({
          status: context.status,
          sections: context.sections,
          sections_with_claims: context.sections_with_claims,
          total_claims: context.total_claims,
          grounded_claims: context.grounded_claims,
          open_flags: context.open_flags,
          overall_confidence: context.overall_confidence,
        }),
      };

    case 'question':
      return {
        mode: 'question',
        question: parsed.data.message,
        context,
        ai_draft: aiDraft,
        open_flags: flags?.filter((f) => ['open', 'asked'].includes(f.status)) || [],
        hint: 'Use this context to answer the user\'s question about the artifact. The ai_draft contains the full structured content.',
      };

    default:
      return {
        mode: 'free',
        message: parsed.data.message,
        context,
        ai_draft: aiDraft,
        open_flags: flags?.filter((f) => ['open', 'asked'].includes(f.status)) || [],
        hint: 'Use this context to have a conversation about the artifact. For edits, direct the user to update-artifact, draft-section, or answer-flags.',
      };
  }
}

function assessReadiness(context: {
  status: string;
  sections: number;
  sections_with_claims: number;
  total_claims: number;
  grounded_claims: number;
  open_flags: number;
  overall_confidence?: string;
}): { level: 'ready' | 'almost' | 'needs_work'; blockers: string[] } {
  const blockers: string[] = [];

  if (context.sections_with_claims < context.sections * 0.5) {
    blockers.push('Less than half the sections have claims');
  }

  if (context.total_claims > 0 && context.grounded_claims / context.total_claims < 0.7) {
    blockers.push('Less than 70% of claims are grounded');
  }

  if (context.open_flags > 5) {
    blockers.push(`${context.open_flags} unanswered flags`);
  }

  if (context.overall_confidence === 'low') {
    blockers.push('Overall confidence is low');
  }

  return {
    level: blockers.length === 0 ? 'ready' : blockers.length <= 2 ? 'almost' : 'needs_work',
    blockers,
  };
}