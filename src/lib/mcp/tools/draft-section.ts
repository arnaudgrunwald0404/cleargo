/**
 * Tool: draft-section
 *
 * Re-drafts a single section of an artifact. The pipeline always regenerates the
 * whole artifact, so "section" is expressed as a targeted change request that
 * tells the model what to rework and what to leave alone. That is deliberately
 * more robust than patching the section in place: the full grounding pass still
 * runs, so the rewritten section stays consistent with the rest.
 *
 * Same background handoff as draft-artifact — the change request is written to
 * the row first, because that is where draftArtifact reads it from, and the
 * background worker is handed nothing else.
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';
import { startArtifactDraft } from '@/lib/artifacts/startDraft';
import { canRolesPerform } from '@/lib/permissions';
import type { McpAuthInfo } from '@/lib/oauth/tokens';
import type { ArtifactType } from '@/types/artifacts';
import { describeDraftResult } from './draftResult';

const ARTIFACT_SECTIONS: Record<string, string[]> = {
  gate_checklist: ['gate_1_naming', 'gate_2_pricing', 'gate_3_beta'],
  story_brief: [
    'what_we_are_building', 'why_we_prioritized_it', 'value_story',
    'launch_scope', 'personas', 'open_decisions', 'soft_commitments',
    'downstream_deliverables',
  ],
  messaging_brief: [
    'naming_and_usage', 'positioning', 'message_house', 'persona_messaging',
    'claims_register', 'talk_tracks', 'boilerplate', 'open_items',
  ],
  enablement_guide: [
    'what_this_is', 'why_it_matters', 'where_it_fits', 'key_messaging',
    'pricing_faq', 'discovery_questions', 'key_capabilities',
    'pricing_and_packaging', 'ideal_customer_profile', 'top_use_cases',
    'objection_handling', 'collateral_index', 'tier_1_additions',
  ],
  marketing_brief: [
    'identification', 'customer_and_market', 'messaging', 'pricing_and_packaging',
    'raci', 'asset_checklist', 'gtm_motion', 'workback_calendar',
    'success_metrics', 'risks_and_approvals',
  ],
};

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  section: z.string().describe('The section key to re-draft (e.g., value_story, message_house, objection_handling)'),
  instructions: z.string().max(5000).optional()
    .describe('Optional: specific instructions for this section (e.g., "make the vignette more customer-centric")'),
  sourceNotes: z.string().max(20_000).optional()
    .describe('Optional: additional context, transcripts, or research to inform this section'),
});

export async function draftSection(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  actor: McpAuthInfo
): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  if (!canRolesPerform(actor.roles, 'launchArtifact.draft')) {
    return { error: 'You do not have permission to draft launch artifacts.' };
  }

  const validSections = ARTIFACT_SECTIONS[parsed.data.artifactType] || [];
  if (!validSections.includes(parsed.data.section)) {
    return {
      error: `Unknown section: ${parsed.data.section}`,
      valid_sections: validSections,
    };
  }

  const changeRequest = [
    `RE-DRAFT the "${parsed.data.section}" section.`,
    ...(parsed.data.instructions ? [`Specific guidance: ${parsed.data.instructions}`] : []),
    'Preserve all other sections as-is unless they directly depend on this section.',
  ].join(' ');

  try {
    const result = await startArtifactDraft(
      parsed.data.launchId,
      parsed.data.artifactType as ArtifactType,
      {
        sourceNotes: parsed.data.sourceNotes,
        changeRequestNote: changeRequest,
        actorEmail: actor.email,
      },
      supabase
    );

    return {
      section: parsed.data.section,
      ...describeDraftResult(
        result,
        parsed.data.artifactType as ArtifactType,
        `Re-draft of "${parsed.data.section}"`
      ),
    };
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Failed to start section draft' };
  }
}
