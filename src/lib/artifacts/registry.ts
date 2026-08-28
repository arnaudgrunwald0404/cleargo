/**
 * The artifact registry — one entry per document.
 *
 * Everything that differs between the five artifacts lives here: the schema,
 * the prompt, which sections carry claims, which criterion row the document
 * satisfies, who owns it, which tiers get it, and how schema fields map to
 * `{{tokens}}` in the template.
 *
 * Everything else (grounding, flags, drafting, doc creation, review) is written
 * once against this interface. That is the whole difference from
 * src/lib/story-brief/, where the prompt, schema, section names, gates, and
 * capability ids are all hardcoded to one document.
 */
import type { z } from 'zod';
import type { ArtifactType } from '@/types/artifacts';
import type { LaunchTier } from '@/types/launches';
import {
    gateChecklistSchema,
    storyBriefSchema,
    messagingBriefSchema,
    enablementGuideSchema,
    marketingBriefSchema,
} from './schemas';

/** Who the system chases. "PM for Story, PMM for everything downstream." */
export type ArtifactOwnerRole = 'PM' | 'PMM' | 'PMM+ProdEd' | 'PMM+Growth' | 'CPO+RevOps';

export interface ArtifactDefinition {
    type: ArtifactType;
    label: string;

    /**
     * The `criterion.label` this document satisfies. Matched by label because
     * criterion rows have no stable key column — see 20260819000000, which
     * looks rows up the same way.
     *
     * Null for the gate checklist: it spans three separate criteria (naming,
     * pricing, beta) rather than mapping to one.
     */
    criterionLabel: string | null;

    /** The artifact whose APPROVED content is an input to this one. */
    dependsOn: ArtifactType | null;

    /**
     * Labels this criterion used to carry. Consulted only when the current
     * label finds nothing, so a renamed artifact keeps working against a
     * database where the rename migration has not yet run.
     */
    legacyCriterionLabels?: string[];

    ownerRole: ArtifactOwnerRole;

    /** Launch tiers this artifact applies to. */
    tiers: LaunchTier[];

    /** Env var holding the template Doc id, so template ids are not in git. */
    templateEnvVar: string;

    schema: z.ZodTypeAny;

    /**
     * Sections carrying `claims` and `open_flags`. The grounding pass walks
     * exactly these; a section not listed is never fact-checked, so omit only
     * sections that are structural (tables, lists) rather than assertive.
     */
    claimSections: readonly string[];

    /** One line for Slack copy and the review request. */
    reviewAsk: string;
}

const T1_T2: LaunchTier[] = ['TIER_1', 'TIER_2'];

