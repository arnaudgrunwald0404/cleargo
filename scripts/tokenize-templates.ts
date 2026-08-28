#!/usr/bin/env tsx
/**
 * Turn Kristin's templates into ClearGO-fillable ones WITHOUT losing formatting.
 *
 * Copies each original, then find-and-replaces its prose placeholders with
 * `{{token}}` markers. Replacement text inherits the formatting of the text it
 * replaces, so an amber "fill this in" placeholder becomes an amber
 * `{{token}}` — the colours, tables, headings and gray italic instructions all
 * survive because the document IS the original, only with the blanks renamed.
 *
 * This exists because regenerating the templates from HTML loses exactly that:
 * "amber = fill in, gray italic = instructions, delete before circulating" is
 * Kristin's convention for telling a PMM what to touch, and it is not decoration.
 *
 * THE AMBIGUITY PROBLEM: replaceAllText matches exact strings, and short
 * placeholders repeat. `[name]` appears three times in the Story Brief header
 * meaning PM, PMM and Prod Ed — replacing it blindly would make all three
 * identical. Anything that appears more than once is therefore only replaced
 * when the map says so explicitly; everything else is reported for a human.
 *
 * Usage:
 *   npx tsx scripts/tokenize-templates.ts --inspect <fileId>   # list placeholders + counts
 *   npx tsx scripts/tokenize-templates.ts --dry-run            # show planned replacements
 *   npx tsx scripts/tokenize-templates.ts                      # copy + tokenize all
 */
import 'dotenv/config';

process.on('unhandledRejection', (reason) => {
    const m = reason instanceof Error ? reason.message : String(reason);
    if (m.includes('was called outside a request scope')) return;
    console.error('\nUnhandled rejection:', m);
    process.exit(1);
});

import { isGoogleConfigured } from '../src/lib/google/auth';
import { copyFile, getDocument, extractDocumentText, replaceAllText } from '../src/lib/google/client';
import type { ArtifactType } from '../src/types/artifacts';

/** The originals copied into ClearGO / Templates on 2026-08-27. */
const ORIGINALS: Record<ArtifactType, { id: string; name: string }> = {
    gate_checklist: { id: '1zQZV8XaJcZDS_Qe6BlGhn3eBTyNh1ZN9HDJytoYKKw4', name: '00 Launch-Gate-Checklist_TEMPLATE' },
    story_brief: { id: '1Xy6KbX3Ip2Va3w2-FiVITF5vmXwDIGh9RTyNBzC_SIo', name: '01 Story-Brief_TEMPLATE' },
    messaging_brief: { id: '1PvHyyKFmMJFOFidocSNtI2i27BAgJFyAvSQGER6vYlI', name: '02 Messaging-Brief_TEMPLATE' },
    enablement_guide: { id: '1JtLzbz4hvME-xLSj3QDhZEJCV0hxf1_Ode04asEmsjc', name: '03 Enablement-Guide_TEMPLATE' },
    marketing_brief: { id: '1-qo7nfvNwElRagQldwGHX4heXzd-tlEHasugJn6c7nA', name: '04 Marketing-Brief_TEMPLATE' },
};

const TEMPLATES_FOLDER = '18kEJOEzw7VfEp9TMglNNVgc86WLdC9JH';

/**
 * Whether to clear the template's leftover example placeholders.
 *
 * OFF for the Marketing Brief. It is built from tables whose cells share
 * placeholders — `[owner]` appears 17 times, `[R]`/`[A]`/`[C]`/`[I]` eleven
 * times each, `[Product/PM]` nine — because they are the RACI grid and the asset
 * checklist. Those are the FORM, not filler: clearing them would leave a
 * stakeholder matrix with no roles to assign.
 */
const STRIP_EXAMPLES: Record<ArtifactType, boolean> = {
    gate_checklist: true,
    story_brief: true,
    messaging_brief: true,
    enablement_guide: true,
    marketing_brief: false,
};

/**
 * Placeholder -> token, applied IN ORDER. Longest and most specific first, so a
 * short string that is a substring of a longer one does not steal the match.
 *
 * Token names must match the maps in src/lib/artifacts/render.ts and the header
 * map in docFactory.ts exactly — a token in the document that neither map fills
 * survives into a circulated draft as a literal `{{token}}`.
 */
