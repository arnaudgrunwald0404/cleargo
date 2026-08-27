/**
 * Extracts launch-relevant context from Aha! custom fields already stored in
 * `epic.aha_fields.custom_fields`.
 *
 * The Aha client requests custom_fields on every epic fetch, and the mapping
 * extracts 20+ fields into the stored payload. This module reads that payload
 * and structures it into categories the drafting prompts can directly use:
 * business case, competitive context, persona/segment info, GTM signals,
 * customer evidence, and success metrics.
 *
 * No additional API calls — this is a pure extraction pass over data we
 * already have. If a field is null/empty it is simply omitted.
 */

export interface EpicEnrichment {
    /** Business case: goals, mission, impact, RICE/WSJF scoring. */
    businessCase?: {
        primaryGoal?: string;
        primaryInitiative?: string;
        mission?: string;
        goals?: string;
        impact?: string;
        challenges?: string;
        modifiedRice?: string | number;
        wsjf?: string | number;
        revenueRiskAnalysis?: string;
        revenue?: string;
    };

    /** Competitive landscape: competitors, differentiators, strengths/weaknesses. */
    competitiveContext?: {
        competitors?: string;
        differentiators?: string;
        strengths?: string;
        weaknesses?: string;
    };

    /** Persona and segment information from the epic. */
    personasAndSegments?: {
        personas?: string;
        customers?: string;
        orgSegment?: string;
        orgIndustry?: string;
        organization?: string;
        orgArr?: string;
    };

    /** GTM signals: pricing, packaging, activation, setup. */
    gtmSignals?: {
        pricingModel?: string;
        pricing?: string;
        pricingPackaging?: string;
        activationProcess?: string;
        newOrgSetup?: string;
        existingOrgSetup?: string;
        gtmLink?: string;
        gtmModule?: string;
        gtmName?: string;
        rolloutProcess?: string;
        definitionForGtmTeam?: string;
        readyForGtmTeam?: string;
    };

    /** Customer evidence: feedback, beta programs, soft commitments. */
    customerEvidence?: {
        customerFeedback?: string;
        betaProgram?: string;
        orgsWithSoftCommitment?: string;
        customerCommitmentDate?: string;
        likes?: string;
        dislikes?: string;
    };

    /** Success metrics and measurement. */
    successMetrics?: {
        definitionOfSuccess?: string;
        analyticsEnablement?: string;
        reach?: string;
    };

    /** Dependencies and cross-functional context. */
    dependencies?: {
        crossFunctionalDependencies?: string;
        productModule?: string;
        components?: string;
        category?: string;
    };

    /** Timeline and planning signals. */
    timeline?: {
        estimatedGaRelease?: string;
        scheduledGaDev?: string;
        offScheduleReleaseDate?: string;
        releaseConfidence?: string;
        tentativeRelease?: string;
        tentativelyTiming?: string;
        developmentStartDate?: string;
        designDueDate?: string;
        phase1DefinitionDeadline?: string;
        phase2SalesEnablementComplete?: string;
        phase3GtmActivationCutoff?: string;
        phase4aGoNoGoMeeting?: string;
        phase4bInternalReadinessDistributed?: string;
    };

    /** Raw custom fields that didn't map to a category but may still be useful. */
    rawFields?: Record<string, string | number | null>;
}

/**
 * Extracts enrichment from the `aha_fields` payload stored on the epic row.
 * Returns an EpicEnrichment object with only the fields that have values.
 */