export const ARTIFACT_REGISTRY: Record<ArtifactType, ArtifactDefinition> = {
    gate_checklist: {
        type: 'gate_checklist',
        label: 'Launch Gate Checklist',
        criterionLabel: null,
        dependsOn: null,
        ownerRole: 'CPO+RevOps',
        tiers: T1_T2,
        templateEnvVar: 'GOOGLE_TEMPLATE_GATE_CHECKLIST_ID',
        schema: gateChecklistSchema,
        claimSections: ['gate_1_naming', 'gate_2_pricing', 'gate_3_beta'],
        reviewAsk: 'Confirm naming and pricing/packaging are cleared before the Story Brief starts.',
    },

    story_brief: {
        type: 'story_brief',
        label: 'Story Brief',
        criterionLabel: 'Story Brief delivered to PMM + Product Education',
        // Kristin's checklist: "No Story Brief starts until Naming and
        // Pricing/Packaging are cleared."
        dependsOn: 'gate_checklist',
        ownerRole: 'PM',
        // Required at every tier — the BOM slide is explicit that tier changes
        // depth, not the steps. The criterion row is seeded 'ALL' to match.
        tiers: T1_T2,
        templateEnvVar: 'GOOGLE_TEMPLATE_STORY_BRIEF_ID',
        schema: storyBriefSchema,
        claimSections: ['what_we_are_building', 'why_we_prioritized_it', 'value_story'],
        reviewAsk: 'Check the scope table and open decisions — this is what everything downstream quotes.',
    },

    messaging_brief: {
        type: 'messaging_brief',
        label: 'Messaging Brief',
        criterionLabel: 'Message Brief ratified',
        dependsOn: 'story_brief',
        ownerRole: 'PMM',
        tiers: T1_T2,
        templateEnvVar: 'GOOGLE_TEMPLATE_MESSAGING_BRIEF_ID',
        schema: messagingBriefSchema,
        claimSections: ['naming_and_usage', 'positioning'],
        reviewAsk: 'Check the claims register — cleared vs restricted is what keeps ten assets telling one story.',
    },

    enablement_guide: {
        type: 'enablement_guide',
        label: 'Enablement Guide',
        // The seeded label, verified against the live runway 2026-08-26. It was
        // 'Enablement Brief delivered' in 20260819000000 and renamed when
        // 20260821000500 split enablement into Field (PMM, this document) and
        // Product (Product Education, a training deliverable with no template).
        criterionLabel: 'Field Enablement Guide delivered',
        legacyCriterionLabels: ['Enablement Brief delivered'],
        dependsOn: 'messaging_brief',
        ownerRole: 'PMM+ProdEd',
        tiers: T1_T2,
        templateEnvVar: 'GOOGLE_TEMPLATE_ENABLEMENT_GUIDE_ID',
        schema: enablementGuideSchema,
        claimSections: ['what_this_is'],
        reviewAsk: 'Check the capability boundaries — the field must know the limits as well as the strengths.',
    },

    marketing_brief: {
        type: 'marketing_brief',
        label: 'Marketing Brief',
        criterionLabel: 'Marketing Brief delivered',
        // Renamed 2026-08-26. Kept so the document still links to its readiness
        // row in any environment where 20260826000000 has not been applied --
        // criterion rows are matched by label, so a stale DB would otherwise
        // silently produce an unlinked artifact rather than an error.
        legacyCriterionLabels: ['Campaign Brief delivered'],
        // Assets depend on Enablement rather than Campaign in the seeded chain,
        // so Campaign hangs off Enablement too.
        dependsOn: 'enablement_guide',
        ownerRole: 'PMM+Growth',
        tiers: T1_T2,
        templateEnvVar: 'GOOGLE_TEMPLATE_MARKETING_BRIEF_ID',
        schema: marketingBriefSchema,
        claimSections: ['identification'],
        reviewAsk: 'Check the RACI and the approval log — this is the document the launch is run from.',
    },
};

/** Registry entries in workback order. */
export const ARTIFACT_ORDER: ArtifactType[] = [
    'gate_checklist',
    'story_brief',
    'messaging_brief',
    'enablement_guide',
    'marketing_brief',
];

export function getArtifactDefinition(type: ArtifactType): ArtifactDefinition {
    return ARTIFACT_REGISTRY[type];
}

/** Which artifacts a launch of this tier should have. */
export function artifactsForTier(tier: LaunchTier | null): ArtifactDefinition[] {
    return ARTIFACT_ORDER.map((t) => ARTIFACT_REGISTRY[t]).filter((def) =>
        // An untiered launch gets everything: better to create a document nobody
        // needs than to silently skip one when the tier is set later.
        tier === null ? true : def.tiers.includes(tier)
    );
}

/** The template Doc id for an artifact, or null when unconfigured. */
export function getTemplateId(def: ArtifactDefinition): string | null {
    return process.env[def.templateEnvVar]?.trim() || null;
}

/**
 * Resolve the owner for an artifact from the launch's own people.
 *
 * Kristin's rule: Story goes to the PM (handed to PMM at kickoff), everything
 * downstream to PMM. Falls back to the launch owner rather than nobody — an
 * unowned artifact is one nobody gets nudged about.
 */
export function resolveArtifactOwner(
    def: ArtifactDefinition,
    input: { launchOwnerEmail?: string | null; pmEmail?: string | null; criterionDefaultOwner?: string | null }
): string | null {
    if (def.ownerRole === 'PM' && input.pmEmail) return input.pmEmail;
    if (input.launchOwnerEmail) return input.launchOwnerEmail;
    // The seeded criterion defaults are placeholders like "[launch owner (PMM)]",
    // so only use one if it looks like a real address.
    const fallback = input.criterionDefaultOwner;
    if (fallback && fallback.includes('@')) return fallback;
    return null;
}
