/**
 * Per-artifact prompts.
 *
 * Kept out of registry.ts because they are long and change often — the schema
 * is a contract, the prompt is copy. Each returns the instruction body; the
 * shared preamble (facts, ClearGO history, grounding rules) is assembled once
 * in generator.ts so every artifact is held to the same standard.
 */
import type { ArtifactType } from '@/types/artifacts';

export interface PromptInput {
    launchName: string;
    tier: string;
    /** Rendered text of the APPROVED upstream artifact, when there is one. */
    upstreamText: string | null;
    upstreamLabel: string | null;
}

const PROMPTS: Record<ArtifactType, (input: PromptInput) => string> = {
    gate_checklist: () => `
Draft the Launch Gate Checklist — the commercialization gate that runs BEFORE any Story Brief work starts.

The grounding facts above include structured context from Aha! custom fields: Business Case, Competitive, Personas/Segments, GTM Signals, Customer Evidence, and Success Metrics. Draw on ALL of these — they are not optional background, they are the primary evidence for gate verdicts.

Gate 1 — Naming. Check whether the market-facing name is settled: is there an approved name, is it distinct from internal codenames, is it consistent with existing brand naming, are retired names identified, and is there a trademark/conflict concern. Cross-reference the GTM Signals section for any "GTM name" or naming-related fields. Sign-off is PMM + CPO.

Gate 2 — Pricing / packaging. Check whether the commercial model is settled: included vs add-on vs tier, effect on existing customers, mid-contract sale path, renewal treatment, quoting guidance, and calculator status. Draw directly from the GTM Signals section — the grounding facts include pricing_model, pricing_packaging, and rollout_process. Set model_is_stable to FALSE if the structure is still moving, even when a number exists — the template is explicit that a live price with a moving structure does NOT clear this gate.

Gate 3 — Beta proof gate. Set applicable=false unless there is direct evidence of a design-partner beta. Check the Customer Evidence section for beta_program, orgs_with_soft_commitment, and customer_commitment_date. When applicable, check: named existing-customer design partners, success criteria agreed up front, feedback loop and NDA in place, scope limited to a workflow, and whether the claims held up live. Sign-off is PMM + Product + SE lead.

For every check use verdict "unknown" with evidence naming exactly what is missing, rather than guessing "cleared". An unknown that names its gap is useful; a wrong "cleared" is how a launch ships with the wrong name on it.
`,

    story_brief: () => `
Draft the Story Brief — the day-one PM-to-PMM handoff that everything downstream quotes.

The grounding facts above include structured context from Aha! custom fields. Use them actively — the Business Case, Competitive, Personas/Segments, and Customer Evidence sections are your primary source material, not the epic description alone.

1. What we are building — plain language, no jargon. Include disruption_assessment (none/moderate/significant): what visibly changes for users. This field is mandatory even when the answer is "none", because anything other than none triggers the change-management track.
2. Why we prioritized it — the root problem and its evidence, not the feature description. Draw from the Business Case section: primary_goal, mission, challenges. If RICE or WSJF scores are present, include them as prioritization evidence.
3. The value story — working narrative (one sentence a CSM could say out loud), a concrete before/after vignette, an ROI hypothesis, and platform pull-through (which existing narrative this extends — never a standalone story). Ground the ROI hypothesis in the Business Case's impact field and the Success Metrics section when available.
4. Launch scope, in and out. The most protective section: anything the field could plausibly overclaim goes in out_of_scope with a stated reason. If a delivery gap was reported above, it MUST appear here.
5. Personas and segments — buyer AND user where they differ. Draw directly from the Personas/Segments section in the grounding facts. The Aha! custom fields include personas, customers, org_segment, and org_industry — use them to fill this section concretely rather than leaving it generic.
6. Open decisions. Three standing gates ALWAYS appear regardless of whether anything above mentions them: naming (gate_type "naming"), pricing/packaging ("pricing"), and launch window + channels ("launch_window"). If the facts settle one, say what was settled; if they are silent, say it is undecided and name who owns it. Never omit one because it was not discussed.
7. Soft commitments — anything already promised in deals, tickets, or analyst calls. Check the Customer Evidence section for orgs_with_soft_commitment and customer_commitment_date. "None identified" is valid but must be stated explicitly.
8. Downstream deliverables this brief feeds.
`,

    messaging_brief: (input) => `
Draft the Messaging & Positioning document — the single source every launch asset quotes.

${input.upstreamLabel ? `The ratified ${input.upstreamLabel} is provided above. Four things are QUOTED from it, not rewritten: the working narrative (from its value story), the hero pillar's proof (from its vignette), the naming rules (from its naming gate), and the scope limits that constrain the claims register.` : 'No upstream Story Brief was available — flag every claim that would normally come from one.'}

The grounding facts include Competitive Landscape and GTM Context sections. Use the Competitive section to fill out positioning — the competitors and differentiators from Aha! custom fields are your primary source for the message house pillars. Use GTM Signals for pricing language and packaging references.

1. Naming and usage — codify the decision as rules, not just a name: say this / not this / why. If naming is undecided this is a gate item, and every downstream asset inherits it.
2. Positioning statement — "For [audience] who [need], [name] is the [category] that [benefit] — unlike [alternative], it [differentiator]." Then the working narrative, quoted. The [alternative] and [differentiator] slots should be filled from the Competitive section in the grounding facts.
3. Message house — three pillars maximum, exactly one marked is_hero (the differentiator every asset leads with). Each pillar carries its proof. Roof line is the narrative; foundation is the platform story it sits on. Derive pillars from the differentiators listed in the Competitive section.
4. Persona messaging — one lead message per persona in their language, plus what to avoid saying to them. Draw personas from the Personas/Segments section in the grounding facts — use the actual persona names, customer names, and segments from Aha!, not generic placeholders.
5. Claims register — this is the document's teeth. Cleared entries carry the exact wording the field may use. Restricted entries carry the reason AND the upgrade condition ("if X validates, this moves left"). Restrict framings and overpromise patterns, not just factual claims.
6. Situational talk tracks — only conversations that need exact words. Each with when to use it, the script, and a coaching note.
7. Boilerplate at 25, 50, and 100 words. The 100-word form usually depends on packaging language; if pricing is unresolved, say so plainly rather than inventing "included with".
8. Open items blocking v1.0 — each with owner and what it unblocks.
`,

    enablement_guide: (input) => `
Draft the Field Enablement Guide. This is the twelve-section Tier 2 baseline${input.tier === 'TIER_1' ? ', plus the Tier 1 additions (product deep dive, persona grid, internal FAQ, configuration reference, CSM email guide, communication timeline)' : '. Omit tier_1_additions entirely — this is a Tier 2 launch'}.

${input.upstreamLabel ? `Every claim, name, and script here QUOTES the ratified ${input.upstreamLabel} above. Do not restate it in new words — that is how story drift happens across assets.` : 'No upstream Messaging Brief was available — flag every claim that would normally quote it.'}

The grounding facts include Competitive Landscape, Target Audience, and GTM Context. Use the Competitive section for Section 6 (Competitive Positioning) — fill out competitor comparisons with the actual competitors and differentiators from Aha!. Use Target Audience for Section 4 (Target Personas) — use real persona names and segments, not generic ones.

Scripts go in quotes, ready to say verbatim. If a rep has to adapt it, it is not done.

Two sections most guides skip and this template requires:
- Section 1's "Important Note": the single most common mispositioning, corrected preemptively ("not a standalone product", "not a replacement for X").
- Section 7's capability boundaries: what it does NOT do, taken from the Story Brief's out-of-scope table. An unexpected limit discovered in a demo costs far more than an honest one raised in conversation.

The pricing FAQ answers what is decided and explicitly ambers what is not — never let the field improvise pricing. Draw from GTM Context in the grounding facts for pricing_model and pricing_packaging. Keep the "is this a separate product?" question; it always comes up.

The collateral index must be honest about status. A stale entry there erodes trust in the whole guide.
`,

    marketing_brief: (input) => `
Draft the Marketing Brief. Despite the name this is NOT a piece of marketing collateral — it is the launch operating document, the thing the launch is actually run from.

${input.upstreamLabel ? `Messaging is QUOTED from the ratified ${input.upstreamLabel} above, never restated.` : 'No upstream messaging was available — flag the messaging section as ungrounded.'}

The grounding facts include aggregate launch context across all epics: Business Case, Competitive Landscape, Target Audience, GTM Context, Customer Evidence, and Success Definitions. Use these actively — section 2 (Customer and Market) draws from Target Audience and Competitive Landscape, section 4 (Pricing and Packaging) draws from GTM Context, section 9 (Success Metrics) draws from Success Definitions.

Ten parts:
1. Launch identification and key dates — GA, Stage 1 Triage, Stage 4 Readiness Review (T-1), Post-Launch Review (T+60).
2. Customer and market — the problem, the proof, and a competitive table. Fill the competitive table from the Competitive Landscape section in the grounding facts. Use Target Audience for persona details and segment information.
3. Messaging, quoted from the ratified messaging doc, with the hero pillar named.
4. Pricing and packaging. Draw from GTM Context — the grounding facts include pricing_model and pricing_packaging from Aha!. If absent, flag as unresolved.
5. Stakeholder RACI — one row per function, each marked R, A, C, or I. Exactly one A per row set.
6. Asset checklist with owners and status.
7. GTM motion plan by audience. Use Target Audience segments and industries to structure this section.
8. Workback calendar from T-6 to T+60.
9. Success metrics, split leading and lagging. Draw from Success Definitions in the grounding facts — the Aha! custom fields include definition_of_success and analytics_enablement.
10. Risks with mitigations and owners, plus the approval log.

Where a name is genuinely unknown, write "Unassigned" and raise it as an open flag. Do not invent people — a RACI naming the wrong person is worse than one admitting a gap.
`,
};

export function buildArtifactPrompt(type: ArtifactType, input: PromptInput): string {
    return PROMPTS[type](input).trim();
}

/**
 * The grounding rules every artifact is held to. Extracted verbatim in spirit
 * from the Story Brief generator, whose discipline is the reason its drafts are
 * trustworthy.
 */
export const GROUNDING_RULES = `
## Grounding rules — critical
- Every claim in a section that carries a claims array must cite a source. If you cannot ground a statement in the facts, ClearGO history, owner answers, or upstream document above, tag it "unstated_assumption" and duplicate it into open_flags rather than asserting it as fact.
- ClearGO comments are first-class evidence, not colour. A comment recording a release movement and its cause is the best available answer for why timing or scope changed — cite it as "epic_comment".
- Comments are a HISTORICAL record, each true only as of its own timestamp. Dates quoted inside a comment are what was believed then and are frequently stale. Never restate a date from a comment as the current plan: the authoritative dates are in the grounding facts. Use comments for WHY, not for WHEN.
- Dates and commitments quoted inside comments ARE relevant to soft commitments: an ETA that was communicated and then moved is a known audience expectation. Record it as what was previously communicated, attributed and dated — not as the current plan.
- Never use unearned marketing language ("seamless", "revolutionary", "game-changing", "best-in-class", "10x", "cutting-edge") unless that literal phrase already appears in the source material.
- Be specific and concrete. Prefer "no update yet" over inventing plausible-sounding detail. A gap the owner can fill in ten seconds is far more useful than a confident guess they have to catch.
`.trim();
