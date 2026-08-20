/**
 * LLM drafting for the Story Brief. Follows src/lib/heart/agent.ts's grounding discipline
 * (explicit "don't guess" rules + a post-hoc validation pass) rather than the looser pattern in
 * src/lib/ai/retro-generator.ts, since avoiding aspirational/unverified language is the explicit
 * ask behind this feature (Kristin Penney, citing the Agent launch; flagged again by Matt Yang).
 *
 * Input model: generation is NOT purely automated from Aha/Jira. The real PM workflow is
 * talk-it-through (optionally a recorded call) -> AI drafts -> PM validates, so `sourceNotes`
 * (pasted transcript/bullets) is the primary narrative source for the sections Aha/Jira can't
 * possibly cover (why prioritized, value story, personas, open decisions, soft commitments).
 * Delivery-validation facts are always used to ground/fact-check sections 1 and 4 regardless.
 */

// `generateObject` is dynamically imported inside generateStoryBrief() rather than statically
// here, so pure functions (postProcessGrounding, isReadyToRatify, toStoryBriefContent) can be
// unit tested without loading the `ai` package's browser-streams dependencies (jsdom lacks
// TransformStream, which eventsource-parser needs at import time).
import { z } from 'zod';
import { resolveDefaultModel } from '@/lib/ai/resolve-model';
import { assembleStoryBriefContext, type StoryBriefContext } from './context';
import { renderHarvestForPrompt } from './harvest';

// ── Structured output schema — mirrors the real Story Brief template exactly ──────────────

const claimSourceEnum = z.enum([
  'aha_description',
  'aha_workflow_status',
  'jira_epic_status',
  'jira_child_issue',
  'source_notes',
  'epic_comment',
  'meeting_transcript',
  'unstated_assumption',
]);

const claimSchema = z.object({
  text: z.string(),
  source: claimSourceEnum.describe('Where this specific claim comes from. Use unstated_assumption if it cannot be grounded in the provided facts or notes.'),
  grounded: z.boolean().describe('True only if this claim is directly supported by the cited source.'),
});

const narrativeSection = z.object({
  narrative: z.string(),
  claims: z.array(claimSchema),
  open_flags: z.array(z.string()).describe('Statements the model wanted to make but could not ground — surfaced to the PM instead of asserted as fact.'),
});

export const storyBriefOutputSchema = z.object({
  what_we_are_building: narrativeSection.extend({
    disruption_assessment: z.enum(['none', 'moderate', 'significant']),
  }),
  why_we_prioritized_it: narrativeSection,
  value_story: z.object({
    working_narrative: z.string(),
    vignette: z.string(),
    roi_hypothesis: z.string(),
    platform_pull_through: z.string(),
    claims: z.array(claimSchema),
  }),
  launch_scope: z.object({
    in_scope: z.array(z.object({ item: z.string(), note: z.string() })),
    out_of_scope: z.array(z.object({ item: z.string(), reason: z.string() })),
  }),
  personas: z.array(
    z.object({ persona: z.string(), trigger_and_need: z.string(), lead_message: z.string() })
  ),
  open_decisions: z.array(
    z.object({
      item: z.string(),
      owner: z.string(),
      blocks: z.string(),
      gate_type: z.enum(['naming', 'pricing', 'launch_window', 'other']).default('other'),
    })
  ),
  soft_commitments: z.array(z.string()).describe('"None identified" is a valid single entry.'),
  downstream_deliverables: z.object({
    chain: z.array(z.string()),
    enablement_plan: z.string(),
    marketing_plan: z.string(),
  }),
  overall_confidence: z.enum(['high', 'medium', 'low']),
});

export type StoryBriefOutput = z.infer<typeof storyBriefOutputSchema>;

// ── Grounding discipline ────────────────────────────────────────────────────────────────

const BANNED_PHRASES = [
  'seamless',
  'seamlessly',
  'revolutionary',
  'revolutionize',
  'game-changing',
  'game changer',
  'best-in-class',
  'best in class',
  'delight',
  'transform',
  'transformative',
  '10x',
  'industry-leading',
  'cutting-edge',
  'world-class',
];

/**
 * Re-run banned-phrase and unstated-assumption checks server-side rather than trusting the
 * model's self-reported `grounded`/`overall_confidence`. This is a heuristic net, not a proof —
 * free-text claims can't be verified with certainty the way HEART validates against ID lists.
 * The human ratification step remains the real control.
 */
