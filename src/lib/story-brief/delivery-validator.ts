/**
 * Delivery validation for the Story Brief generator: cross-checks what Aha! claims about an
 * epic (workflow_status, description) against Jira reality (epic issue status + child-issue
 * completion), so the AI draft never describes something as shipped when Jira says otherwise.
 *
 * Grounds sections 1 ("What we are building") and 4 ("Launch scope — in/out") of the brief.
 * Every external call degrades gracefully (errors[] + *_available flags) rather than blocking
 * generation, mirroring src/lib/heart/agent.ts's fallback philosophy.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveAndCacheJiraEpicKey,
  type EpicForResolution,
} from '@/lib/jira/resolve-and-cache-epic-key';
import { getJiraEpic, searchJiraIssues } from '@/lib/jira/client';

export interface JiraChildIssueSummary {
  key: string;
  summary: string;
  status: string | null;
  statusCategory: string | null;
}

export interface DeliveryValidationResult {
  aha_available: boolean;
  aha_description: string | null;
  aha_workflow_status: string | null;
  jira_available: boolean;
  jira_epic_key: string | null;
  jira_epic_status: string | null;
  jira_epic_status_category: string | null;
  child_issues: JiraChildIssueSummary[];
  child_issue_total: number;
  child_issue_done: number;
  /** True when a source claims "shipped"-type language but Jira shows incomplete work. */
  gap_detected: boolean;
  /** Concrete, quotable sentence describing the gap — never a vague paraphrase. Null if no gap. */
  gap_description: string | null;
  errors: string[];
}

export interface EpicForValidation extends EpicForResolution {
  aha_fields?: Record<string, unknown> | null;
}

const SHIPPED_PATTERN = /shipped|released|complete|closed|done|live|\bga\b/i;

export async function validateEpicDelivery(
  epic: EpicForValidation,
  supabase: SupabaseClient
): Promise<DeliveryValidationResult> {
  const errors: string[] = [];

  const ahaFields = epic.aha_fields as Record<string, unknown> | null | undefined;
  const standardFields = ahaFields?.standard_fields as Record<string, unknown> | undefined;
  const ahaDescriptionRaw = (standardFields?.description as string | null | undefined) ?? null;
  const aha_description = ahaDescriptionRaw ? stripHtml(ahaDescriptionRaw) : null;
  const aha_workflow_status = (standardFields?.workflow_status as string | null | undefined) ?? null;
  const aha_available = Boolean(standardFields);

  let jira_epic_key: string | null = epic.jira_epic_key ?? null;
  if (!jira_epic_key) {
    try {
      const resolved = await resolveAndCacheJiraEpicKey(epic, supabase);
      jira_epic_key = resolved.jiraEpicKey;
    } catch (err) {
      errors.push(`Failed to resolve Jira epic key: ${errorMessage(err)}`);
    }
  }

  let jira_available = false;
  let jira_epic_status: string | null = null;
  let jira_epic_status_category: string | null = null;
  let child_issues: JiraChildIssueSummary[] = [];

  if (jira_epic_key) {
    try {
      const jiraEpic = await getJiraEpic(jira_epic_key);
      jira_epic_status = jiraEpic.fields?.status?.name ?? null;
      jira_epic_status_category = jiraEpic.fields?.status?.statusCategory?.name ?? null;
      jira_available = true;
    } catch (err) {
      errors.push(`Failed to fetch Jira epic ${jira_epic_key}: ${errorMessage(err)}`);
    }

    try {
      const issues = await searchJiraIssues(`parent = "${jira_epic_key}"`, ['summary', 'status']);
      child_issues = issues.map((issue) => ({
        key: issue.key,
        summary: issue.fields?.summary ?? '',
        status: issue.fields?.status?.name ?? null,
        statusCategory: issue.fields?.status?.statusCategory?.name ?? null,
      }));
      jira_available = true;
    } catch (err) {
      errors.push(`Failed to fetch Jira child issues for ${jira_epic_key}: ${errorMessage(err)}`);
    }
  }

  const child_issue_total = child_issues.length;
  const child_issue_done = child_issues.filter((i) => i.statusCategory === 'Done').length;

  const claimsShipped = Boolean(
    (aha_workflow_status && SHIPPED_PATTERN.test(aha_workflow_status)) ||
      (jira_epic_status && SHIPPED_PATTERN.test(jira_epic_status))
  );
  const jiraEpicNotDone = jira_epic_status_category !== null && jira_epic_status_category !== 'Done';
  const childrenIncomplete = child_issue_total > 0 && child_issue_done < child_issue_total;

  const gap_detected = claimsShipped && jira_available && (jiraEpicNotDone || childrenIncomplete);

  const gap_description = gap_detected
    ? buildGapDescription({
        aha_workflow_status,
        jira_epic_key,
        jira_epic_status,
        jira_epic_status_category,
        jiraEpicNotDone,
        childrenIncomplete,
        child_issues,
        child_issue_total,
        child_issue_done,
      })
    : null;

  return {
    aha_available,
    aha_description,
    aha_workflow_status,
    jira_available,
    jira_epic_key,
    jira_epic_status,
    jira_epic_status_category,
    child_issues,
    child_issue_total,
    child_issue_done,
    gap_detected,
    gap_description,
    errors,
  };
}

function buildGapDescription(args: {
  aha_workflow_status: string | null;
  jira_epic_key: string | null;
  jira_epic_status: string | null;
  jira_epic_status_category: string | null;
  jiraEpicNotDone: boolean;
  childrenIncomplete: boolean;
  child_issues: JiraChildIssueSummary[];
  child_issue_total: number;
  child_issue_done: number;
}): string {
  const {
    aha_workflow_status,
    jira_epic_key,
    jira_epic_status,
    jiraEpicNotDone,
    childrenIncomplete,
    child_issues,
    child_issue_total,
    child_issue_done,
  } = args;

  const claimSource =
    aha_workflow_status && SHIPPED_PATTERN.test(aha_workflow_status)
      ? `Aha workflow_status is '${aha_workflow_status}'`
      : `Jira epic ${jira_epic_key} status is '${jira_epic_status}'`;

  const evidence: string[] = [];
  if (jiraEpicNotDone && jira_epic_status) {
    evidence.push(`Jira epic ${jira_epic_key} is '${jira_epic_status}' (not Done)`);
  }
  if (childrenIncomplete) {
    const incomplete = child_issues.filter((i) => i.statusCategory !== 'Done');
    const listed = incomplete
      .slice(0, 5)
      .map((i) => `${i.key} (${i.status || 'unknown'})`)
      .join(', ');
    evidence.push(
      `${child_issue_total - child_issue_done} of ${child_issue_total} child issues incomplete: ${listed}${
        incomplete.length > 5 ? ', ...' : ''
      }`
    );
  }

  return `${claimSource}, but ${evidence.join('; ')}.`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
