/**
 * Completeness assessment for Story Briefs.
 *
 * Evaluates each required section of StoryBriefContent for presence and quality,
 * returning a 0-1 score, a list of gaps, and a boolean "is this good enough" flag.
 *
 * All sections are required — there is no "nice-to-have" tier.
 */

import type { StoryBriefContent } from './generator';

// ── Public types ────────────────────────────────────────────────────────────────

export type GapSeverity = 'missing' | 'thin' | 'ungrounded';

export interface SectionGap {
  /** Human-readable section name (e.g. "What we're building") */
  section: string;
  /** One-line description of what is wrong */
  issue: string;
  severity: GapSeverity;
}

export interface BriefCompleteness {
  /** 0 (empty) to 1 (all sections substantive) */
  score: number;
  /** Convenience: score >= 0.8 */
  complete: boolean;
  gaps: SectionGap[];
  /** Total sections checked */
  sectionCount: number;
  /** Sections with no gaps */
  completeSections: number;
}

// ── Thresholds ──────────────────────────────────────────────────────────────────

/** Minimum character count for a narrative field to be considered substantive. */
const NARRATIVE_MIN_CHARS = 50;

/** Minimum character count for a short text field (vignette, plan, etc.) */
const SHORT_TEXT_MIN_CHARS = 30;

/** Below this fraction of ungrounded claims, the section is fine. */
const UNGROUNDED_THRESHOLD = 0.5;

// ── Section labels ──────────────────────────────────────────────────────────────

const LABELS = {
  whatWeAreBuilding: "What we're building",
  whyPrioritized: 'Why we prioritized it',
  valueStory: 'Value story',
  launchScope: 'Launch scope',
  personas: 'Personas & segments',
  openDecisions: 'Open decisions',
  softCommitments: 'Soft commitments',
  downstreamDeliverables: 'Downstream deliverables',
  overallConfidence: 'Overall confidence',
} as const;

/**
 * Assess the completeness of a Story Brief.
 * Returns a score (0-1), list of gaps, and completeness flag.
 */
export function assessCompleteness(
  content: StoryBriefContent | null
): BriefCompleteness {
  if (!content || typeof content !== 'object') {
    return {
      score: 0,
      complete: false,
      gaps: [
        {
          section: 'Story Brief',
          issue: 'No Story Brief has been generated for this epic',
          severity: 'missing',
        },
      ],
      sectionCount: 9,
      completeSections: 0,
    };
  }

  const gaps: SectionGap[] = [];

  // 1. what_we_are_building
  assessNarrativeSection(
    content.what_we_are_building,
    LABELS.whatWeAreBuilding,
    gaps
  );

  // 2. why_we_prioritized_it
  assessNarrativeSection(
    content.why_we_prioritized_it,
    LABELS.whyPrioritized,
    gaps
  );

  // 3. value_story
  assessValueStory(content.value_story, gaps);

  // 4. launch_scope
  assessLaunchScope(content.launch_scope, gaps);

  // 5. personas
  assessPersonas(content.personas, gaps);

  // 6. open_decisions — standing gates ensure it's never empty after toStoryBriefContent,
  // but guard against raw AI output that was never processed.
  assessOpenDecisions(content.open_decisions, gaps);

  // 7. soft_commitments
  assessStringArray(
    content.soft_commitments,
    LABELS.softCommitments,
    gaps
  );

  // 8. downstream_deliverables
  assessDownstreamDeliverables(content.downstream_deliverables, gaps);

  // 9. overall_confidence — low signals the model had little to go on.
  if (content.overall_confidence === 'low') {
    gaps.push({
      section: LABELS.overallConfidence,
      issue: 'Confidence is low — the model had limited source material to ground claims',
      severity: 'thin',
    });
  }

  const sectionCount = 9;
  const gapSections = new Set(gaps.map((g) => g.section));
  const completeSections = sectionCount - gapSections.size;

  return {
    score: round2(completeSections / sectionCount),
    complete: completeSections / sectionCount >= 0.8,
    gaps,
    sectionCount,
    completeSections,
  };
}