export function postProcessGrounding(
  output: StoryBriefOutput,
  context: StoryBriefContext,
  sourceNotes?: string
): StoryBriefOutput {
  const referenceText = [
    context.validation.aha_description,
    sourceNotes,
    ...context.harvest.comments.map((c) => `${c.text} ${c.movement_cause || ''}`),
    ...context.harvest.transcripts.map((t) => t.text),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  const groundClaim = (claim: z.infer<typeof claimSchema>) => {
    if (claim.source === 'unstated_assumption') {
      return { ...claim, grounded: false };
    }
    const lowerText = claim.text.toLowerCase();
    const usesBannedPhrase = BANNED_PHRASES.some((phrase) => lowerText.includes(phrase));
    if (usesBannedPhrase && !referenceText.includes(BANNED_PHRASES.find((p) => lowerText.includes(p))!)) {
      return { ...claim, grounded: false };
    }
    return claim;
  };

  const groundSection = <T extends { claims: z.infer<typeof claimSchema>[]; open_flags: string[] }>(
    section: T
  ): T => {
    const claims = section.claims.map(groundClaim);
    const newlyUngrounded = claims
      .filter((c, i) => c.grounded === false && section.claims[i]?.grounded !== false)
      .map((c) => c.text);
    return { ...section, claims, open_flags: [...section.open_flags, ...newlyUngrounded] };
  };

  const what_we_are_building = groundSection(output.what_we_are_building);
  const why_we_prioritized_it = groundSection(output.why_we_prioritized_it);
  const value_story = {
    ...output.value_story,
    claims: output.value_story.claims.map(groundClaim),
  };

  const allClaims = [
    ...what_we_are_building.claims,
    ...why_we_prioritized_it.claims,
    ...value_story.claims,
  ];
  const ungroundedFraction = allClaims.length > 0
    ? allClaims.filter((c) => !c.grounded).length / allClaims.length
    : 0;

  // Recompute confidence deterministically rather than trusting the model's self-report.
  let overall_confidence: StoryBriefOutput['overall_confidence'] = 'high';
  if (!context.validation.aha_available || !context.validation.jira_available || context.validation.gap_detected) {
    overall_confidence = 'medium';
  }
  if (ungroundedFraction > 0.3 || (!context.validation.aha_available && !context.validation.jira_available)) {
    overall_confidence = 'low';
  }

  return {
    ...output,
    what_we_are_building,
    why_we_prioritized_it,
    value_story,
    overall_confidence,
  };
}

/** Ratification gate: "goes to v1.0 only when this list is empty or explicitly deferred." */
export function isReadyToRatify(
  openDecisions: Array<{ status?: 'open' | 'resolved' | 'deferred' }>
): boolean {
  return openDecisions.every((d) => d.status === 'resolved' || d.status === 'deferred');
}

/**
 * Storage shape for `epic_story_brief.content`/`ai_draft`: the AI output schema plus a
 * PM-managed `status` on each open decision (the model can't know resolution status —
 * that's set by human review). Defaults every freshly generated item to 'open'.
 */
export interface StoryBriefContent extends Omit<StoryBriefOutput, 'open_decisions'> {
  open_decisions: Array<
    StoryBriefOutput['open_decisions'][number] & { status: 'open' | 'resolved' | 'deferred' }
  >;
}

/**
 * The three gate items the Story Brief template lists as standing bullets under
 * section 6 — they are part of the form, not findings the model discovers. If a
 * PM's notes never mention pricing, the honest brief says "pricing undecided",
 * not nothing: a silently absent pricing gate is exactly the "even finding out
 * IF there is a pricing/packaging impact takes sleuthing" complaint.
 */
const STANDING_GATES: Array<{
  gate_type: 'naming' | 'pricing' | 'launch_window';
  item: string;
  blocks: string;
}> = [
  {
    gate_type: 'naming',
    item: 'Naming: market-facing name confirmed? Internal codenames never go to market.',
    blocks: 'Every downstream asset inherits the name, so it resolves first.',
  },
  {
    gate_type: 'pricing',
    item: 'Pricing / packaging: included, add-on, or tier?',
    blocks: 'Messaging, quoting guidance, and campaign CTAs.',
  },
  {
    gate_type: 'launch_window',
    item: 'Launch window + channels: date and tier-appropriate channel footprint.',
    blocks: 'Workback dates and the channel plan.',
  },
];

export function toStoryBriefContent(output: StoryBriefOutput): StoryBriefContent {
  const decisions = output.open_decisions.map((d) => ({ ...d, status: 'open' as const }));

  // Backfill any standing gate the model did not raise, so all three always
  // appear and must be resolved or explicitly deferred before ratification.
  for (const gate of STANDING_GATES) {
    if (decisions.some((d) => d.gate_type === gate.gate_type)) continue;
    decisions.push({
      item: gate.item,
      owner: 'Unassigned',
      blocks: gate.blocks,
      gate_type: gate.gate_type,
      status: 'open' as const,
    });
  }

  return { ...output, open_decisions: decisions };
}

// ── LLM call ────────────────────────────────────────────────────────────────────────────

export interface GenerateStoryBriefResult {
  context: StoryBriefContext;
  output: StoryBriefOutput;
}

export async function generateStoryBrief(
  epicId: string,
  sourceNotes?: string
): Promise<GenerateStoryBriefResult> {
  const model = resolveDefaultModel('claude-haiku-4-5-20251001', 'gemini-2.5-flash');
  if (!model) {
    throw new Error('No AI model configured (set CLAUDE_API_KEY/ANTHROPIC_API_KEY or GEMINI_API_KEY)');
  }

  const { generateObject } = await import('ai');
  const context = await assembleStoryBriefContext(epicId);
  const { epic, validation } = context;
  const harvestBlock = renderHarvestForPrompt(context.harvest);

  const { object } = await generateObject({
    model,
    schema: storyBriefOutputSchema,
    prompt: `
You are drafting a Story Brief — the single day-one PM-to-PMM handoff document for the epic "${epic.name}" (Tier: ${epic.tier || 'Unknown'}).

## Grounding facts (the ONLY source-system facts you may cite)
- Aha available: ${validation.aha_available}
- Aha description: ${validation.aha_description || '(none provided)'}
- Aha workflow_status: ${validation.aha_workflow_status || '(unknown)'}
- Jira available: ${validation.jira_available}
- Jira epic: ${validation.jira_epic_key || '(not linked)'} — status: ${validation.jira_epic_status || '(unknown)'} (category: ${validation.jira_epic_status_category || '(unknown)'})
- Jira child issues: ${validation.child_issue_done} of ${validation.child_issue_total} done
- Delivery gap detected: ${validation.gap_detected}${validation.gap_description ? ` — ${validation.gap_description}` : ''}
- Target launch date: ${epic.target_launch_date || '(not set)'} | GA date: ${epic.scheduled_ga_dev_date || '(not set)'}

## What ClearGo already knows (cite as "epic_comment" or "meeting_transcript")
${harvestBlock || '(nothing recorded in ClearGo for this epic)'}

## PM's notes / call transcript (richest source for sections 2, 3, 5, 6, 7 — none of that is derivable from Aha/Jira)
${sourceNotes?.trim() || '(none provided — use the grounding facts and ClearGo history above, and flag in open_flags anything you still cannot support)'}

## Instructions
Draft all 8 sections of the Story Brief:
1. What we are building — plain language, plus a disruption_assessment (none/moderate/significant).
2. Why we prioritized it — root problem + evidence, from the notes above only.
3. The value story — working narrative, a short vignette, an ROI hypothesis, platform pull-through.
4. Launch scope — in / out, each row with a stated reason. If a delivery gap was detected above, it MUST appear in out_of_scope (or open_decisions) — never describe something as fully shipped when Jira shows incomplete work.
5. Personas & segments.
6. Open decisions (gate items) — every unresolved question blocking downstream work, with an owner. The template carries three standing gates that must ALWAYS appear regardless of whether the notes mention them: naming (gate_type "naming"), pricing/packaging (gate_type "pricing"), and launch window + channels (gate_type "launch_window"). If the notes settle one, say what was settled; if they are silent, state that it is undecided and name who owns it. Never omit one because it was not discussed.
7. Soft commitments & known audience expectations — "None identified" is a valid entry if nothing was mentioned.
8. Downstream deliverables this brief feeds — the standard chain (messaging doc -> launch/campaign brief -> enablement doc), enablement plan, marketing plan.

## Grounding rules — critical
- Every claim in what_we_are_building, why_we_prioritized_it, and value_story must cite a source. If you cannot ground a statement in the facts, ClearGo history, or notes above, tag it "unstated_assumption" and duplicate it into open_flags instead of asserting it as fact.
- ClearGo comments are first-class evidence, not colour. A comment recording a release movement and its cause is the best available answer for why timing changed or scope was cut — cite it as "epic_comment" rather than treating the question as unanswered.
- Comments are a HISTORICAL record, each true only as of its own timestamp. Dates quoted inside a comment ("GA1: Feb 19") are what was believed then, and are frequently superseded by a later comment or simply stale. Never restate a date from a comment as the current plan: the authoritative dates are the target launch and GA dates in the grounding facts above. Use comments for WHY, not for WHEN.
- Dates and commitments quoted inside comments ARE relevant to section 7: an ETA that was communicated and then moved is a known audience expectation. Record it as what was previously communicated, attributed and dated, not as the current plan.
- Never use unearned marketing language (e.g. "seamless," "revolutionary," "game-changing," "best-in-class," "10x," "cutting-edge") unless that literal phrase already appears in the Aha description or the notes.
- Be specific and concrete. Prefer "no update yet" over inventing plausible-sounding detail.
`,
  });

  const grounded = postProcessGrounding(object, context, sourceNotes);
  return { context, output: grounded };
}
