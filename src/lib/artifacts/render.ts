/**
 * Turning a structured draft into document text.
 *
 * The Google Doc is the system of record, so the draft has to land IN the
 * document, not beside it. Each artifact declares a token map: schema field ->
 * `{{token}}` placeholder in the template, filled with `replaceAllText`.
 *
 * NOTE ON TEMPLATES: Kristin's originals use prose placeholders in gray italic
 * (`[2-4 sentences]`, and `[name]` three times in the Story Brief header meaning
 * three different people), which cannot be filled safely by find-and-replace.
 * These maps target the `{{token}}` forks. Against an untokenised template every
 * replacement simply matches nothing — the copy is created and the draft is
 * still persisted and reviewable in ClearGO, so this degrades rather than
 * breaking.
 */
import type { ArtifactType } from '@/types/artifacts';

type Draft = Record<string, unknown>;

/** Safe field read — the model can omit anything, and a crash here loses the draft. */
function str(value: unknown, fallback = ''): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return fallback;
}

function section(draft: Draft, key: string): Record<string, unknown> {
    const value = draft[key];
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function list(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** Bulleted lines. Empty input yields an explicit statement, never a blank gap. */
function bullets(items: string[], emptyLabel = 'None identified'): string {
    const clean = items.map((i) => i.trim()).filter(Boolean);
    if (clean.length === 0) return emptyLabel;
    return clean.map((i) => `• ${i}`).join('\n');
}

/**
 * A two-column table rendered as text. Docs' batchUpdate cannot fill an existing
 * table cell by find-and-replace, so tabular sections become indented lines —
 * legible, and the human editing the Doc can reflow them.
 */
function rows(items: Array<[string, string]>, emptyLabel: string): string {
    if (items.length === 0) return emptyLabel;
    return items.map(([left, right]) => `• ${left} — ${right}`).join('\n');
}

const BUILDERS: Record<ArtifactType, (d: Draft) => Record<string, string>> = {
    gate_checklist: (d) => {
        const gate = (key: string) => {
            const s = section(d, key);
            const checks = list(s.checks).map(
                (c) => `${str(c.check)} → ${str(c.verdict, 'unknown').toUpperCase()}: ${str(c.evidence, 'no evidence recorded')}`
            );
            return bullets(checks, 'No checks recorded');
        };
        const beta = section(d, 'gate_3_beta');
        return {
            gate_1_naming: gate('gate_1_naming'),
            gate_2_pricing: gate('gate_2_pricing'),
            // The template is emphatic that a live price with a moving structure
            // does not clear, so state it rather than leaving it implied.
            pricing_model_stable:
                section(d, 'gate_2_pricing').model_is_stable === true
                    ? 'Yes — the packaging model is settled.'
                    : 'NO — the model is still in flight. This gate does not clear on a live price alone.',
            gate_3_beta: beta.applicable === true ? gate('gate_3_beta') : 'Not applicable — no design-partner beta for this capability.',
            confidence: str(d.overall_confidence, 'unknown'),
        };
    },

    story_brief: (d) => {
        const what = section(d, 'what_we_are_building');
        const why = section(d, 'why_we_prioritized_it');
        const value = section(d, 'value_story');
        const scope = section(d, 'launch_scope');
        const downstream = section(d, 'downstream_deliverables');

        return {
            what_we_are_building: str(what.narrative),
            disruption_assessment: str(what.disruption_assessment, 'none'),
            why_we_prioritized_it: str(why.narrative),
            working_narrative: str(value.working_narrative),
            vignette: str(value.vignette),
            roi_hypothesis: str(value.roi_hypothesis),
            platform_pull_through: str(value.platform_pull_through),
            in_scope: rows(
                list(scope.in_scope).map((r) => [str(r.item), str(r.note)]),
                'Not yet defined'
            ),
            out_of_scope: rows(
                list(scope.out_of_scope).map((r) => [str(r.item), str(r.reason)]),
                'Nothing explicitly excluded — confirm before circulating.'
            ),
            personas: rows(
                list(d.personas).map((p) => [str(p.persona), `${str(p.trigger_and_need)} | Lead: ${str(p.lead_message)}`]),
                'Not yet defined'
            ),
            open_decisions: rows(
                list(d.open_decisions).map((x) => [
                    `[${str(x.gate_type, 'other')}] ${str(x.item)}`,
                    `owner: ${str(x.owner, 'Unassigned')} — blocks: ${str(x.blocks)}`,
                ]),
                'None open'
            ),
            soft_commitments: bullets(
                (Array.isArray(d.soft_commitments) ? d.soft_commitments : []).map((s) => str(s))
            ),
            downstream_deliverables: bullets(
                (Array.isArray(downstream.chain) ? downstream.chain : []).map((s) => str(s)),
                'Standard chain'
            ),
            enablement_plan: str(downstream.enablement_plan),
            marketing_plan: str(downstream.marketing_plan),
            confidence: str(d.overall_confidence, 'unknown'),
        };
    },

    messaging_brief: (d) => {
        const naming = section(d, 'naming_and_usage');
        const positioning = section(d, 'positioning');
        const house = section(d, 'message_house');
        const register = section(d, 'claims_register');
        const boiler = section(d, 'boilerplate');
        const hero = list(house.pillars).find((p) => p.is_hero === true);

        return {
            naming_summary: str(naming.summary),
            naming_rules: rows(
                list(naming.rules).map((r) => [`Say "${str(r.say_this)}"`, `not "${str(r.not_this)}" — ${str(r.why)}`]),
                'Not yet defined'
            ),
            positioning_statement: str(positioning.statement),
            working_narrative: str(positioning.working_narrative),
            message_house: rows(
                list(house.pillars).map((p) => [
                    `${str(p.name)}${p.is_hero === true ? ' (HERO)' : ''}`,
                    `${str(p.claim)} | Proof: ${str(p.proof)}`,
                ]),
                'Not yet defined'
            ),
            hero_pillar: hero ? str(hero.name) : 'Not yet chosen — every asset leads with this, so it resolves first.',
            roof_line: str(house.roof_line),
            foundation: str(house.foundation),
            persona_messaging: rows(
                list(d.persona_messaging).map((p) => [
                    str(p.persona),
                    `${str(p.lead_message)} | Hears: ${str(p.hears)} | Avoid: ${str(p.avoid)}`,
                ]),
                'Not yet defined'
            ),
            cleared_claims: rows(
                list(register.cleared).map((c) => [str(c.claim), `exact wording: "${str(c.exact_wording)}"`]),
                'None cleared yet — the field has nothing approved to say.'
            ),
            restricted_claims: rows(
                list(register.restricted).map((c) => [
                    str(c.claim),
                    `${str(c.reason)} — upgrades when: ${str(c.upgrade_condition, 'not specified')}`,
                ]),
                'None restricted'
            ),
            talk_tracks: rows(
                list(d.talk_tracks).map((t) => [str(t.situation), `"${str(t.script)}" — ${str(t.coaching_note)}`]),
                'None yet'
            ),
            boilerplate_25: str(boiler.words_25),
            boilerplate_50: str(boiler.words_50),
            boilerplate_100: str(boiler.words_100),
            open_items: rows(
                list(d.open_items).map((x) => [str(x.item), `owner: ${str(x.owner, 'Unassigned')} — unblocks: ${str(x.unblocks)}`]),
                'None — ready to ratify'
            ),
            confidence: str(d.overall_confidence, 'unknown'),
        };
    },

    enablement_guide: (d) => {
        const what = section(d, 'what_this_is');
        const why = section(d, 'why_it_matters');
        const fits = section(d, 'where_it_fits');
        const messaging = section(d, 'key_messaging');
        const discovery = section(d, 'discovery_questions');
        const caps = section(d, 'key_capabilities');
        const pricing = section(d, 'pricing_and_packaging');
        const useCases = section(d, 'top_use_cases');
        const t1 = section(d, 'tier_1_additions');

        return {
            what_this_is: str(what.summary),
            important_note: str(what.important_note),
            high_level_narrative: str(what.high_level_narrative),
            without: bullets((Array.isArray(why.without) ? why.without : []).map((s) => str(s))),
            with: bullets((Array.isArray(why.with) ? why.with : []).map((s) => str(s))),
            bottom_line: str(why.bottom_line),
            lifecycle_stage: str(fits.lifecycle_stage),
            platform_layer: str(fits.platform_layer),
            platform_role: str(fits.platform_role),
            key_message: str(fits.key_message),
            elevator_pitch: str(messaging.elevator_pitch),
            csm_talk_track: str(messaging.csm_talk_track),
            situational_tracks: rows(
                list(messaging.situational_tracks).map((t) => [str(t.use_when), `"${str(t.script)}" — ${str(t.coaching_note)}`]),
                'None yet'
            ),
            sdr_hooks: bullets((Array.isArray(messaging.sdr_hooks) ? messaging.sdr_hooks : []).map((s) => str(s))),
            do_not: bullets((Array.isArray(messaging.do_not) ? messaging.do_not : []).map((s) => str(s)), 'None recorded'),
            do: bullets((Array.isArray(messaging.do) ? messaging.do : []).map((s) => str(s)), 'None recorded'),
            pricing_faq: rows(
                list(d.pricing_faq).map((q) => [str(q.question), str(q.answer)]),
                'Not yet answered — the field must not improvise pricing.'
            ),
            discovery_questions: rows(
                list(discovery.by_persona).map((p) => [
                    str(p.persona),
                    (Array.isArray(p.questions) ? p.questions : []).map((q) => str(q)).join(' / '),
                ]),
                'Not yet defined'
            ),
            standard_response: str(discovery.standard_response),
            key_capabilities: rows(
                list(caps.capabilities).map((c) => [str(c.capability), str(c.why_it_matters)]),
                'Not yet defined'
            ),
            // The template requires this and notes most guides skip it.
            capability_boundaries: rows(
                list(caps.boundaries).map((b) => [str(b.boundary), str(b.how_to_talk_about_it)]),
                'NOT YET DEFINED — the field must know the limits as well as the strengths.'
            ),
            pricing_summary: str(pricing.summary),
            pricing_table: rows(
                list(pricing.segments).map((s) => [
                    `${str(s.segment)} (${str(s.employee_count)})`,
                    `${str(s.annual_price)} ${str(s.notes)}`.trim(),
                ]),
                'Not yet priced'
            ),
            ideal_customer_profile: rows(
                list(d.ideal_customer_profile).map((i) => [str(i.segment), str(i.why)]),
                'Not yet defined'
            ),
            top_use_cases: rows(
                list(useCases.by_process).map((u) => [
                    str(u.process),
                    (Array.isArray(u.use_cases) ? u.use_cases : []).map((c) => str(c)).join('; '),
                ]),
                'Not yet defined'
            ),
            day_one_value: str(useCases.day_one_value),
            objection_handling: rows(
                list(d.objection_handling).map((o) => [`"${str(o.objection)}"`, str(o.response)]),
                'Not yet scripted'
            ),
            collateral_index: rows(
                list(d.collateral_index).map((c) => [str(c.asset), `${str(c.status)} — ${str(c.where_to_find_it)}`]),
                'Not yet catalogued'
            ),
            // Tier 1 only; empty for Tier 2 so the placeholder does not linger.
            product_deep_dive: str(t1.product_deep_dive),
            persona_grid: str(t1.persona_grid),
            internal_faq: str(t1.internal_faq),
            configuration_reference: str(t1.configuration_reference),
            csm_email_guide: str(t1.csm_email_guide),
            communication_timeline: str(t1.communication_timeline),
            confidence: str(d.overall_confidence, 'unknown'),
        };
    },

    marketing_brief: (d) => {
        const id = section(d, 'identification');
        const market = section(d, 'customer_and_market');
        const messaging = section(d, 'messaging');
        const metrics = section(d, 'success_metrics');
        const risks = section(d, 'risks_and_approvals');

        return {
            launch_name: str(id.launch_name),
            tier: str(id.tier),
            ga_date: str(id.ga_date),
            stage_1_triage: str(id.stage_1_triage),
            stage_4_readiness_review: str(id.stage_4_readiness_review),
            post_launch_review: str(id.post_launch_review),
            customer_problem: str(market.problem),
            proof: str(market.proof),
            competitive: rows(
                list(market.competitive).map((c) => [str(c.competitor), `${str(c.their_position)} → we counter: ${str(c.our_counter)}`]),
                'Not yet analysed'
            ),
            messaging: str(messaging.quoted_from_messaging_doc),
            hero_pillar: str(messaging.hero_pillar),
            pricing_and_packaging: str(d.pricing_and_packaging),
            raci: rows(
                list(d.raci).map((r) => [`${str(r.function)} — ${str(r.name, 'Unassigned')}`, str(r.responsibility)]),
                'Not yet assigned'
            ),
            asset_checklist: rows(
                list(d.asset_checklist).map((a) => [str(a.asset), `${str(a.owner, 'Unassigned')} — ${str(a.status)}`]),
                'Not yet defined'
            ),
            gtm_motion: rows(
                list(d.gtm_motion).map((g) => [
                    str(g.audience),
                    `${(Array.isArray(g.channels) ? g.channels : []).map((c) => str(c)).join(', ')} — ${str(g.message)}`,
                ]),
                'Not yet planned'
            ),
            workback_calendar: rows(
                list(d.workback_calendar).map((w) => [`${str(w.timing)} ${str(w.milestone)}`, str(w.owner, 'Unassigned')]),
                'Not yet planned'
            ),
            leading_metrics: bullets((Array.isArray(metrics.leading) ? metrics.leading : []).map((s) => str(s)), 'Not yet defined'),
            lagging_metrics: bullets((Array.isArray(metrics.lagging) ? metrics.lagging : []).map((s) => str(s)), 'Not yet defined'),
            risks: rows(
                list(risks.risks).map((r) => [str(r.risk), `${str(r.mitigation)} (owner: ${str(r.owner, 'Unassigned')})`]),
                'None identified'
            ),
            approvals: rows(
                list(risks.approvals).map((a) => [`${str(a.role)} — ${str(a.name, 'Unassigned')}`, str(a.status, 'pending')]),
                'Not yet signed'
            ),
            confidence: str(d.overall_confidence, 'unknown'),
        };
    },
};

/**
 * Schema output -> `{{token}}` values for the document.
 *
 * Never throws: a malformed draft yields empty strings rather than losing the
 * whole run, and `replaceTokens` substitutes a visible "[to be completed]" for
 * anything blank so no `{{token}}` survives into a circulated document.
 */
export function buildTokenMap(type: ArtifactType, draft: Draft): Record<string, string> {
    try {
        return BUILDERS[type](draft ?? {});
    } catch (err) {
        console.error(`buildTokenMap failed for ${type}`, err);
        return {};
    }
}
