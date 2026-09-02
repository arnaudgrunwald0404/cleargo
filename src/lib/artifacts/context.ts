/**
 * Grounding context for a LAUNCH, not an epic.
 *
 * A launch bundles several epics — the whole point of the Release/Launch split
 * is that three Tier 3 releases can become one Tier 1 marketing launch. So the
 * facts an artifact is grounded in are the union across `launch_epic`, not one
 * epic's.
 *
 * Reuses the epic-level validators and harvest shaping wholesale rather than
 * reimplementing them: validateEpicDelivery is the piece that stops a draft
 * claiming something shipped when Jira disagrees, and it is per-epic by nature.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { validateEpicDelivery, type DeliveryValidationResult } from '@/lib/story-brief/delivery-validator';
import {
    shapeComments,
    shapeTranscripts,
    renderHarvestForPrompt,
    isHarvestEmpty,
    type HarvestResult,
} from '@/lib/story-brief/harvest';
import type { LaunchTier } from '@/types/launches';
import { effectiveLaunchStatus } from '@/lib/launch-status';
import { extractEpicEnrichment, type EpicEnrichment } from './aha-epic-enricher';

export interface LaunchEpicSummary {
    id: string;
    name: string;
    tier: string | null;
    status: string | null;
    target_launch_date: string | null;
    scheduled_ga_dev_date: string | null;
    validation: DeliveryValidationResult;
    /** Structured context extracted from Aha! custom fields. */
    enrichment: EpicEnrichment | null;
}

export interface LaunchArtifactContext {
    launch: {
        id: string;
        name: string;
        tier: LaunchTier | null;
        target_launch_date: string | null;
        status: string;
        owner_email: string | null;
    };
    epics: LaunchEpicSummary[];
    harvest: HarvestResult;
    /** Union of the per-epic validations, for confidence scoring. */
    rollup: {
        aha_available: boolean;
        jira_available: boolean;
        gap_detected: boolean;
        gap_descriptions: string[];
    };
}

/** Same caps the epic-level harvest uses, applied across the launch's epics. */
const MAX_LAUNCH_COMMENTS = 20;
const MAX_LAUNCH_TRANSCRIPTS = 4;

export async function assembleLaunchContext(launchId: string): Promise<LaunchArtifactContext> {
    const supabase = createAdminClient();

    const { data: launch, error } = await supabase
        .from('launch')
        .select('id, name, tier, target_launch_date, status, owner_email, launch_epic(epic_id)')
        .eq('id', launchId)
        .single();

    if (error || !launch) {
        throw new Error(`Launch ${launchId} not found: ${error?.message ?? 'no row'}`);
    }

    const epicIds = ((launch.launch_epic as Array<{ epic_id: string }> | null) ?? []).map(
        (le) => le.epic_id
    );

    const epics: LaunchEpicSummary[] = [];
    if (epicIds.length > 0) {
        const { data: epicRows } = await supabase
            .from('epic')
            .select('id, name, tier, aha_id, aha_fields, jira_epic_key, owner_email, target_launch_date, scheduled_ga_dev_date, status')
            .in('id', epicIds);

        for (const epic of epicRows ?? []) {
            // Sequential rather than parallel: each call hits Jira, and a launch
            // with a dozen epics would otherwise burst straight into Jira's
            // rate limit. Correctness over latency in a background job.
            const validation = await validateEpicDelivery(epic as never, supabase);
            const enrichment = extractEpicEnrichment(epic.aha_fields as Record<string, unknown> | null | undefined);
            epics.push({
                id: epic.id as string,
                name: epic.name as string,
                tier: (epic.tier as string) ?? null,
                status: (epic.status as string) ?? null,
                target_launch_date: (epic.target_launch_date as string) ?? null,
                scheduled_ga_dev_date: (epic.scheduled_ga_dev_date as string) ?? null,
                validation,
                enrichment,
            });
        }
    }

    const harvest = await harvestLaunchContext(epicIds, supabase);

    return {
        launch: {
            id: launch.id as string,
            name: launch.name as string,
            tier: (launch.tier as LaunchTier) ?? null,
            target_launch_date: (launch.target_launch_date as string) ?? null,
            // Derived, not raw: launch.status stores only a manual override, so
            // reading it directly told the agent "null" for most launches.
            status: effectiveLaunchStatus(launch as Record<string, unknown>),
            owner_email: (launch.owner_email as string) ?? null,
        },
        epics,
        harvest,
        rollup: {
            // "Available" if ANY epic resolved — a launch with one well-linked
            // epic and one orphan is better grounded than one with none.
            aha_available: epics.some((e) => e.validation.aha_available),
            jira_available: epics.some((e) => e.validation.jira_available),
            // A gap on ANY epic taints the whole launch: the launch claims
            // everything its epics claim.
            gap_detected: epics.some((e) => e.validation.gap_detected),
            gap_descriptions: epics
                .map((e) => e.validation.gap_description)
                .filter((d): d is string => !!d),
        },
    };
}

