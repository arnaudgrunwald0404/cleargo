import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import type {
  EpicMovementNoteForAnalysis,
  PeriodShiftAnalysis,
  PlanVsActualItem,
  PlanVsActualReportPayload,
} from '@/types/roadmap';
import { mergeItemInsightsWithItems } from '@/lib/roadmap/planVsActualAnalysisMerge';

const ANTHROPIC_API_V1 = 'https://api.anthropic.com/v1';

function getAnthropicBaseUrl(): string {
  const fromEnv = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/$/, '');
  if (fromEnv && (fromEnv.includes('/.netlify/ai') || fromEnv.includes('.netlify.app'))) {
    return ANTHROPIC_API_V1;
  }
  if (fromEnv) return fromEnv;
  return ANTHROPIC_API_V1;
}

function resolveAnthropicApiKey(): string | undefined {
  const k = process.env.CLAUDE_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  return k || undefined;
}

/** Bump when prompt or model identity changes meaningfully. */
export const SHIFT_ANALYSIS_MODEL_ID = 'claude-haiku-4-5-20251001';
export const SHIFT_ANALYSIS_PROMPT_VERSION = '5';

function planVsActualPeriodModeHelp(periodType: string): string {
  switch (periodType) {
    case 'quarter_baseline':
      return 'Quarter Plan: baseline at the first snapshot of the quarter (no progression).';
    case 'quarter_progress':
      return 'In-quarter progress: first quarter snapshot vs end of the selected calendar month.';
    case 'quarterly':
      return 'Quarter Results: first quarter snapshot through the last snapshot of the quarter.';
    default:
      return periodType;
  }
}

const shiftSchema = z.object({
  overview: z
    .string()
    .describe(
      '2–4 sentences for executives: factual patterns from the item list only — no invented causes.',
    ),
  themes: z.array(z.string()).describe('2–5 factual themes from the data — no speculation.'),
  itemInsights: z
    .array(
      z.object({
        ahaKey: z.string(),
        summary: z.string().describe('One line: what changed vs plan for this feature.'),
        likelyReasons: z
          .string()
          .describe(
            'Facts only: snapshot deltas, status label, releases, and PM/movement notes when they state a cause. If unknown, say so. No speculation. 1–3 sentences.',
          ),
      }),
    )
    .describe('One entry per roadmap row (every aha key in the list).'),
});

function buildUserPrompt(
  report: Pick<
    PlanVsActualReportPayload,
    'periodType' | 'periodStart' | 'periodEnd' | 'startSnapshotDate' | 'endSnapshotDate' | 'items'
  >,
  notes: EpicMovementNoteForAnalysis[],
): string {
  const lines = report.items.map((i) => {
    const prog =
      i.startProgress != null || i.endProgress != null
        ? `progress=${i.startProgress ?? '—'}%→${i.endProgress ?? '—'}%`
        : 'progress=(n/a)';
    const pm = i.pmNoteCause?.trim() ? ` pmReason=${i.pmNoteCause}` : '';
    return `- ${i.featureName} (${i.ahaKey}) | goal=${i.goal ?? ''} | gtmModule=${i.productArea ?? ''}${pm} | ${prog} | start=${i.startRelease ?? '—'} end=${i.endRelease ?? '—'} | ${i.statusLabel} (${i.statusCategory})`;
  });

  const noteLines = notes.map((n) => {
    const item = report.items.find((i) => i.ahaKey === n.ahaKey);
    const title = item?.featureName?.trim() || n.ahaKey;
    return `- ${title} (${n.ahaKey}) | ${n.createdAt} | ${n.category ?? ''} | ${n.movementCause ?? ''} | ${n.fromRelease ?? ''}→${n.toRelease ?? ''} | ${n.commentText.replace(/\s+/g, ' ').slice(0, 500)}`;
  });

  return `You are helping product leadership explain roadmap execution for a fixed reporting period.

Calendar window: ${report.periodStart} through ${report.periodEnd}.
Mode: ${planVsActualPeriodModeHelp(report.periodType)}
Roadmap snapshots compared (authoritative): start=${report.startSnapshotDate ?? 'unknown'} end=${report.endSnapshotDate ?? 'unknown'}.

Items (from internal roadmap snapshots — treat as factual baselines):
${lines.join('\n')}

PM / movement notes (may be empty; prefer these for "why"):
${noteLines.length ? noteLines.join('\n') : '(none supplied)'}

Instructions:
- Write for an internal roadmap review (ClearGO).
- **No speculation.** Do not guess organizational causes (resource reallocation, deprioritization strategy, churn focus, etc.) unless **explicitly stated** in PM/movement notes for that item or period. Do not use hedging fiction: avoid "likely", "probably", "may reflect", "suggests that".
- **Evidence rule**: Say **what the snapshot row shows** (status label, release change, removal vs add). For **why**, use **only** PM/movement notes when they give a reason; otherwise write plainly that the cause is **not documented** (e.g. "No movement notes explain this; snapshot shows X.").
- **Status labels** are driven by **release train movement** between snapshots and shipped wording — not by progress %. Use **progress %** only for execution reality; do not contradict the status label.
- **itemInsights**: Include **exactly one object for every line** in the Items list (same ahaKey values). Stable rows: short summary; likelyReasons may say facts only ("Same release in start vs end snapshot.") or cite notes.
- **overview** / **themes**: When referencing epics, use **Feature name (Aha key)** — e.g. "Payments uplift (APP-E-123)" — not the key alone.
- **itemInsights** summaries: Lead with the feature name; include the Aha key in parentheses when helpful.
- Do not invent financial metrics (ARR). If notes conflict with snapshot data, note the mismatch briefly.
- Keep each likelyReasons to at most 3 short sentences.

Produce structured JSON only via tool/schema.`;
}

