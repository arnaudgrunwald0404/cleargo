/**
 * Pulls the qualitative "mesh of information" around an epic that the forecast pipeline didn't
 * use before: criterion comments, epic-level comments, the pasted reference URLs living in
 * epic_criterion_status.data_source_values, and the rest of the Aha custom fields (revenue_risk,
 * launch_tier, etc.) beyond just the description. This is exactly where the strongest evidence in
 * the migrated historical forecasts came from (e.g. succession-planning's named-account churn
 * evidence, pulled by hand from an Aha idea's comment thread) — the live generation pipeline
 * should have the same signal available to it, not just structured epic fields.
 *
 * Does NOT fetch the content behind any URL — no web-fetch tool is wired into ClearGo's AI SDK
 * setup today. URLs are surfaced as citations for the research agent to reason about by context
 * (who posted it, on which criterion/comment, when), not by content.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface GatheredEpicContext {
  revenueRisk: string | null;
  launchTier: string | null;
  /** Formatted text block of comments + pasted reference links, ready to drop into a prompt. */
  commentsContext: string;
  /** Deduped URLs found across comments, data_source_values, and aha_fields. */
  referencedUrls: string[];
  commentCount: number;
  truncated: boolean;
}

const URL_PATTERN = /https?:\/\/[^\s)"'<>\]]+/g;
const MAX_CONTEXT_CHARS = 8000;
const MAX_CRITERION_COMMENTS = 60;
const MAX_EPIC_COMMENTS = 40;

function extractUrls(text: string): string[] {
  return text.match(URL_PATTERN) ?? [];
}

function getAhaField(ahaFields: Record<string, unknown> | null, key: string): string | null {
  if (!ahaFields) return null;
  const custom = ahaFields.custom_fields as Record<string, unknown> | undefined;
  const value = custom?.[key] ?? ahaFields[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

export async function gatherEpicContext(
  adminSupabase: SupabaseClient,
  epicId: string,
  ahaFields: Record<string, unknown> | null
): Promise<GatheredEpicContext> {
  const revenueRisk = getAhaField(ahaFields, 'revenue_risk');
  const launchTier = getAhaField(ahaFields, 'launch_tier');

  const [criterionCommentsRes, epicCommentsRes, criteriaRes] = await Promise.all([
    adminSupabase
      .from('criterion_comment')
      .select(
        `comment_text, created_at, launch_criterion_status:epic_criterion_status!criterion_comment_launch_criterion_status_id_fkey(epic_id, criterion:criterion_id(label))`
      )
      .eq('launch_criterion_status.epic_id', epicId)
      .order('created_at', { ascending: false })
      .limit(MAX_CRITERION_COMMENTS),
    adminSupabase
      .from('epic_comment')
      .select('comment_text, created_at, category')
      .eq('epic_id', epicId)
      .order('created_at', { ascending: false })
      .limit(MAX_EPIC_COMMENTS),
    adminSupabase
      .from('epic_criterion_status')
      .select('data_source_values, criterion:criterion_id(label)')
      .eq('epic_id', epicId),
  ]);

  type CriterionCommentRow = {
    comment_text: string;
    created_at: string;
    launch_criterion_status: { epic_id: string; criterion: { label: string } | null } | null;
  };
  type EpicCommentRow = { comment_text: string; created_at: string; category: string | null };
  type CriterionRow = { data_source_values: Record<string, string> | null; criterion: { label: string } | null };

  const criterionComments = ((criterionCommentsRes.data ?? []) as unknown as CriterionCommentRow[]).filter(
    (c) => c.launch_criterion_status // the .eq() filter on a joined table can still return unmatched rows as null joins
  );
  const epicComments = (epicCommentsRes.data ?? []) as unknown as EpicCommentRow[];
  const criteriaRows = (criteriaRes.data ?? []) as unknown as CriterionRow[];

  const lines: string[] = [];
  const urls = new Set<string>();

  for (const c of criterionComments) {
    const label = c.launch_criterion_status?.criterion?.label ?? 'Unknown criterion';
    const date = c.created_at?.slice(0, 10) ?? '';
    lines.push(`- [Criterion: ${label}, ${date}] ${c.comment_text}`);
    extractUrls(c.comment_text).forEach((u) => urls.add(u));
  }

  for (const c of epicComments) {
    const date = c.created_at?.slice(0, 10) ?? '';
    const cat = c.category ? `, ${c.category}` : '';
    lines.push(`- [Epic comment${cat}, ${date}] ${c.comment_text}`);
    extractUrls(c.comment_text).forEach((u) => urls.add(u));
  }

  for (const row of criteriaRows) {
    const values = row.data_source_values ?? {};
    for (const value of Object.values(values)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const label = row.criterion?.label ?? 'Unknown criterion';
      lines.push(`- [Criterion: ${label} — reference link] ${value}`);
      extractUrls(value).forEach((u) => urls.add(u));
      if (/^https?:\/\//.test(value.trim())) urls.add(value.trim());
    }
  }

  if (ahaFields) {
    extractUrls(JSON.stringify(ahaFields)).forEach((u) => urls.add(u));
  }

  let commentsContext = lines.join('\n');
  let truncated = false;
  if (commentsContext.length > MAX_CONTEXT_CHARS) {
    commentsContext = commentsContext.slice(0, MAX_CONTEXT_CHARS) + '\n[...truncated — see the epic directly for the rest]';
    truncated = true;
  }

  return {
    revenueRisk,
    launchTier,
    commentsContext: commentsContext || '(no criterion or epic comments found)',
    referencedUrls: Array.from(urls),
    commentCount: criterionComments.length + epicComments.length,
    truncated,
  };
}