/** ClearGO's own record: epic comments and meeting transcripts across the launch. */
async function harvestLaunchContext(
    epicIds: string[],
    supabase: ReturnType<typeof createAdminClient>
): Promise<HarvestResult> {
    if (epicIds.length === 0) return { comments: [], transcripts: [], empty: true };

    let comments: HarvestResult['comments'] = [];
    try {
        const { data } = await supabase
            .from('epic_comment')
            .select('comment_text, category, movement_cause, from_release, to_release, created_at')
            .in('epic_id', epicIds)
            .order('created_at', { ascending: false })
            .limit(MAX_LAUNCH_COMMENTS);
        comments = shapeComments((data ?? []) as never[]).slice(0, MAX_LAUNCH_COMMENTS);
    } catch (err) {
        console.warn('harvestLaunchContext: comments unavailable', err);
    }

    let transcripts: HarvestResult['transcripts'] = [];
    try {
        // Two paths to a meeting, deduped by id — the epic link lives on the
        // meeting row for some and in the join table for others.
        const [direct, joined] = await Promise.all([
            supabase
                .from('meeting')
                .select('id, title, transcript, meeting_date')
                .or(epicIds.map((id) => `epic_id.eq.${id},linked_epic_id.eq.${id}`).join(','))
                .order('meeting_date', { ascending: false })
                .limit(MAX_LAUNCH_TRANSCRIPTS),
            supabase
                .from('meeting_epic')
                .select('meeting:meeting(id, title, transcript, meeting_date)')
                .in('epic_id', epicIds)
                .limit(MAX_LAUNCH_TRANSCRIPTS),
        ]);

        const byId = new Map<string, Record<string, unknown>>();
        for (const m of (direct.data ?? []) as Array<Record<string, unknown>>) {
            byId.set(String(m.id), m);
        }
        // Supabase types the embedded join as an array even for a to-one
        // relation, so normalise both shapes rather than trusting either.
        for (const row of (joined.data ?? []) as unknown as Array<{
            meeting?: Record<string, unknown> | Record<string, unknown>[] | null;
        }>) {
            const meetings = Array.isArray(row.meeting) ? row.meeting : row.meeting ? [row.meeting] : [];
            for (const m of meetings) {
                if (m?.id) byId.set(String(m.id), m);
            }
        }

        transcripts = shapeTranscripts([...byId.values()] as never[]).slice(0, MAX_LAUNCH_TRANSCRIPTS);
    } catch (err) {
        console.warn('harvestLaunchContext: transcripts unavailable', err);
    }

    return { comments, transcripts, empty: isHarvestEmpty(comments, transcripts) };
}

/**
 * The grounding facts block, rendered for a prompt. Every artifact's prompt
 * opens with this so the model has one consistent statement of what is known.
 *
 * Includes structured context from Aha! custom fields (business case,
 * competitive landscape, personas, GTM signals, customer evidence, success
 * metrics) so the drafting agent has far more than just description + status.
 */