// ── Section assessors ───────────────────────────────────────────────────────────

/** Assess a narrative + claims section (sections 1 & 2). */
function assessNarrativeSection(
  section: StoryBriefContent['what_we_are_building'] | StoryBriefContent['why_we_prioritized_it'],
  label: string,
  gaps: SectionGap[]
): void {
  if (!section) {
    gaps.push({ section: label, issue: 'Section is empty', severity: 'missing' });
    return;
  }

  const { narrative, claims, open_flags } = section;

  // Check narrative
  const trimmed = typeof narrative === 'string' ? narrative.trim() : '';
  if (!trimmed) {
    gaps.push({ section: label, issue: 'Narrative is empty', severity: 'missing' });
  } else if (trimmed.length < NARRATIVE_MIN_CHARS) {
    gaps.push({
      section: label,
      issue: `Narrative is too brief (${trimmed.length} chars)`,
      severity: 'thin',
    });
  }

  // Check claims
  if (!claims || claims.length === 0) {
    gaps.push({
      section: label,
      issue: 'No grounding claims provided',
      severity: 'thin',
    });
  } else {
    const ungroundedCount = claims.filter((c) => c.grounded === false).length;
    const fraction = ungroundedCount / claims.length;
    if (fraction > UNGROUNDED_THRESHOLD) {
      gaps.push({
        section: label,
        issue: `${ungroundedCount} of ${claims.length} claims are ungrounded`,
        severity: 'ungrounded',
      });
    }
  }

  // Many open_flags suggests the model couldn't ground much
  if (open_flags && open_flags.length > 3) {
    gaps.push({
      section: label,
      issue: `${open_flags.length} statements could not be grounded`,
      severity: 'ungrounded',
    });
  }
}

/** Assess the value story (section 3) — has sub-fields. */
function assessValueStory(
  section: StoryBriefContent['value_story'],
  gaps: SectionGap[]
): void {
  if (!section) {
    gaps.push({
      section: LABELS.valueStory,
      issue: 'Section is empty',
      severity: 'missing',
    });
    return;
  }

  const fields: Array<{ key: string; label: string; minChars: number }> = [
    { key: 'working_narrative', label: 'Working narrative', minChars: NARRATIVE_MIN_CHARS },
    { key: 'vignette', label: 'Vignette', minChars: SHORT_TEXT_MIN_CHARS },
    { key: 'roi_hypothesis', label: 'ROI hypothesis', minChars: SHORT_TEXT_MIN_CHARS },
    {
      key: 'platform_pull_through',
      label: 'Platform pull-through',
      minChars: SHORT_TEXT_MIN_CHARS,
    },
  ];

  let hasGap = false;
  for (const { key, label, minChars } of fields) {
    const raw = (section as Record<string, unknown>)[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      gaps.push({
        section: LABELS.valueStory,
        issue: `${label} is empty`,
        severity: 'missing',
      });
      hasGap = true;
    } else if (value.length < minChars) {
      gaps.push({
        section: LABELS.valueStory,
        issue: `${label} is too brief (${value.length} chars)`,
        severity: 'thin',
      });
      hasGap = true;
    }
  }

  // Check claims
  if (section.claims && section.claims.length > 0) {
    const ungroundedCount = section.claims.filter((c) => c.grounded === false).length;
    const fraction = ungroundedCount / section.claims.length;
    if (fraction > UNGROUNDED_THRESHOLD) {
      gaps.push({
        section: LABELS.valueStory,
        issue: `${ungroundedCount} of ${section.claims.length} claims are ungrounded`,
        severity: 'ungrounded',
      });
      hasGap = true;
    }
  } else if (!hasGap) {
    gaps.push({
      section: LABELS.valueStory,
      issue: 'No grounding claims provided',
      severity: 'thin',
    });
  }
}

