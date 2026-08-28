/**
 * Structured output schemas for the five launch artifacts.
 *
 * Each mirrors the section structure of Kristin's template exactly — the
 * template is the contract, and a schema that drifts from it produces a
 * document that cannot be filed. Section keys match the heading order so the
 * token map in registry.ts is a mechanical 1:1.
 *
 * Sources: the five templates in the canonical Drive folder
 * (1YnFMIbDYDZN2sef4xmWM5GENFCxDVGum), read 2026-08-25.
 */
import { z } from 'zod';

// ── Shared grounding primitives ─────────────────────────────────────────────

/**
 * Where a claim came from. `unstated_assumption` is the important one: it is
 * how the model admits it is guessing, which is what feeds the interview queue
 * instead of being asserted as fact.
 */
export const claimSourceEnum = z.enum([
    'aha_description',
    'aha_workflow_status',
    'jira_epic_status',
    'jira_child_issue',
    'source_notes',
    'epic_comment',
    'meeting_transcript',
    'upstream_artifact',
    'unstated_assumption',
]);

export const claimSchema = z.object({
    text: z.string(),
    source: claimSourceEnum.describe(
        'Where this specific claim comes from. Use unstated_assumption if it cannot be grounded in the provided facts.'
    ),
    grounded: z.boolean().describe('True only if this claim is directly supported by the cited source.'),
});

export type Claim = z.infer<typeof claimSchema>;

export const narrativeSection = z.object({
    narrative: z.string(),
    claims: z.array(claimSchema),
    open_flags: z
        .array(z.string())
        .describe('Statements the model wanted to make but could not ground — asked of the owner instead of asserted.'),
});

/** Any section shaped like a narrative section, for the generic grounding pass. */
export interface GroundableSection {
    claims: Claim[];
    open_flags: string[];
}

// ── 00 Launch Gate Checklist ────────────────────────────────────────────────

/**
 * The commercialization gate that precedes the Story Brief: "No Story Brief
 * starts until Naming and Pricing/Packaging are cleared."
 *
 * Modelled as checks with an explicit verdict rather than free text, because
 * the whole point of the gate is that it is answerable. Christa Weinell's
 * complaint that "even finding out IF there is a pricing/packaging impact takes
 * sleuthing" is a complaint about exactly this being unstructured.
 */
const gateCheck = z.object({
    check: z.string(),
    verdict: z.enum(['cleared', 'blocked', 'not_applicable', 'unknown']),
    evidence: z.string().describe('What supports the verdict. "unknown" must say what is missing.'),
});

export const gateChecklistSchema = z.object({
    gate_1_naming: z.object({
        checks: z.array(gateCheck),
        signoff_roles: z.array(z.string()).describe('PMM + CPO per the template.'),
        claims: z.array(claimSchema),
        open_flags: z.array(z.string()),
    }),
    gate_2_pricing: z.object({
        checks: z.array(gateCheck),
        // The template is emphatic: a live price with a moving structure does
        // not clear the gate. Modelled explicitly so it cannot be glossed.
        model_is_stable: z.boolean().describe('False if the pricing model is still in flight, even if a price exists.'),
        signoff_roles: z.array(z.string()).describe('CPO + RevOps per the template.'),
        claims: z.array(claimSchema),
        open_flags: z.array(z.string()),
    }),
    gate_3_beta: z.object({
        applicable: z.boolean().describe('Only where the capability runs a design-partner beta.'),
        checks: z.array(gateCheck),
        signoff_roles: z.array(z.string()).describe('PMM + Product + SE lead per the template.'),
        claims: z.array(claimSchema),
        open_flags: z.array(z.string()),
    }),
    overall_confidence: z.enum(['high', 'medium', 'low']),
});

// ── 01 Story Brief ──────────────────────────────────────────────────────────

