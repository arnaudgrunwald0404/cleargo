/**
 * Tool: draft-section
 *
 * Re-drafts a single section of an artifact. Since the AI pipeline generates
 * the full artifact each time, this sends a targeted change request focused on
 * the named section. The full artifact is regenerated, but the change request
 * instructs the model to preserve unchanged sections and focus on the target.
 *
 * This is more robust than in-place patching because the full grounding pass
 * still runs, ensuring consistency across sections.
 */
import { z } from 'zod';
import { callInternalApi } from '../client.js';

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

const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  section: z.string().describe('The section key to re-draft (e.g., value_story, message_house, objection_handling)'),
  instructions: z.string().max(5000).optional()
    .describe('Optional: specific instructions for this section (e.g., "make the vignette more customer-centric")'),
  sourceNotes: z.string().max(20_000).optional()
    .describe('Optional: additional context, transcripts, or research to inform this section'),
});

export async function draftSection(args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }

  const validSections = ARTIFACT_SECTIONS[parsed.data.artifactType] || [];
  if (!validSections.includes(parsed.data.section)) {
    return {
      error: `Unknown section: ${parsed.data.section}`,
      valid_sections: validSections,
    };
  }

  // Build a focused change request that preserves other sections
  const changeRequest = [
    `RE-DRRAFT the "${parsed.data.section}" section.`,
    ...(parsed.data.instructions ? [`Specific guidance: ${parsed.data.instructions}`] : []),
    'Preserve all other sections as-is unless they directly depend on this section.',
  ].join(' ');

  try {
    const result = await callInternalApi('/api/internal/artifacts', {
      action: 'draft_section',
      launchId: parsed.data.launchId,
      artifact_type: parsed.data.artifactType,
      section: parsed.data.section,
      change_request_note: changeRequest,
      ...(parsed.data.sourceNotes ? { source_notes: parsed.data.sourceNotes } : {}),
    });

    return {
      success: true,
      message: `Section "${parsed.data.section}" re-draft triggered for ${parsed.data.artifactType}`,
      section: parsed.data.section,
      result,
    };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : 'Failed to trigger section draft',
      hint: 'If the app does not support draft_section, use draft-artifact with a change_request_note instead.',
    };
  }
}