const singleItemInsightSchema = z.object({
  summary: z.string().describe('One line: what changed vs plan for this feature.'),
  likelyReasons: z
    .string()
    .describe(
      'Facts only: snapshot row, status label, releases, PM notes if they give a reason. Say unknown if unsupported. 1–3 sentences.',
    ),
});

function buildSingleItemPrompt(
  ctx: Pick<
    PlanVsActualReportPayload,
    'periodType' | 'periodStart' | 'periodEnd' | 'startSnapshotDate' | 'endSnapshotDate'
  > & { item: PlanVsActualItem },
  notesForKey: EpicMovementNoteForAnalysis[],
): string {
  const i = ctx.item;
  const prog =
    i.startProgress != null || i.endProgress != null
      ? `progress=${i.startProgress ?? '—'}%→${i.endProgress ?? '—'}%`
      : 'progress=(n/a)';
  const pm = i.pmNoteCause?.trim() ? ` pmReason=${i.pmNoteCause}` : '';
  const line = `- ${i.featureName} (${i.ahaKey}) | goal=${i.goal ?? ''} | gtmModule=${i.productArea ?? ''}${pm} | ${prog} | start=${i.startRelease ?? '—'} end=${i.endRelease ?? '—'} | ${i.statusLabel} (${i.statusCategory})`;

  const noteLines = notesForKey.map((n) => {
    return `- ${i.featureName} (${n.ahaKey}) | ${n.createdAt} | ${n.category ?? ''} | ${n.movementCause ?? ''} | ${n.fromRelease ?? ''}→${n.toRelease ?? ''} | ${n.commentText.replace(/\s+/g, ' ').slice(0, 500)}`;
  });

  return `You are helping product leadership explain roadmap execution for one roadmap item in a fixed reporting period.

Calendar window: ${ctx.periodStart} through ${ctx.periodEnd}.
Mode: ${planVsActualPeriodModeHelp(ctx.periodType)}
Roadmap snapshots compared (authoritative): start=${ctx.startSnapshotDate ?? 'unknown'} end=${ctx.endSnapshotDate ?? 'unknown'}.

Item (from internal roadmap snapshot — factual baseline):
${line}

PM / movement notes for this item only (may be empty):
${noteLines.length ? noteLines.join('\n') : '(none supplied)'}

Instructions:
- Write summary + likelyReasons only for this item. Lead with the feature name; include the Aha key in parentheses when helpful.
- **No speculation.** Do not invent why something shifted unless PM/movement notes state it. Describe snapshot facts; if cause unknown, say so.
- **Status label** is driven by release train movement between snapshots — not progress %. Use progress % only for execution reality; do not contradict the status label.
- Keep likelyReasons to at most 3 short sentences.

Produce structured JSON only via tool/schema.`;
}

/** One-row narrative for Plan vs Actual line-level regenerate. */
export async function generateSingleItemNarrative(
  ctx: Pick<
    PlanVsActualReportPayload,
    'periodType' | 'periodStart' | 'periodEnd' | 'startSnapshotDate' | 'endSnapshotDate'
  > & { item: PlanVsActualItem },
  notes: EpicMovementNoteForAnalysis[],
): Promise<{ summary: string; likelyReasons: string }> {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    throw new Error('Missing CLAUDE_API_KEY / ANTHROPIC_API_KEY for shift analysis.');
  }

  const notesForKey = notes.filter((n) => n.ahaKey === ctx.item.ahaKey);
  const anthropic = createAnthropic({
    apiKey,
    baseURL: getAnthropicBaseUrl(),
  });

  const { object } = await generateObject({
    model: anthropic(SHIFT_ANALYSIS_MODEL_ID),
    schema: singleItemInsightSchema,
    prompt: buildSingleItemPrompt(ctx, notesForKey),
  });

  return {
    summary: object.summary.trim(),
    likelyReasons: object.likelyReasons.trim(),
  };
}

export async function generatePeriodShiftAnalysis(
  report: Pick<
    PlanVsActualReportPayload,
    | 'periodType'
    | 'periodStart'
    | 'periodEnd'
    | 'startSnapshotDate'
    | 'endSnapshotDate'
    | 'items'
  >,
  notes: EpicMovementNoteForAnalysis[],
): Promise<PeriodShiftAnalysis> {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    throw new Error('Missing CLAUDE_API_KEY / ANTHROPIC_API_KEY for shift analysis.');
  }

  const anthropic = createAnthropic({
    apiKey,
    baseURL: getAnthropicBaseUrl(),
  });

  const { object } = await generateObject({
    model: anthropic(SHIFT_ANALYSIS_MODEL_ID),
    schema: shiftSchema,
    prompt: buildUserPrompt(report, notes),
  });

  const itemInsights = mergeItemInsightsWithItems(report.items, object.itemInsights);

  return {
    overview: object.overview,
    themes: object.themes,
    itemInsights,
    modelVersion: `${SHIFT_ANALYSIS_MODEL_ID};prompt=${SHIFT_ANALYSIS_PROMPT_VERSION}`,
  };
}
