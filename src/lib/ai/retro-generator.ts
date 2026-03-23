import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
}

const model = google('gemini-1.5-pro-latest');

const supabaseServiceKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  if (!supabaseServiceKey) throw new Error('Missing Supabase service key');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, supabaseServiceKey);
}

// ── Structured output schema ────────────────────────────────────

export const retroOutputSchema = z.object({
  summary: z
    .string()
    .describe('2-3 paragraph narrative summarising the launch readiness journey'),
  late_items: z.array(
    z.object({
      criterion: z.string(),
      expected_by: z.string().describe('Launch stage or date by which it should have been rated'),
      actual_date: z.string().describe('Date it was finally resolved or still pending'),
      days_late: z.number(),
      context: z.string().describe('Brief explanation from comments or patterns'),
    })
  ),
  stuck_items: z.array(
    z.object({
      criterion: z.string(),
      status: z.string().describe('The status it was stuck in (e.g. NO_GO, CONDITIONAL)'),
      duration_days: z.number(),
      context: z.string(),
    })
  ),
  themes: z.array(z.string()).describe('Recurring themes across comments'),
  recommendations: z.array(z.string()).describe('Forward-looking suggestions'),
});

export type RetroOutput = z.infer<typeof retroOutputSchema>;

// ── Context assembly ────────────────────────────────────────────

export interface RetroContext {
  epic: {
    id: string;
    name: string;
    tier: string | null;
    target_launch_date: string | null;
    scheduled_ga_dev_date: string | null;
    status: string | null;
  };
  launch_stages: Array<{ name: string; sort_order: number; duration_days: number | null }>;
  criteria: Array<{
    id: string;
    label: string;
    category: string | null;
    gate: boolean;
    rating_timing_stage: string | null;
    current_status: string;
    last_updated_at: string | null;
  }>;
  status_history: Array<{
    criterion_label: string;
    old_status: string | null;
    new_status: string;
    changed_by_email: string | null;
    changed_at: string;
  }>;
  comments: Array<{
    criterion_label: string;
    comment_text: string;
    status_at_comment: string | null;
    previous_status: string | null;
    created_by_email: string | null;
    created_at: string;
  }>;
}