/** Assess launch scope (section 4) — in_scope / out_of_scope arrays. */
function assessLaunchScope(
  section: StoryBriefContent['launch_scope'],
  gaps: SectionGap[]
): void {
  if (!section) {
    gaps.push({
      section: LABELS.launchScope,
      issue: 'Section is empty',
      severity: 'missing',
    });
    return;
  }

  const issues: string[] = [];
  if (!section.in_scope || section.in_scope.length === 0) {
    issues.push('in_scope is empty');
  }
  if (!section.out_of_scope || section.out_of_scope.length === 0) {
    issues.push('out_of_scope is empty');
  }

  if (issues.length > 0) {
    gaps.push({
      section: LABELS.launchScope,
      issue: issues.join('; '),
      severity: 'missing',
    });
  }
}

/** Assess personas (section 5) — array of persona objects. */
function assessPersonas(
  personas: StoryBriefContent['personas'],
  gaps: SectionGap[]
): void {
  if (!personas || personas.length === 0) {
    gaps.push({
      section: LABELS.personas,
      issue: 'No personas defined',
      severity: 'missing',
    });
    return;
  }

  // Check for thin personas
  const thinCount = personas.filter(
    (p) =>
      !p.trigger_and_need ||
      !p.lead_message ||
      p.trigger_and_need.trim().length === 0 ||
      p.lead_message.trim().length === 0
  ).length;
  if (thinCount > 0) {
    gaps.push({
      section: LABELS.personas,
      issue: `${thinCount} of ${personas.length} personas have empty fields`,
      severity: 'thin',
    });
  }
}

/**
 * Assess open decisions (section 6).
 * After toStoryBriefContent(), standing gates (naming, pricing, launch_window) are always
 * present, so an empty array means the content was never processed.
 */
function assessOpenDecisions(
  decisions: StoryBriefContent['open_decisions'],
  gaps: SectionGap[]
): void {
  if (!decisions || decisions.length === 0) {
    gaps.push({
      section: LABELS.openDecisions,
      issue: 'No open decisions or standing gates recorded',
      severity: 'missing',
    });
  }
}

/** Assess a simple string array section (section 7 — soft_commitments). */
function assessStringArray(
  items: StoryBriefContent['soft_commitments'],
  label: string,
  gaps: SectionGap[]
): void {
  if (!items || items.length === 0) {
    gaps.push({
      section: label,
      issue: 'No items recorded',
      severity: 'missing',
    });
    return;
  }

  // "None identified" is a valid single entry per the schema
  const meaningful = items.filter(
    (s) =>
      typeof s === 'string' &&
      s.trim().length > 0 &&
      !s.toLowerCase().includes('none identified')
  );
  if (meaningful.length === 0 && items.length === 1) {
    // "None identified" is acceptable — no gap
    return;
  }
}

/** Assess downstream deliverables (section 8). */
function assessDownstreamDeliverables(
  section: StoryBriefContent['downstream_deliverables'],
  gaps: SectionGap[]
): void {
  if (!section) {
    gaps.push({
      section: LABELS.downstreamDeliverables,
      issue: 'Section is empty',
      severity: 'missing',
    });
    return;
  }

  const issues: string[] = [];

  if (!section.chain || section.chain.length === 0) {
    issues.push('deliverable chain is empty');
  }

  const planFields: Array<{ key: string; label: string }> = [
    { key: 'enablement_plan', label: 'Enablement plan' },
    { key: 'marketing_plan', label: 'Marketing plan' },
  ];

  for (const { key, label } of planFields) {
    const raw = (section as Record<string, unknown>)[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      issues.push(`${label} is empty`);
    } else if (value.length < SHORT_TEXT_MIN_CHARS) {
      issues.push(`${label} is too brief (${value.length} chars)`);
    }
  }

  if (issues.length > 0) {
    gaps.push({
      section: LABELS.downstreamDeliverables,
      issue: issues.join('; '),
      severity: issues.some((i) => i.includes('empty')) ? 'missing' : 'thin',
    });
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}