export function renderLaunchFacts(context: LaunchArtifactContext): string {
    const { launch, epics, rollup } = context;

    const epicLines = epics.length
        ? epics
              .map((e) => {
                  const v = e.validation;
                  const lines = [
                      `- ${e.name} (Tier ${e.tier || 'unknown'}, status ${e.status || 'unknown'})`,
                      `    Aha: ${v.aha_available ? v.aha_workflow_status || 'linked' : 'unavailable'}`,
                      `    Jira: ${v.jira_available ? `${v.jira_epic_key} — ${v.child_issue_done}/${v.child_issue_total} child issues done` : 'not linked'}`,
                      v.gap_detected ? `    DELIVERY GAP: ${v.gap_description}` : null,
                      v.aha_description ? `    Description: ${v.aha_description.slice(0, 600)}` : null,
                      // Enrichment sections — only render non-empty categories
                      renderEnrichmentBlock(e.enrichment),
                  ].filter(Boolean);
                  return lines.join('\n');
              })
              .join('\n')
        : '(no epics linked to this launch — say so rather than inventing scope)';

    // Cross-epic enrichment aggregation: merge signals across all epics in the launch.
    const aggregateBlock = renderAggregateEnrichment(epics);

    const parts: string[] = [
        `Launch: ${launch.name}`,
        `Tier: ${launch.tier || 'not set'} | Status: ${launch.status} | Target launch date: ${launch.target_launch_date || 'not set'}`,
        '',
        'Epics in this launch:',
        epicLines,
    ];

    if (aggregateBlock) {
        parts.push('', aggregateBlock);
    }

    parts.push(
        '',
        rollup.gap_detected
            ? `DELIVERY GAPS DETECTED (${rollup.gap_descriptions.length}). These MUST appear as out-of-scope or open items — never describe gapped work as shipped.`
            : 'No delivery gaps detected between Aha and Jira.',
    );

    return parts.join('\n');
}