export function extractEpicEnrichment(ahaFields: Record<string, unknown> | null | undefined): EpicEnrichment | null {
    if (!ahaFields) return null;

    const customFields = (ahaFields.custom_fields ?? {}) as Record<string, unknown>;
    const standardFields = (ahaFields.standard_fields ?? {}) as Record<string, unknown>;

    const result: EpicEnrichment = {};

    // ── Business Case ──────────────────────────────────────────────
    const businessCase = filterNulls({
        primaryGoal: str(customFields.primary_goal),
        primaryInitiative: str(customFields.primary_initiative),
        mission: str(customFields.mission),
        goals: str(customFields.goals),
        impact: str(customFields.impact),
        challenges: str(customFields.challenges),
        modifiedRice: scalar(customFields.modified_rice),
        wsjf: scalar(customFields.wsjf),
        revenueRiskAnalysis: str(customFields.revenue_risk_analysis),
        revenue: str(customFields.revenue),
    });
    if (Object.keys(businessCase).length > 0) result.businessCase = businessCase;

    // ── Competitive Context ────────────────────────────────────────
    const competitiveContext = filterNulls({
        competitors: str(customFields.competitors),
        differentiators: str(customFields.differentiators),
        strengths: str(customFields.strengths),
        weaknesses: str(customFields.weaknesses),
    });
    if (Object.keys(competitiveContext).length > 0) result.competitiveContext = competitiveContext;

    // ── Personas and Segments ──────────────────────────────────────
    const personasAndSegments = filterNulls({
        personas: str(customFields.personas),
        customers: str(customFields.customers),
        orgSegment: str(customFields.org_segment),
        orgIndustry: str(customFields.org_industry),
        organization: str(customFields.organization),
        orgArr: str(customFields.arr),
    });
    if (Object.keys(personasAndSegments).length > 0) result.personasAndSegments = personasAndSegments;

    // ── GTM Signals ────────────────────────────────────────────────
    const gtmSignals = filterNulls({
        pricingModel: str(customFields.pricing_model),
        pricing: str(customFields.pricing),
        pricingPackaging: str(customFields.pricing_packaging),
        activationProcess: str(customFields.activation_process),
        newOrgSetup: str(customFields.new_org_setup),
        existingOrgSetup: str(customFields.existing_org_setup),
        gtmLink: str(customFields.gtm_link),
        gtmModule: str(customFields.gtm_module),
        gtmName: str(customFields.gtm_name),
        rolloutProcess: str(customFields.rollout_process),
        definitionForGtmTeam: str(customFields.ready_for_gtm_team),
        readyForGtmTeam: str(customFields.ready_for_gtm_team),
    });
    if (Object.keys(gtmSignals).length > 0) result.gtmSignals = gtmSignals;

    // ── Customer Evidence ──────────────────────────────────────────
    const customerEvidence = filterNulls({
        customerFeedback: str(customFields.customer_feedback),
        betaProgram: str(customFields.beta_program),
        orgsWithSoftCommitment: str(customFields.orgs_with_soft_commitment),
        customerCommitmentDate: str(customFields.customer_commitment_date),
        likes: str(customFields.likes),
        dislikes: str(customFields.dislikes),
    });
    if (Object.keys(customerEvidence).length > 0) result.customerEvidence = customerEvidence;

    // ── Success Metrics ────────────────────────────────────────────
    const successMetrics = filterNulls({
        definitionOfSuccess: str(customFields.definition_of_success),
        analyticsEnablement: str(customFields.analytics_enablement),
        reach: scalar(customFields.reach),
    });
    if (Object.keys(successMetrics).length > 0) result.successMetrics = successMetrics;

    // ── Dependencies ───────────────────────────────────────────────
    const dependencies = filterNulls({
        crossFunctionalDependencies: str(customFields.crossfunctional_dependencies),
        productModule: str(customFields.product_module),
        components: str(customFields.components),
        category: str(customFields.category),
    });
    if (Object.keys(dependencies).length > 0) result.dependencies = dependencies;

    // ── Timeline ───────────────────────────────────────────────────
    const timeline = filterNulls({
        estimatedGaRelease: str(customFields.estimated_ga_release_pm_owned),
        scheduledGaDev: str(customFields.scheduled_ga_release_dev_only),
        offScheduleReleaseDate: str(customFields.off_schedule_release_date),
        releaseConfidence: str(customFields.release_confidence),
        tentativeRelease: str(customFields.tentative_release),
        tentativelyTiming: str(customFields.tentative_release_txt),
        developmentStartDate: str(customFields.development_start_date),
        designDueDate: str(customFields.design_due_date),
        phase1DefinitionDeadline: str(customFields.phase_1_definition_deadline),
        phase2SalesEnablementComplete: str(customFields.phase_2_sales_enablement_complete),
        phase3GtmActivationCutoff: str(customFields.date_enabled_for_sales),
        phase4aGoNoGoMeeting: str(customFields.gonogo_meeting),
        phase4bInternalReadinessDistributed: str(customFields.phase_4_internal_readiness_distributed),
    });
    if (Object.keys(timeline).length > 0) result.timeline = timeline;

    // ── Raw fields (anything we didn't categorize but is non-null) ─
    const categorizedKeys = new Set<string>([
        'primary_goal', 'primary_initiative', 'mission', 'goals', 'impact',
        'challenges', 'modified_rice', 'wsjf', 'revenue_risk_analysis', 'revenue',
        'competitors', 'differentiators', 'strengths', 'weaknesses',
        'personas', 'customers', 'org_segment', 'org_industry', 'organization', 'arr',
        'pricing_model', 'pricing', 'pricing_packaging', 'activation_process',
        'new_org_setup', 'existing_org_setup', 'gtm_link', 'gtm_module', 'gtm_name',
        'rollout_process', 'ready_for_gtm_team',
        'customer_feedback', 'beta_program', 'orgs_with_soft_commitment',
        'customer_commitment_date', 'likes', 'dislikes',
        'definition_of_success', 'analytics_enablement', 'reach',
        'crossfunctional_dependencies', 'product_module', 'components', 'category',
        'estimated_ga_release_pm_owned', 'scheduled_ga_release_dev_only',
        'off_schedule_release_date', 'release_confidence', 'tentative_release',
        'tentative_release_txt', 'development_start_date', 'design_due_date',
        'phase_1_definition_deadline', 'phase_2_sales_enablement_complete',
        'date_enabled_for_sales', 'gonogo_meeting',
        'phase_4_internal_readiness_distributed',
    ]);

    const rawFields: Record<string, string | number | null> = {};
    for (const [key, value] of Object.entries(customFields)) {
        if (!categorizedKeys.has(key)) {
            const scalarValue = scalar(value);
            if (scalarValue != null && scalarValue !== '') {
                rawFields[key] = scalarValue;
            }
        }
    }
    if (Object.keys(rawFields).length > 0) result.rawFields = rawFields;

    // If everything was empty, return null rather than an empty object
    if (Object.keys(result).length === 0) return null;
    return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Coerce to a plain string, handling Aha's various object shapes. */
function str(value: unknown): string | null {
    if (value == null || value === '') return null;
    if (typeof value === 'string') return value.trim() || null;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
        // Array of values — join with ', '
        const joined = value.map((v) => str(v)).filter(Boolean).join(', ');
        return joined || null;
    }
    if (typeof value === 'object') {
        const o = value as Record<string, unknown>;
        // Aha dropdown/select fields: { name: '...' }
        if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
        // Date fields: { date: 'YYYY-MM-DD' }
        if (typeof o.date === 'string' && o.date.trim()) return o.date.trim();
        // Value wrapper: { value: '...' }
        if (o.value != null) return str(o.value);
    }
    return null;
}

/** Coerce to string or number for fields that may be either. */
function scalar(value: unknown): string | number | null {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    return str(value);
}

/** Drop null/undefined entries from an object. */
function filterNulls<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const result: Partial<T> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value != null && value !== '') {
            result[key] = value;
        }
    }
    return result;
}