const REPLACEMENTS: Record<ArtifactType, Array<[string, string]>> = {
    story_brief: [
        // Header line replaced whole: it contains three identical `[name]`
        // placeholders that cannot be told apart individually.
        [
            'Tier: [1 / 2]   PM / business owner: [name]   PMM: [name]   Prod Ed: [name]   Target window: [quarter / date or TBD]   Story code: [4-5 letters, e.g. SPOT3]',
            'Tier: {{tier}}   PM / business owner: {{pm_owner}}   PMM: {{pmm_owner}}   Prod Ed: {{prod_ed_owner}}   Target window: {{target_window}}   Story code: {{story_code}}',
        ],
        ['[Story Name]: [Working Narrative in a Phrase]', '{{story_code}}: {{working_narrative}}'],
        ['[2–4 sentences. Name the net-new capabilities explicitly.]', '{{what_we_are_building}}'],
        [
            '[None / Moderate / Significant — describe what visibly changes for users. If anything changes, the change-management track applies: customer notice, training-doc lead time. This field is mandatory even when the answer is “none.”]',
            '{{disruption_assessment}}',
        ],
        ['[Problem statement 1 + evidence]', '{{why_we_prioritized_it}}'],
        ['[One sentence a CSM could say out loud. The “why it matters” — not the feature list.]', '{{working_narrative}}'],
        [
            '[One concrete before/after scenario — a real or realistic customer moment this capability changes. This feeds the quarterly product council proof-point pipeline.]',
            '{{vignette}}',
        ],
        [
            '[What hard-dollar or time lever does this pull? Cite sources where possible (BLS, Gartner, SHRM…). Flag if it should become an ROI-calculator lever.]',
            '{{roi_hypothesis}}',
        ],
        [
            '[How does this reinforce the unified-platform story? Which existing narrative does it extend — never a standalone story.]',
            '{{platform_pull_through}}',
        ],
        ['[Capability 1] — [one-line description]', '{{in_scope}}'],
        ['[Exclusion 1] — [reason: not built / unconfirmed / dependency / legal]', '{{out_of_scope}}'],
        ['[Persona 1]', '{{personas}}'],
        ['[Decision 1 — owner — what it blocks]', '{{open_decisions}}'],
        ['[Commitment / expectation 1 — who, what, where recorded]', '{{soft_commitments}}'],
        ['[training approach, timing constraints, in-product guidance]', '{{enablement_plan}}'],
        ['[blog / campaign / sell sheet & deck updates / analyst outreach per tier]', '{{marketing_plan}}'],
    ],

    messaging_brief: [
        [
            'Market name: [approved name]   Internal designation: [codename]   Owner: [PMM]   Tier: [1 / 2]   Status: [Draft — list what blocks v1.0]',
            'Market name: {{launch_name}}   Internal designation: {{story_code}}   Owner: {{owner}}   Tier: {{tier}}   Status: {{version}}',
        ],
        ['[Story Name] — Messaging & Positioning', '{{launch_name}} — Messaging & Positioning'],
        [
            '[1–2 sentences: the approved name, what it is an extension of (if applicable), what is retired externally.]',
            '{{naming_summary}}',
        ],
        ['[Approved name — first mention; short form — subsequent]', '{{naming_rules}}'],
        ['[Positioning statement]', '{{positioning_statement}}'],
        [
            '[From story brief §3 — the phrase a CSM says out loud. Note which existing company narrative it extends.]',
            '{{working_narrative}}',
        ],
        ['[2–3 sentences: the claim in customer language]', '{{message_house}}'],
        ['[the one-phrase narrative]', '{{roof_line}}'],
        ['[the existing platform story this reinforces — never replaces]', '{{foundation}}'],
        ['[One sentence in their language]', '{{persona_messaging}}'],
        ['“[Claim 1 — exact words the field can use]”', '{{cleared_claims}}'],
        ['[Restricted claim 1] — [reason + upgrade condition if any]', '{{restricted_claims}}'],
        ['[situation]: “[script]” — [coaching note: what to do / never do]', '{{talk_tracks}}'],
        ['[Item — owner — unblocks]', '{{open_items}}'],
    ],

    enablement_guide: [
        [
            'Version [X.X]   |   [Date]   |   Owners: [PMM] & [Prod Ed]   |   Tier: [1 / 2]',
            'Version {{version}}   |   {{story_code}}   |   Owners: {{owner}}   |   Tier: {{tier}}',
        ],
        ['[Story Name] Enablement Guide', '{{launch_name}} Enablement Guide'],
        ['[What it is, what’s new, who it’s for.]', '{{what_this_is}}'],
        ['[The mispositioning to kill on sight — and the naming rule if one exists.]', '{{important_note}}'],
        [
            '[The roof line from the messaging doc + one supporting sentence. This is the box a rep screenshots.]',
            '{{high_level_narrative}}',
        ],
        ['[Pain 1 — in the customer’s day-to-day terms]', '{{without}}'],
        ['[Resolution 1 — mirrors pain 1]', '{{with}}'],
        ['[3–4 short outcome phrases. “Less X. Stronger Y. Better Z.”]', '{{bottom_line}}'],
        ['[HIRE / SUCCEED / GROW / full lifecycle]', '{{lifecycle_stage}}'],
        ['[which layer / module it lives in]', '{{platform_layer}}'],
        ['[what it does for the platform story — which existing narrative it strengthens]', '{{platform_role}}'],
        ['[One sentence: part of how ClearCo connects the talent lifecycle — not a separate tool.]', '{{key_message}}'],
        ['[“30-second script — what it is, the differentiator, the day-one value.”]', '{{elevator_pitch}}'],
        [
            '[“Script with a concrete customer example and a close that books the next step.”]',
            '{{csm_talk_track}}',
        ],
        ['[Hook 1 — a question or stat that opens the pain]', '{{sdr_hooks}}'],
        ['[Restricted claim/framing 1 — from the claims register]', '{{do_not}}'],
        ['[Lead with … — the hero pillar]', '{{do}}'],
        ['[Capability 1 — what it does + why it matters]', '{{key_capabilities}}'],
        ['[Boundary 1 — limit + how to talk about it]', '{{capability_boundaries}}'],
        ['[Included in packages: … | Price calculator status: … | Discounting: …]', '{{pricing_summary}}'],
        ['[Why: the regulatory / pain / data logic]', '{{ideal_customer_profile}}'],
        ['[2–4 concrete use cases — verbs, outcomes, specifics]', '{{top_use_cases}}'],
        [
            '[What a customer should do in their first session — the fastest path to “this works”]',
            '{{day_one_value}}',
        ],
        ['[Response: acknowledge → reframe → next step]', '{{objection_handling}}'],
    ],

    // The Gate Checklist carries NO bracketed placeholders — it is a checkbox
    // form with sign-off lines, so there is nothing for find-and-replace to
    // target. It uses the purpose-built tokenised version instead.
    gate_checklist: [],

    /**
     * Only the placeholders that appear exactly once. Everything else in this
     * document is a table cell repeated per row (see STRIP_EXAMPLES above), and
     * a single find-and-replace cannot give each row its own value.
     *
     * The result: the agent fills the identification block, the customer and
     * market narrative, pricing and the metric rows; the RACI, asset checklist,
     * competitive and risk tables stay as empty forms for a human. That is a
     * deliberate split, not an omission — those tables are assignments, and
     * inventing names for them would be worse than leaving them blank.
     */
    marketing_brief: [
        ['[Launch / Capability Name]', '{{launch_name}}'],
        ['[Full launch name — capability + the one-line positioning frame]', '{{launch_name}}'],
        ['[state why this is T1 vs T2 — scope of enablement, strategic weight]', '{{tier}}'],
        ['[Draft vX — for review with (names), then (exec)]', '{{version}}'],
        ['[Brief owner — PMM]', '{{owner}}'],
        [
            "[One-sentence summary — what it is, who it's for, and the single differentiator that matters — keep it to one sentence a CSM could say out loud.]",
            '{{messaging}}',
        ],
        [
            "[Customer problem — the root pain in the customer's words, not the feature gap. What forces the workaround today, and when does it turn urgent?]",
            '{{customer_problem}}',
        ],
        [
            '[Product answer — how the capability resolves that pain. Name the mechanism, not just the benefit.]',
            '{{hero_pillar}}',
        ],
        [
            '[Proof point 1 — the strongest evidence: a stated buying reason, a win pattern, a differentiator others treat as table stakes.]',
            '{{proof}}',
        ],
        [
            '[Core message — the roof line from the messaging house; the one sentence every asset leads with.]',
            '{{messaging}}',
        ],
        ['[Link to price calculator / pricing source]', '{{pricing_and_packaging}}'],
        ['[Leading indicator 1 — enablement engagement.]', '{{leading_metrics}}'],
        ['[Lagging indicator 1 — adoption / expansion.]', '{{lagging_metrics}}'],
        ['[competitors to cover]', '{{competitive}}'],
    ],
};