/** Render a single epic's enrichment into indented fact lines. */
function renderEnrichmentBlock(enrichment: EpicEnrichment | null): string | null {
    if (!enrichment) return null;

    const lines: string[] = [];

    if (enrichment.businessCase) {
        const bc = enrichment.businessCase;
        const parts: string[] = [];
        if (bc.primaryGoal) parts.push(`goal: ${bc.primaryGoal}`);
        if (bc.mission) parts.push(`mission: ${bc.mission}`);
        if (bc.modifiedRice != null) parts.push(`RICE: ${bc.modifiedRice}`);
        if (bc.wsjf != null) parts.push(`WSJF: ${bc.wsjf}`);
        if (bc.challenges) parts.push(`challenges: ${bc.challenges}`);
        if (parts.length > 0) lines.push(`    Business Case: ${parts.join(' | ')}`);
    }

    if (enrichment.competitiveContext) {
        const cc = enrichment.competitiveContext;
        const parts: string[] = [];
        if (cc.competitors) parts.push(`competitors: ${cc.competitors}`);
        if (cc.differentiators) parts.push(`differentiators: ${cc.differentiators}`);
        if (cc.strengths) parts.push(`strengths: ${cc.strengths}`);
        if (cc.weaknesses) parts.push(`weaknesses: ${cc.weaknesses}`);
        if (parts.length > 0) lines.push(`    Competitive: ${parts.join(' | ')}`);
    }

    if (enrichment.personasAndSegments) {
        const ps = enrichment.personasAndSegments;
        const parts: string[] = [];
        if (ps.personas) parts.push(`personas: ${ps.personas}`);
        if (ps.customers) parts.push(`customers: ${ps.customers}`);
        if (ps.orgSegment) parts.push(`segment: ${ps.orgSegment}`);
        if (ps.orgIndustry) parts.push(`industry: ${ps.orgIndustry}`);
        if (parts.length > 0) lines.push(`    Personas/Segments: ${parts.join(' | ')}`);
    }

    if (enrichment.gtmSignals) {
        const gtm = enrichment.gtmSignals;
        const parts: string[] = [];
        if (gtm.pricingModel) parts.push(`pricing: ${gtm.pricingModel}`);
        if (gtm.pricingPackaging) parts.push(`packaging: ${gtm.pricingPackaging}`);
        if (gtm.gtmName) parts.push(`GTM name: ${gtm.gtmName}`);
        if (gtm.rolloutProcess) parts.push(`rollout: ${gtm.rolloutProcess}`);
        if (gtm.definitionForGtmTeam) parts.push(`GTM definition: ${gtm.definitionForGtmTeam}`);
        if (parts.length > 0) lines.push(`    GTM Signals: ${parts.join(' | ')}`);
    }

    if (enrichment.customerEvidence) {
        const ce = enrichment.customerEvidence;
        const parts: string[] = [];
        if (ce.customerFeedback) parts.push(`feedback: ${ce.customerFeedback}`);
        if (ce.betaProgram) parts.push(`beta: ${ce.betaProgram}`);
        if (ce.orgsWithSoftCommitment) parts.push(`soft commitments: ${ce.orgsWithSoftCommitment}`);
        if (ce.customerCommitmentDate) parts.push(`commitment date: ${ce.customerCommitmentDate}`);
        if (parts.length > 0) lines.push(`    Customer Evidence: ${parts.join(' | ')}`);
    }

    if (enrichment.successMetrics) {
        const sm = enrichment.successMetrics;
        const parts: string[] = [];
        if (sm.definitionOfSuccess) parts.push(`success: ${sm.definitionOfSuccess}`);
        if (sm.analyticsEnablement) parts.push(`analytics: ${sm.analyticsEnablement}`);
        if (parts.length > 0) lines.push(`    Success Metrics: ${parts.join(' | ')}`);
    }

    if (enrichment.dependencies) {
        const dep = enrichment.dependencies;
        const parts: string[] = [];
        if (dep.crossFunctionalDependencies) parts.push(`deps: ${dep.crossFunctionalDependencies}`);
        if (dep.productModule) parts.push(`module: ${dep.productModule}`);
        if (parts.length > 0) lines.push(`    Dependencies: ${parts.join(' | ')}`);
    }

    return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Merge enrichment across all epics in the launch into a single summary block.
 * This gives the agent a consolidated view of the launch's business case,
 * competitive landscape, and GTM context — not just per-epic fragments.
 */
function renderAggregateEnrichment(epics: LaunchEpicSummary[]): string | null {
    const enrichments = epics.map((e) => e.enrichment).filter(Boolean) as EpicEnrichment[];
    if (enrichments.length === 0) return null;

    const sections: string[] = [];

    // Aggregate business case
    const goals = enrichments.map((e) => e.businessCase?.primaryGoal).filter(Boolean) as string[];
    const missions = enrichments.map((e) => e.businessCase?.mission).filter(Boolean) as string[];
    const challenges = enrichments.map((e) => e.businessCase?.challenges).filter(Boolean) as string[];
    const riceScores = enrichments.map((e) => e.businessCase?.modifiedRice).filter(Boolean) as (string | number)[];
    const wsjfScores = enrichments.map((e) => e.businessCase?.wsjf).filter(Boolean) as (string | number)[];

    const businessParts: string[] = [];
    if (goals.length > 0) businessParts.push(`Goals: ${goals.join('; ')}`);
    if (missions.length > 0) businessParts.push(`Missions: ${missions.join('; ')}`);
    if (challenges.length > 0) businessParts.push(`Challenges: ${challenges.join('; ')}`);
    if (riceScores.length > 0) businessParts.push(`RICE scores: ${riceScores.join(', ')}`);
    if (wsjfScores.length > 0) businessParts.push(`WSJF scores: ${wsjfScores.join(', ')}`);
    if (businessParts.length > 0) sections.push(`Business Case: ${businessParts.join(' | ')}`);

    // Aggregate competitive context
    const competitors = enrichments.map((e) => e.competitiveContext?.competitors).filter(Boolean) as string[];
    const differentiators = enrichments.map((e) => e.competitiveContext?.differentiators).filter(Boolean) as string[];
    const compParts: string[] = [];
    if (competitors.length > 0) compParts.push(`Competitors: ${deduplicateStrings(competitors).join('; ')}`);
    if (differentiators.length > 0) compParts.push(`Differentiators: ${differentiators.join('; ')}`);
    if (compParts.length > 0) sections.push(`Competitive Landscape: ${compParts.join(' | ')}`);

    // Aggregate personas
    const personas = enrichments.map((e) => e.personasAndSegments?.personas).filter(Boolean) as string[];
    const customers = enrichments.map((e) => e.personasAndSegments?.customers).filter(Boolean) as string[];
    const segments = enrichments.map((e) => e.personasAndSegments?.orgSegment).filter(Boolean) as string[];
    const industries = enrichments.map((e) => e.personasAndSegments?.orgIndustry).filter(Boolean) as string[];
    const personaParts: string[] = [];
    if (personas.length > 0) personaParts.push(`Personas: ${deduplicateStrings(personas).join('; ')}`);
    if (customers.length > 0) personaParts.push(`Customers: ${deduplicateStrings(customers).join('; ')}`);
    if (segments.length > 0) personaParts.push(`Segments: ${deduplicateStrings(segments).join('; ')}`);
    if (industries.length > 0) personaParts.push(`Industries: ${deduplicateStrings(industries).join('; ')}`);
    if (personaParts.length > 0) sections.push(`Target Audience: ${personaParts.join(' | ')}`);

    // Aggregate GTM signals
    const pricingModels = enrichments.map((e) => e.gtmSignals?.pricingModel).filter(Boolean) as string[];
    const pricingPackaging = enrichments.map((e) => e.gtmSignals?.pricingPackaging).filter(Boolean) as string[];
    const gtmNames = enrichments.map((e) => e.gtmSignals?.gtmName).filter(Boolean) as string[];
    const gtmParts: string[] = [];
    if (gtmNames.length > 0) gtmParts.push(`GTM Names: ${deduplicateStrings(gtmNames).join('; ')}`);
    if (pricingModels.length > 0) gtmParts.push(`Pricing Models: ${deduplicateStrings(pricingModels).join('; ')}`);
    if (pricingPackaging.length > 0) gtmParts.push(`Packaging: ${pricingPackaging.join('; ')}`);
    if (gtmParts.length > 0) sections.push(`GTM Context: ${gtmParts.join(' | ')}`);

    // Aggregate customer evidence
    const feedbacks = enrichments.map((e) => e.customerEvidence?.customerFeedback).filter(Boolean) as string[];
    const betas = enrichments.map((e) => e.customerEvidence?.betaProgram).filter(Boolean) as string[];
    const commitments = enrichments.map((e) => e.customerEvidence?.orgsWithSoftCommitment).filter(Boolean) as string[];
    const evidenceParts: string[] = [];
    if (feedbacks.length > 0) evidenceParts.push(`Feedback: ${feedbacks.join('; ')}`);
    if (betas.length > 0) evidenceParts.push(`Beta programs: ${deduplicateStrings(betas).join('; ')}`);
    if (commitments.length > 0) evidenceParts.push(`Soft commitments: ${commitments.join('; ')}`);
    if (evidenceParts.length > 0) sections.push(`Customer Evidence: ${evidenceParts.join(' | ')}`);

    // Aggregate success metrics
    const successes = enrichments.map((e) => e.successMetrics?.definitionOfSuccess).filter(Boolean) as string[];
    if (successes.length > 0) sections.push(`Success Definitions: ${successes.join('; ')}`);

    return sections.length > 0
        ? `## Aggregate Launch Context (across ${epics.length} epics)\n${sections.join('\n')}`
        : null;
}

/** Deduplicate strings that appear more than once across epics. */
function deduplicateStrings(strings: string[]): string[] {
    return [...new Set(strings.map((s) => s.trim()))];
}

/** Everything the model is allowed to draw on, for the grounding pass. */
export function buildReferenceText(
    context: LaunchArtifactContext,
    extras: Array<string | null | undefined> = []
): string {
    return [
        ...context.epics.map((e) => e.validation.aha_description),
        ...context.harvest.comments.map((c) => `${c.text} ${c.movement_cause || ''}`),
        ...context.harvest.transcripts.map((t) => t.text),
        ...extras,
    ]
        .filter(Boolean)
        .join('\n');
}

export { renderHarvestForPrompt };