export async function assembleRetroContext(epicId: string): Promise<RetroContext> {
  const supabase = getSupabase();

  // 1. Epic metadata
  const { data: epic, error: epicErr } = await supabase
    .from('epic')
    .select('id, name, tier, target_launch_date, scheduled_ga_dev_date, status')
    .eq('id', epicId)
    .single();

  if (epicErr || !epic) throw new Error(`Epic ${epicId} not found: ${epicErr?.message}`);

  // 2. Launch stages
  const { data: stages } = await supabase
    .from('launch_stages')
    .select('name, sort_order, duration_days')
    .order('sort_order');

  // 3. Criteria with current status
  const { data: ecsRows } = await supabase
    .from('epic_criterion_status')
    .select(`
      id,
      status,
      last_updated_at,
      criterion:criterion_id (
        id,
        label,
        category,
        gate,
        rating_timing
      )
    `)
    .eq('epic_id', epicId);

  // Resolve rating_timing (FK to launch_stages) to a stage name
  const stageMap = new Map((stages || []).map((s) => [String(s.sort_order), s.name]));
  const stageIdMap = new Map<string, string>();
  if (stages) {
    const { data: allStages } = await supabase
      .from('launch_stages')
      .select('id, name');
    (allStages || []).forEach((s: any) => stageIdMap.set(String(s.id), s.name));
  }

  const criteria = (ecsRows || []).map((row: any) => {
    const c = row.criterion;
    return {
      id: c?.id || '',
      label: c?.label || 'Unknown',
      category: c?.category || null,
      gate: c?.gate || false,
      rating_timing_stage: c?.rating_timing ? (stageIdMap.get(String(c.rating_timing)) || null) : null,
      current_status: row.status,
      last_updated_at: row.last_updated_at,
    };
  });

  // 4. Status history
  const { data: historyRows } = await supabase
    .from('criterion_status_history')
    .select(`
      old_status,
      new_status,
      changed_at,
      changed_by,
      criterion_id
    `)
    .eq('epic_id', epicId)
    .order('changed_at');

  // Resolve criterion labels and user emails
  const criterionLabelMap = new Map(criteria.map((c) => [c.id, c.label]));

  const userIds = new Set<string>();
  (historyRows || []).forEach((h: any) => { if (h.changed_by) userIds.add(h.changed_by); });

  const { data: commentRows } = await supabase
    .from('criterion_comment')
    .select(`
      comment_text,
      status_at_comment,
      previous_status,
      created_at,
      created_by_user_id,
      launch_criterion_status_id
    `)
    .in(
      'launch_criterion_status_id',
      (ecsRows || []).map((r: any) => r.id)
    )
    .order('created_at');

  (commentRows || []).forEach((c: any) => {
    if (c.created_by_user_id) userIds.add(c.created_by_user_id);
  });

  const userEmailMap = new Map<string, string>();
  if (userIds.size > 0) {
    const { data: users } = await supabase
      .from('app_user')
      .select('id, email')
      .in('id', [...userIds]);
    (users || []).forEach((u: any) => userEmailMap.set(u.id, u.email));
  }

  // Build LCS id → criterion label map
  const lcsLabelMap = new Map(
    (ecsRows || []).map((r: any) => [r.id, r.criterion?.label || 'Unknown'])
  );

  const status_history = (historyRows || []).map((h: any) => ({
    criterion_label: criterionLabelMap.get(h.criterion_id) || 'Unknown',
    old_status: h.old_status,
    new_status: h.new_status,
    changed_by_email: h.changed_by ? (userEmailMap.get(h.changed_by) || null) : null,
    changed_at: h.changed_at,
  }));

  const comments = (commentRows || []).map((c: any) => ({
    criterion_label: lcsLabelMap.get(c.launch_criterion_status_id) || 'Unknown',
    comment_text: (c.comment_text || '').replace(/<[^>]*>/g, '').substring(0, 500),
    status_at_comment: c.status_at_comment,
    previous_status: c.previous_status,
    created_by_email: c.created_by_user_id ? (userEmailMap.get(c.created_by_user_id) || null) : null,
    created_at: c.created_at,
  }));

  return {
    epic: {
      id: epic.id,
      name: epic.name,
      tier: epic.tier,
      target_launch_date: epic.target_launch_date,
      scheduled_ga_dev_date: epic.scheduled_ga_dev_date,
      status: epic.status,
    },
    launch_stages: stages || [],
    criteria,
    status_history,
    comments,
  };
}

// ── LLM call ────────────────────────────────────────────────────