/**
 * Placeholders that must SURVIVE tokenising.
 *
 * The footer states the filing convention — "File as [CODE]_Story-Brief_v0.1 →
 * [story folder] > 01 Story Brief" — and that is instruction for the human, not
 * a blank to fill. Blanking it would delete the one line telling a PMM where the
 * document belongs.
 */
const KEEP_PLACEHOLDERS = new Set([
    '[CODE]',
    '[story folder]',
    '[PM]',
    '[date]',
    '[names]',
]);

/** Every `[placeholder]` in the document, with how many times it appears. */
function findPlaceholders(text: string): Map<string, number> {
    const counts = new Map<string, number>();
    // Non-greedy, no nested brackets — matches the template convention.
    for (const match of text.matchAll(/\[[^\[\]]{1,300}\]/g)) {
        const key = match[0];
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

async function inspect(fileId: string): Promise<void> {
    const text = extractDocumentText(await getDocument(fileId));
    const found = findPlaceholders(text);

    console.log(`\n${found.size} distinct placeholder(s):\n`);
    for (const [placeholder, count] of [...found.entries()].sort((a, b) => b[0].length - a[0].length)) {
        // Anything appearing more than once cannot be replaced individually.
        const flag = count > 1 ? `  << APPEARS ${count}x — AMBIGUOUS` : '';
        console.log(`  ${JSON.stringify(placeholder)}${flag}`);
    }
    console.log();
}

async function tokenize(type: ArtifactType, dryRun: boolean): Promise<void> {
    const original = ORIGINALS[type];
    const pairs = REPLACEMENTS[type];

    console.log(`\n${original.name}`);

    if (pairs.length === 0) {
        console.log('  no replacement map yet — run with --inspect ' + original.id);
        return;
    }

    const before = extractDocumentText(await getDocument(original.id));
    const counts = findPlaceholders(before);

    // Refuse to silently mangle: if a mapped string appears more than once and
    // is not the whole-line header case, say so rather than replacing all of them.
    let unsafe = 0;
    for (const [find] of pairs) {
        const n = counts.get(find);
        if (n && n > 1) {
            console.log(`  ! ${JSON.stringify(find.slice(0, 60))} appears ${n}x — will replace ALL`);
            unsafe += 1;
        }
        if (!before.includes(find)) {
            console.log(`  ? not found: ${JSON.stringify(find.slice(0, 70))}`);
        }
    }

    if (dryRun) {
        const strippable = STRIP_EXAMPLES[type]
            ? [...counts.keys()].filter(
                  (k) => !KEEP_PLACEHOLDERS.has(k) && !pairs.some(([find]) => find.includes(k))
              )
            : [];
        console.log(
            `  ${pairs.length} replacement(s) planned, ${unsafe} ambiguous, ` +
            `~${strippable.length} example placeholder(s) would be cleared`
        );
        return;
    }

    const copy = await copyFile(original.id, original.name, TEMPLATES_FOLDER);
    await replaceAllText(
        copy.id,
        pairs.map(([find, replace]) => ({ find, replace }))
    );

    // Second pass: clear the template's own example rows.
    //
    // Everything the map did not claim is filler — "[Capability 2]", "[Persona
    // 3]", and the three standing-gate bullets that {{open_decisions}} already
    // renders. The template itself says "gray italic = instructions; delete
    // before circulating", so clearing them finishes that instruction rather
    // than overriding it. The filing convention in the footer is kept.
    const mid = extractDocumentText(await getDocument(copy.id));
    const strippable = STRIP_EXAMPLES[type]
        ? [...findPlaceholders(mid).keys()].filter((placeholder) => !KEEP_PLACEHOLDERS.has(placeholder))
        : [];

    if (strippable.length > 0) {
        await replaceAllText(
            copy.id,
            strippable.map((find) => ({ find, replace: '' }))
        );
    }

    // Whatever is STILL bracketed after both passes is reported, never guessed
    // at — that is the human's list.
    const after = extractDocumentText(await getDocument(copy.id));
    const leftover = findPlaceholders(after);

    console.log(`  created ${copy.id}`);
    console.log(
        `  ${pairs.length} replaced, ${strippable.length} example placeholder(s) cleared, ` +
        `${leftover.size} kept`
    );
    for (const [p] of [...leftover.entries()].slice(0, 8)) {
        console.log(`      kept: ${p.slice(0, 80)}`);
    }
}

(async () => {
    if (!(await isGoogleConfigured())) {
        console.error('Google is not configured. Set the service-account env vars first.');
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const inspectIndex = args.indexOf('--inspect');
    if (inspectIndex !== -1) {
        const fileId = args[inspectIndex + 1];
        if (!fileId) {
            console.error('--inspect needs a file id');
            process.exit(1);
        }
        await inspect(fileId);
        return;
    }

    const dryRun = args.includes('--dry-run');
    for (const type of Object.keys(ORIGINALS) as ArtifactType[]) {
        await tokenize(type, dryRun);
    }
    console.log(
        dryRun
            ? '\nDry run — nothing was created.\n'
            : '\nDone. Point the GOOGLE_TEMPLATE_*_ID vars at the new ids above.\n'
    );
})().catch((err) => {
    console.error('\nFailed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
