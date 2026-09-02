/**
 * Tool: explain-claim
 *
 * Looks up a claim within an artifact's ai_draft and returns its grounding
 * information: the source type, whether it's grounded, and what context
 * supports it. Useful for answering "how do you know that?" questions.
 *
 * Searches claims recursively through the ai_draft structure (sections like
 * narrativeSection have a `claims` array; gate sections have `checks` with
 * evidence).
 */
import { z } from 'zod/v3';
import type { SupabaseClient } from '@supabase/supabase-js';

export const InputSchema = z.object({
  launchId: z.string().describe('The launch ID'),
  artifactType: z.enum(['gate_checklist', 'story_brief', 'messaging_brief', 'enablement_guide', 'marketing_brief'])
    .describe('The artifact type'),
  /** Free-text search — matches against claim.text in the artifact. */
  claim: z.string().describe('Partial or full text of the claim to look up'),
});

/** Recursively collect all claim arrays from the ai_draft. */
function collectClaims(obj: unknown, path: string = ''): Array<{ path: string; claim: { text: string; source: string; grounded: boolean } }> {
  if (Array.isArray(obj)) {
    const results: Array<{ path: string; claim: { text: string; source: string; grounded: boolean } }> = [];
    for (let i = 0; i < obj.length; i++) {
      results.push(...collectClaims(obj[i], `${path}[${i}]`));
    }
    return results;
  }

  if (obj && typeof obj === 'object') {
    const results: Array<{ path: string; claim: { text: string; source: string; grounded: boolean } }> = [];
    const record = obj as Record<string, unknown>;

    // Check if this is a claims array
    if (Array.isArray(record.claims)) {
      for (const c of record.claims) {
        if (c && typeof c === 'object' && 'text' in c) {
          results.push({
            path: `${path}.claims`,
            claim: {
              text: String(c.text ?? ''),
              source: String((c as Record<string, unknown>).source ?? 'unknown'),
              grounded: Boolean((c as Record<string, unknown>).grounded),
            },
          });
        }
      }
    }

    // Check if this is a checks array (gate checklist)
    if (Array.isArray(record.checks)) {
      for (const c of record.checks) {
        if (c && typeof c === 'object' && 'check' in c) {
          results.push({
            path: `${path}.checks`,
            claim: {
              text: String(c.check ?? ''),
              source: String((c as Record<string, unknown>).evidence ?? ''),
              grounded: (c as Record<string, unknown>).verdict !== 'unknown',
            },
          });
        }
      }
    }

    // Recurse into other keys
    for (const [key, value] of Object.entries(record)) {
      if (key !== 'claims' && key !== 'checks') {
        results.push(...collectClaims(value, `${path}.${key}`));
      }
    }
    return results;
  }

  return [];
}

export async function explainClaim(supabase: SupabaseClient, args: Record<string, unknown>): Promise<unknown> {
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: `Invalid input: ${parsed.error.message}` };
  }


  // Fetch artifact
  const { data: artifact, error: fetchError } = await supabase
    .from('launch_artifact')
    .select('id, ai_draft, context_snapshot, artifact_type, generation')
    .eq('launch_id', parsed.data.launchId)
    .eq('artifact_type', parsed.data.artifactType)
    .single();

  if (fetchError || !artifact) {
    return { error: fetchError?.message ?? 'Artifact not found' };
  }

  const aiDraft = artifact.ai_draft;
  if (!aiDraft || typeof aiDraft !== 'object') {
    return { error: 'Artifact has no ai_draft content to search' };
  }

  const allClaims = collectClaims(aiDraft);
  const query = parsed.data.claim.toLowerCase();

  // Fuzzy match: find claims where the text includes the query or vice versa
  const matches = allClaims.filter((c) =>
    c.claim.text.toLowerCase().includes(query) || query.includes(c.claim.text.toLowerCase())
  );

  if (matches.length === 0) {
    // Return closest partial matches for helpfulness
    const partial = allClaims.filter((c) => {
      const words = query.split(/\s+/);
      return words.some((w) => c.claim.text.toLowerCase().includes(w));
    }).slice(0, 5);

    return {
      exact_matches: 0,
      partial_matches: partial.map((m) => ({
        section: m.path,
        text: m.claim.text,
        source: m.claim.source,
        grounded: m.claim.grounded,
      })),
      hint: partial.length > 0 ? 'Partial matches found. Refine your search term for exact matches.' : 'No matching claims found.',
    };
  }

  return {
    artifact_type: artifact.artifact_type,
    generation: artifact.generation,
    matches: matches.map((m) => ({
      section: m.path,
      text: m.claim.text,
      source: m.claim.source,
      grounded: m.claim.grounded,
      explanation: buildExplanation(m.claim),
    })),
    match_count: matches.length,
    context_snapshot: artifact.context_snapshot,
  };
}

function buildExplanation(claim: { text: string; source: string; grounded: boolean }): string {
  if (!claim.grounded) {
    return `This claim is NOT grounded. Source: ${claim.source}. It should be treated as a hypothesis or gap that needs verification before being asserted in the final document.`;
  }

  const sourceDescriptions: Record<string, string> = {
    aha_description: 'Aha! epic description — the product vision and business case',
    aha_workflow_status: 'Aha! workflow status — where the feature is in the delivery pipeline',
    jira_epic_status: 'Jira epic status — development progress',
    jira_child_issue: 'Jira child issue — specific story-level detail',
    source_notes: 'PM-provided source notes — call transcripts, meeting notes, or PM guidance',
    epic_comment: 'Comment on the Aha! epic — stakeholder feedback or decisions',
    meeting_transcript: 'Meeting transcript — verbatim discussion record',
    upstream_artifact: 'Upstream artifact — derived from a prior artifact in the chain (e.g., Story Brief feeds Messaging Brief)',
    unstated_assumption: 'Unstated assumption — the model inferred this; it needs validation',
  };

  const sourceDesc = sourceDescriptions[claim.source] || claim.source;
  return `This claim is grounded in ${sourceDesc}. The claim "${claim.text}" was derived from or directly quoted from this source.`;
}