export const storyBriefSchema = z.object({
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
        open_flags: z.array(z.string()),
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

// ── 02 Messaging & Positioning ──────────────────────────────────────────────

export const messagingBriefSchema = z.object({
    naming_and_usage: z.object({
        summary: z.string().describe('The approved name, what it extends, what is retired externally.'),
        rules: z.array(
            z.object({ say_this: z.string(), not_this: z.string(), why: z.string() })
        ),
        claims: z.array(claimSchema),
        open_flags: z.array(z.string()),
    }),
    positioning: z.object({
        statement: z
            .string()
            .describe('For [audience] who [need], [name] is the [category] that [benefit] — unlike [alt], it [differentiator].'),
        // Quoted from Story Brief §3, never rewritten — the template is explicit.
        working_narrative: z.string().describe('Quoted verbatim from the Story Brief value story, not rewritten.'),
        claims: z.array(claimSchema),
        open_flags: z.array(z.string()),
    }),
    message_house: z.object({
        pillars: z
            .array(
                z.object({
                    name: z.string(),
                    claim: z.string(),
                    proof: z.string(),
                    is_hero: z.boolean(),
                })
            )
            .describe('Three pillars maximum; exactly one marked is_hero.'),
        roof_line: z.string(),
        foundation: z.string().describe('The existing platform story this reinforces — never replaces.'),
    }),
    persona_messaging: z.array(
        z.object({ persona: z.string(), lead_message: z.string(), hears: z.string(), avoid: z.string() })
    ),
    /**
     * The template calls this "the document's teeth". Restricted entries carry
     * an upgrade condition so a claim can move left when evidence arrives.
     */
    claims_register: z.object({
        cleared: z.array(z.object({ claim: z.string(), exact_wording: z.string() })),
        restricted: z.array(
            z.object({ claim: z.string(), reason: z.string(), upgrade_condition: z.string() })
        ),
    }),
    talk_tracks: z.array(
        z.object({ situation: z.string(), script: z.string(), coaching_note: z.string() })
    ),
    boilerplate: z.object({
        words_25: z.string(),
        words_50: z.string(),
        words_100: z
            .string()
            .describe('Typically blocked on packaging language; say so plainly if pricing is unresolved.'),
    }),
    open_items: z.array(z.object({ item: z.string(), owner: z.string(), unblocks: z.string() })),
    overall_confidence: z.enum(['high', 'medium', 'low']),
});

// ── 03 Enablement Guide ─────────────────────────────────────────────────────

/**
 * Twelve sections are the Tier 2 baseline. Tier 1 adds six more; those are
 * optional in the schema so one shape serves both tiers and a T2 guide is not
 * padded with empty T1 sections.
 */
export const enablementGuideSchema = z.object({
    what_this_is: z.object({
        summary: z.string(),
        important_note: z.string().describe('The single most common mispositioning, corrected preemptively.'),
        high_level_narrative: z.string().describe('The roof line from the messaging doc plus one supporting sentence.'),
        claims: z.array(claimSchema),
        open_flags: z.array(z.string()),
    }),
    why_it_matters: z.object({
        without: z.array(z.string()),
        with: z.array(z.string()).describe('Each entry mirrors the corresponding "without" entry, in order.'),
        bottom_line: z.string(),
    }),
    where_it_fits: z.object({
        lifecycle_stage: z.string().describe('HIRE / SUCCEED / GROW / full lifecycle'),
        platform_layer: z.string(),
        platform_role: z.string(),
        key_message: z.string(),
    }),
    key_messaging: z.object({
        elevator_pitch: z.string().describe('30-second script, verbatim-ready.'),
        csm_talk_track: z.string(),
        situational_tracks: z.array(
            z.object({ use_when: z.string(), script: z.string(), coaching_note: z.string() })
        ),
        sdr_hooks: z.array(z.string()),
        do_not: z.array(z.string()).describe('Straight from the messaging doc claims register.'),
        do: z.array(z.string()),
    }),
    pricing_faq: z.array(z.object({ question: z.string(), answer: z.string() })),
    discovery_questions: z.object({
        by_persona: z.array(z.object({ persona: z.string(), questions: z.array(z.string()) })),
        standard_response: z.string(),
    }),
    key_capabilities: z.object({
        capabilities: z.array(z.object({ capability: z.string(), why_it_matters: z.string() })),
        // The template requires this and notes most guides skip it.
        boundaries: z.array(
            z.object({ boundary: z.string(), how_to_talk_about_it: z.string() })
        ).describe('What it does NOT do, from the Story Brief in/out table.'),
    }),
    pricing_and_packaging: z.object({
        summary: z.string().describe('If undecided, say the field does not quote and name who routes pricing questions.'),
        segments: z.array(
            z.object({ segment: z.string(), employee_count: z.string(), annual_price: z.string(), notes: z.string() })
        ),
    }),
    ideal_customer_profile: z.array(z.object({ segment: z.string(), why: z.string() })),
    top_use_cases: z.object({
        by_process: z.array(z.object({ process: z.string(), use_cases: z.array(z.string()) })),
        day_one_value: z.string(),
    }),
    objection_handling: z.array(z.object({ objection: z.string(), response: z.string() })),
    collateral_index: z.array(
        z.object({ asset: z.string(), status: z.string(), where_to_find_it: z.string() })
    ),
    // Tier 1 additions.
    tier_1_additions: z
        .object({
            product_deep_dive: z.string(),
            persona_grid: z.string(),
            internal_faq: z.string(),
            configuration_reference: z.string(),
            csm_email_guide: z.string(),
            communication_timeline: z.string(),
        })
        .optional()
        .describe('Populate only for Tier 1 launches; omit entirely for Tier 2.'),
    overall_confidence: z.enum(['high', 'medium', 'low']),
});

// ── 04 Marketing Brief ──────────────────────────────────────────────────────

/**
 * Renamed from "Campaign Brief" by Kristin on 2026-08-26.
 *
 * Despite the new name this is not a piece of marketing collateral — it is the
 * launch operating document. Ten parts, including the RACI and the approval log
 * that make it the thing the launch is actually run from.
 */
export const marketingBriefSchema = z.object({
    identification: z.object({
        launch_name: z.string(),
        tier: z.string(),
        ga_date: z.string(),
        stage_1_triage: z.string(),
        stage_4_readiness_review: z.string().describe('T-1'),
        post_launch_review: z.string().describe('T+60'),
        claims: z.array(claimSchema),
        open_flags: z.array(z.string()),
    }),
    customer_and_market: z.object({
        problem: z.string(),
        proof: z.string(),
        competitive: z.array(
            z.object({ competitor: z.string(), their_position: z.string(), our_counter: z.string() })
        ),
    }),
    messaging: z.object({
        quoted_from_messaging_doc: z
            .string()
            .describe('Quoted from the ratified Messaging Brief, never restated in new words.'),
        hero_pillar: z.string(),
    }),
    pricing_and_packaging: z.string(),
    raci: z.array(
        z.object({
            function: z.string(),
            name: z.string(),
            responsibility: z.enum(['R', 'A', 'C', 'I']),
        })
    ),
    asset_checklist: z.array(
        z.object({ asset: z.string(), owner: z.string(), status: z.string() })
    ),
    gtm_motion: z.array(
        z.object({ audience: z.string(), channels: z.array(z.string()), message: z.string() })
    ),
    workback_calendar: z.array(
        z.object({ milestone: z.string(), timing: z.string().describe('e.g. T-6, T-1, T+60'), owner: z.string() })
    ),
    success_metrics: z.object({
        leading: z.array(z.string()),
        lagging: z.array(z.string()),
    }),
    risks_and_approvals: z.object({
        risks: z.array(z.object({ risk: z.string(), mitigation: z.string(), owner: z.string() })),
        approvals: z.array(z.object({ role: z.string(), name: z.string(), status: z.string() })),
    }),
    overall_confidence: z.enum(['high', 'medium', 'low']),
});

export type GateChecklistOutput = z.infer<typeof gateChecklistSchema>;
export type StoryBriefOutput = z.infer<typeof storyBriefSchema>;
export type MessagingBriefOutput = z.infer<typeof messagingBriefSchema>;
export type EnablementGuideOutput = z.infer<typeof enablementGuideSchema>;
export type MarketingBriefOutput = z.infer<typeof marketingBriefSchema>;

export type ArtifactOutput =
    | GateChecklistOutput
    | StoryBriefOutput
    | MessagingBriefOutput
    | EnablementGuideOutput
    | MarketingBriefOutput;