export async function generateEpicRetro(epicId: string): Promise<{
  context: RetroContext;
  output: RetroOutput;
}> {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const context = await assembleRetroContext(epicId);

  const { object } = await generateObject({
    model,
    schema: retroOutputSchema,
    prompt: `
You are a Product Operations analyst writing a launch retrospective for the product epic "${context.epic.name}".

## Epic details
- Tier: ${context.epic.tier || 'Unknown'}
- Target launch date: ${context.epic.target_launch_date || 'Not set'}
- GA date: ${context.epic.scheduled_ga_dev_date || 'Not set (defaults to launch + 28 days)'}
- Current status: ${context.epic.status || 'Unknown'}

## Launch stages (in order)
${(context.launch_stages || []).map((s) => `- ${s.name} (${s.duration_days ? s.duration_days + ' days' : 'ongoing'})`).join('\n')}

## Criteria and their current status
${context.criteria.map((c) => `- [${c.gate ? 'GATE' : 'non-gate'}] ${c.label} (category: ${c.category || '—'}) → ${c.current_status} (should be rated by: ${c.rating_timing_stage || 'unspecified'}; last updated: ${c.last_updated_at || 'never'})`).join('\n')}

## Status change timeline (${context.status_history.length} entries)
${context.status_history.length > 0
  ? context.status_history.map((h) => `  ${h.changed_at} | ${h.criterion_label}: ${h.old_status || 'NONE'} → ${h.new_status} (by ${h.changed_by_email || 'system'})`).join('\n')
  : '  No history recorded yet.'}

## Comments (${context.comments.length} entries)
${context.comments.length > 0
  ? context.comments.map((c) => `  ${c.created_at} | ${c.criterion_label} [${c.status_at_comment || '—'}]: "${c.comment_text}" —${c.created_by_email || 'unknown'}`).join('\n')
  : '  No comments.'}

## Instructions
Write a retrospective analysis covering:
1. **Summary** (2-3 paragraphs): Overall narrative of the launch readiness journey. What went well? What was difficult?
2. **Late items**: Which criteria were rated after their expected launch stage deadline? Calculate days_late based on the launch date and the stage timeline.
3. **Stuck items**: Which criteria stayed in NO_GO or CONDITIONAL for an abnormally long time (>14 days)? How many days?
4. **Themes**: What recurring patterns appear in the comments? (e.g. "dependency on external team", "unclear requirements", "resource constraints")
5. **Recommendations**: Actionable suggestions for future launches based on the patterns observed.

Be specific, referencing actual criterion names, dates, and people when relevant. Be constructive, not accusatory.
`,
  });

  return { context, output: object };
}

// ── Global / portfolio retro ────────────────────────────────────

export async function generatePortfolioRetro(epicIds: string[]): Promise<{
  context: { epics: RetroContext[] };
  output: RetroOutput;
}> {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const epics = await Promise.all(epicIds.map((id) => assembleRetroContext(id)));

  const epicSummaries = epics
    .map(
      (ctx) => `
### ${ctx.epic.name} (${ctx.epic.tier || 'Unknown tier'})
- Launch: ${ctx.epic.target_launch_date || 'N/A'} | GA: ${ctx.epic.scheduled_ga_dev_date || 'N/A'}
- Criteria: ${ctx.criteria.length} total, ${ctx.criteria.filter((c) => c.current_status === 'GO').length} GO, ${ctx.criteria.filter((c) => c.current_status === 'NO_GO').length} NO_GO, ${ctx.criteria.filter((c) => c.current_status === 'CONDITIONAL').length} CONDITIONAL
- Status changes: ${ctx.status_history.length} | Comments: ${ctx.comments.length}
- Stuck items: ${ctx.status_history.filter((h) => h.new_status === 'NO_GO' || h.new_status === 'CONDITIONAL').length} transitions to NO_GO/CONDITIONAL
`
    )
    .join('\n');

  const allCommentThemes = epics
    .flatMap((ctx) =>
      ctx.comments.slice(0, 20).map(
        (c) => `[${ctx.epic.name} / ${c.criterion_label}] "${c.comment_text.substring(0, 200)}"`
      )
    )
    .join('\n');

  const { object } = await generateObject({
    model,
    schema: retroOutputSchema,
    prompt: `
You are a Product Operations analyst writing a portfolio-level retrospective covering ${epics.length} product epics.

## Epics
${epicSummaries}

## Sample comments across epics
${allCommentThemes || 'No comments available.'}

## Instructions
Write a portfolio-level retrospective:
1. **Summary**: 2-3 paragraphs covering cross-cutting patterns. Which epics went smoothly? Which struggled? Were there systemic issues affecting multiple epics?
2. **Late items**: Aggregate the most commonly late criteria across epics. Which criteria types are consistently late?
3. **Stuck items**: Which criteria are most frequently stuck in NO_GO or CONDITIONAL across the portfolio?
4. **Themes**: Cross-epic patterns from comments (e.g. "3 out of 5 epics mentioned dependency delays").
5. **Recommendations**: Systemic process improvements based on patterns across the portfolio.

Be specific and data-driven. Reference epic names and criteria.
`,
  });

  return { context: { epics }, output: object };
}
