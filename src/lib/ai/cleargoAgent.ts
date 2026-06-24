/**
 * ClearGO Conversational Agent
 * Shared core for Slack bot and in-app chat panel.
 *
 * Uses ai v6 API:
 *   - tool()         → inputSchema (not parameters)
 *   - generateText() → stopWhen: stepCountIs(N) (not maxSteps)
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { generateText, streamText, tool, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { getSlackClient } from '@/lib/slack/client';

const ANTHROPIC_API_V1 = 'https://api.anthropic.com/v1';

function getAnthropicBaseUrl(): string {
  const fromEnv = process.env.ANTHROPIC_BASE_URL?.trim().replace(/\/$/, '');
  if (fromEnv && (fromEnv.includes('/.netlify/ai') || fromEnv.includes('.netlify.app'))) {
    return ANTHROPIC_API_V1;
  }
  if (fromEnv) return fromEnv;
  return ANTHROPIC_API_V1;
}

function ensureKeys(): void {
  // Map CLAUDE_API_KEY → ANTHROPIC_API_KEY (Claude SDK convention)
  if (!process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_API_KEY) {
    process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
  }
  // Map GEMINI_API_KEY → GOOGLE_GENERATIVE_AI_API_KEY (Google SDK convention)
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && process.env.GEMINI_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
  }
}

export function hasCleargoAgentKey(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
    process.env.CLAUDE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY
  );
}

/** Pick Claude if available, otherwise Gemini. */
function resolveModel(): LanguageModel {
  ensureKeys();
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  // Only use Claude with a real Anthropic key — Netlify's AI integration injects a proxy
  // key that starts with something other than sk-ant- and fails against api.anthropic.com
  if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
    return createAnthropic({ baseURL: getAnthropicBaseUrl() })('claude-haiku-4-5-20251001');
  }
  return google('gemini-2.5-flash');
}

const SYSTEM_PROMPT = `You are ClearGO Assistant, an AI embedded in the ClearGO Launch Readiness Console.

You help product managers and stakeholders:
- Check the readiness status of product launches (called "epics")
- Identify which criteria are blocking a launch (NO_GO or NOT_SET — CONDITIONAL is acceptable)
- Find who owns which decisions
- Send reminders or pings to stakeholders about pending criteria
- Summarize team-wide launch risk and status

Key concepts:
- A "launch" or "epic" is a product feature being shipped
- Epics have readiness criteria across categories: PRODUCT_TECH, GTM, SUPPORT, LEGAL_SECURITY, DATA_ANALYTICS, OPS, etc.
- A "gate" criterion must be GO for the launch to proceed — these are the most critical
- Criterion statuses: GO = approved, NO_GO = blocking, CONDITIONAL = approved with conditions (this is fine, not a problem), NOT_SET = unreviewed and needs attention
- Only NOT_SET criteria are truly "pending" — CONDITIONAL means someone has already reviewed and set conditions, which is acceptable
- Tiers: TIER_1 = biggest launches, TIER_2 = medium, TIER_3 = smaller
- Risk levels: HIGH, MEDIUM, LOW

Tool routing rules (follow these strictly):
- "Who is blocking / delaying / ruining / holding up launches?" → get_accountability_report
- "Who has unreviewed criteria?" → get_accountability_report
- "What launches are at risk / show portfolio?" → get_team_overview
- "What do I need to do?" → get_my_pending_actions
- "Is launch X ready?" → check_launch_readiness

When responding:
- Be concise and actionable — lead with the most important information
- Use mrkdwn when in Slack (bold with *, code with \`, lists with -)
- Summarize tool results in plain language — don't dump raw data
- For accountability results, be direct and name names — the user wants actionable info, not diplomacy
- If you can't find something, say so clearly rather than guessing`;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://launch-console.clearcompany.com';

// ai v6: tool() uses inputSchema (renamed from parameters)
function buildTools(userEmail: string) {
  return {
    search_launches: tool({
      description:
        'Search for product launches (epics) by name or Aha! ID. Call this when the user asks about a specific launch.',
      inputSchema: z.object({
        query: z.string().describe('Launch name or Aha! ID to search for'),
      }),
      execute: async ({ query }) => {
        const supabase = createAdminClient();
        const { data, error } = await supabase
          .from('epic')
          .select('id, name, tier, status, readiness_score, risk_level, target_launch_date')
          .or(`name.ilike.%${query}%,aha_id.ilike.%${query}%`)
          .neq('status', 'Cancelled')
          .limit(5);

        if (error) return { error: error.message };
        if (!data || data.length === 0) return { message: `No launches found matching "${query}".` };

        return data.map((e) => ({
          id: e.id,
          name: e.name,
          tier: e.tier,
          status: e.status,
          readinessScore: e.readiness_score != null ? `${Math.round(e.readiness_score * 100)}%` : 'N/A',
          riskLevel: e.risk_level,
          targetLaunchDate: e.target_launch_date,
          url: `${APP_URL}/epics/${e.id}`,
        }));
      },
    }),

    get_launch_detail: tool({
      description:
        'Get full readiness breakdown for a launch — all criteria statuses grouped by GO/NO_GO/CONDITIONAL/NOT_SET.',
      inputSchema: z.object({
        epic_id: z
          .string()
          .optional()
          .describe('Epic UUID (use if known from a prior search_launches call)'),
        epic_name: z
          .string()
          .optional()
          .describe('Epic name — will fuzzy-match if epic_id not provided'),
      }),
      execute: async ({ epic_id, epic_name }) => {
        const supabase = createAdminClient();
        let resolvedId = epic_id;

        if (!resolvedId && epic_name) {
          const { data } = await supabase
            .from('epic')
            .select('id')
            .ilike('name', `%${epic_name}%`)
            .limit(1)
            .maybeSingle();
          resolvedId = data?.id;
        }

        if (!resolvedId) return { error: 'Launch not found. Try search_launches first.' };

        const [epicRes, criteriaRes] = await Promise.all([
          supabase
            .from('epic')
            .select(
              'id, name, tier, status, readiness_score, risk_level, target_launch_date, criteria_red_flag_count'
            )
            .eq('id', resolvedId)
            .single(),
          supabase
            .from('epic_criterion_status')
            .select(
              `status, current_status_notes, condition, criterion:criterion_id (label, category, gate)`
            )
            .eq('epic_id', resolvedId),
        ]);

        const epic = epicRes.data;
        const criteria = criteriaRes.data || [];

        const byStatus = (s: string) =>
          criteria
            .filter((c) => c.status === s)
            .map((c) => ({
              label: (c.criterion as any)?.label ?? 'Unknown',
              category: (c.criterion as any)?.category,
              isGate: (c.criterion as any)?.gate ?? false,
              notes: c.current_status_notes || undefined,
              condition: c.condition || undefined,
            }));

        return {
          name: epic?.name,
          tier: epic?.tier,
          status: epic?.status,
          readinessScore:
            epic?.readiness_score != null ? `${Math.round(epic.readiness_score * 100)}%` : 'N/A',
          riskLevel: epic?.risk_level,
          targetLaunchDate: epic?.target_launch_date,
          redFlagCount: epic?.criteria_red_flag_count ?? 0,
          url: `${APP_URL}/epics/${resolvedId}`,
          criteriaBreakdown: {
            noGo: byStatus('NO_GO'),
            conditional: byStatus('CONDITIONAL'),
            notSet: byStatus('NOT_SET'),
            goCount: criteria.filter((c) => c.status === 'GO').length,
          },
        };
      },
    }),

    get_my_pending_actions: tool({
      description:
        'Get criteria decisions that are unreviewed (NOT_SET only) for the current user or a specified person. CONDITIONAL criteria are acceptable and not included.',
      inputSchema: z.object({
        email: z
          .string()
          .optional()
          .describe('Email of the person — omit to default to the current user'),
      }),
      execute: async ({ email }) => {
        const supabase = createAdminClient();
        const targetEmail = email || userEmail;

        const { data: user } = await supabase
          .from('app_user')
          .select('id, first_name, last_name')
          .eq('email', targetEmail)
          .maybeSingle();

        if (!user) return { error: `No user found with email: ${targetEmail}` };

        const { data: pending } = await supabase
          .from('epic_criterion_status')
          .select(
            `status, last_updated_at,
             epic:epic_id (id, name, tier, target_launch_date, risk_level),
             criterion:criterion_id (label, category, gate)`
          )
          .eq('decision_owner_id', user.id)
          .in('status', ['NOT_SET'])
          .order('last_updated_at', { ascending: true });

        if (!pending || pending.length === 0) {
          const name =
            [user.first_name, user.last_name].filter(Boolean).join(' ') || targetEmail;
          return { message: `No pending criteria decisions for ${name}. All caught up!` };
        }

        return {
          user: [user.first_name, user.last_name].filter(Boolean).join(' ') || targetEmail,
          pendingCount: pending.length,
          items: pending.map((p) => ({
            criterion: (p.criterion as any)?.label,
            category: (p.criterion as any)?.category,
            isGate: (p.criterion as any)?.gate ?? false,
            epicName: (p.epic as any)?.name,
            epicTier: (p.epic as any)?.tier,
            riskLevel: (p.epic as any)?.risk_level,
            status: p.status,
            daysSinceUpdate: Math.floor(
              (Date.now() - new Date(p.last_updated_at).getTime()) / 86_400_000
            ),
            url: `${APP_URL}/epics/${(p.epic as any)?.id}`,
          })),
        };
      },
    }),

    get_team_overview: tool({
      description:
        'Get a summary of all active launches sorted by risk level and launch date. Useful for portfolio-level questions like "what launches are at risk?", "show me all TIER_1 launches", or "what is the state of our portfolio?". Do NOT use this for questions about people, accountability, or who is blocking things — use get_accountability_report for that.',
      inputSchema: z.object({
        tier: z
          .enum(['TIER_1', 'TIER_2', 'TIER_3'])
          .optional()
          .describe('Filter to a specific tier'),
        risk: z
          .enum(['HIGH', 'MEDIUM', 'LOW'])
          .optional()
          .describe('Filter to a specific risk level'),
      }),
      execute: async ({ tier, risk }) => {
        const supabase = createAdminClient();
        let query = supabase
          .from('epic')
          .select('id, name, tier, status, readiness_score, risk_level, target_launch_date')
          .neq('status', 'Cancelled')
          .neq('status', 'Released_Retroed')
          .order('target_launch_date', { ascending: true })
          .limit(20);

        if (tier) query = query.eq('tier', tier);
        if (risk) query = query.eq('risk_level', risk);

        const { data, error } = await query;
        if (error) return { error: error.message };
        if (!data || data.length === 0) return { message: 'No active launches found.' };

        return {
          total: data.length,
          launches: data.map((e) => ({
            name: e.name,
            tier: e.tier,
            riskLevel: e.risk_level,
            readinessScore:
              e.readiness_score != null ? `${Math.round(e.readiness_score * 100)}%` : 'N/A',
            targetLaunchDate: e.target_launch_date,
            url: `${APP_URL}/epics/${e.id}`,
          })),
        };
      },
    }),

    ping_user: tool({
      description:
        'Send a Slack DM to a stakeholder or PM. Use their email address. Only ping when the user explicitly requests it.',
      inputSchema: z.object({
        target_email: z.string().describe('Email address of the person to ping'),
        message: z
          .string()
          .describe('The message to send them (keep it brief and actionable)'),
        context: z
          .string()
          .optional()
          .describe('Short context note, e.g. "Payroll Launch — GTM criterion"'),
      }),
      execute: async ({ target_email, message, context: ctx }) => {
        const supabase = createAdminClient();

        const { data: target } = await supabase
          .from('app_user')
          .select('first_name, last_name, slack_handle, receive_slack_notifications')
          .eq('email', target_email)
          .maybeSingle();

        if (!target) return { error: `No user found with email: ${target_email}` };
        if (!target.slack_handle)
          return { error: `${target_email} has no Slack handle configured in ClearGO.` };
        if (target.receive_slack_notifications === false)
          return { error: `${target_email} has disabled Slack notifications.` };

        const { data: sender } = await supabase
          .from('app_user')
          .select('first_name, last_name')
          .eq('email', userEmail)
          .maybeSingle();

        const senderName = sender
          ? [sender.first_name, sender.last_name].filter(Boolean).join(' ')
          : userEmail;

        const slackText = ctx
          ? `*Message from ${senderName} via ClearGO*\n${message}\n\n_Re: ${ctx}_`
          : `*Message from ${senderName} via ClearGO*\n${message}`;

        try {
          const slackClient = getSlackClient();
          const channelId = await slackClient.openConversation(target.slack_handle);
          await slackClient.postMessage({ channel: channelId, text: slackText });
          const targetName =
            [target.first_name, target.last_name].filter(Boolean).join(' ') || target_email;
          return { success: true, message: `Sent Slack DM to ${targetName}.` };
        } catch (err) {
          return {
            error: `Slack delivery failed: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
    }),

    update_criterion_status: tool({
      description:
        'Update the status (GO, NO_GO, CONDITIONAL) of a specific criterion on a launch. Only call this when the user explicitly asks to mark or update a criterion. Requires the launch name and criterion label.',
      inputSchema: z.object({
        epic_name: z.string().describe('Name of the launch (fuzzy matched)'),
        criterion_label: z.string().describe('Label of the criterion to update (fuzzy matched)'),
        status: z.enum(['GO', 'NO_GO', 'CONDITIONAL']).describe('New status to set'),
        notes: z.string().optional().describe('Optional notes or reason for the status change'),
      }),
      execute: async ({ epic_name, criterion_label, status, notes }) => {
        const supabase = createAdminClient();

        const { data: epic } = await supabase
          .from('epic')
          .select('id, name')
          .ilike('name', `%${epic_name}%`)
          .limit(1)
          .maybeSingle();
        if (!epic) return { error: `Launch not found: "${epic_name}"` };

        const { data: user } = await supabase
          .from('app_user')
          .select('id')
          .eq('email', userEmail)
          .maybeSingle();
        if (!user) return { error: `Could not find user: ${userEmail}` };

        // Find the criterion_status row by joining through criterion label
        const { data: rows } = await supabase
          .from('epic_criterion_status')
          .select('id, status, criterion:criterion_id (id, label)')
          .eq('epic_id', epic.id);

        const match = (rows || []).find((r) =>
          (r.criterion as any)?.label?.toLowerCase().includes(criterion_label.toLowerCase())
        );
        if (!match) return { error: `Criterion "${criterion_label}" not found on "${epic.name}"` };

        const updateData: Record<string, unknown> = {
          status,
          last_updated_at: new Date().toISOString(),
          last_updated_by: user.id,
        };
        if (notes) updateData.current_status_notes = notes;

        const { error } = await supabase
          .from('epic_criterion_status')
          .update(updateData)
          .eq('id', match.id);

        if (error) return { error: error.message };

        try {
          await supabase.from('audit_log').insert({
            actor_id: user.id,
            entity_type: 'epic_criterion_status',
            entity_id: match.id,
            json_diff: { status: { old: match.status, new: status } },
          });
        } catch {}

        return {
          success: true,
          message: `Updated "${(match.criterion as any)?.label}" on "${epic.name}" to ${status}.`,
          url: `${APP_URL}/epics/${epic.id}`,
        };
      },
    }),

    get_launch_comments: tool({
      description:
        'Get recent comments on a launch across all criteria. Useful for understanding context, blockers, or history.',
      inputSchema: z.object({
        epic_name: z.string().describe('Name of the launch'),
        limit: z.number().optional().describe('Max number of comments to return (default 20)'),
      }),
      execute: async ({ epic_name, limit = 20 }) => {
        const supabase = createAdminClient();

        const { data: epic } = await supabase
          .from('epic')
          .select('id, name')
          .ilike('name', `%${epic_name}%`)
          .limit(1)
          .maybeSingle();
        if (!epic) return { error: `Launch not found: "${epic_name}"` };

        const { data: statusRows } = await supabase
          .from('epic_criterion_status')
          .select('id, criterion:criterion_id (label)')
          .eq('epic_id', epic.id);

        const lcsIds = (statusRows || []).map((r) => r.id);
        if (lcsIds.length === 0) return { message: `No criteria found for "${epic.name}".` };

        const { data: comments } = await supabase
          .from('criterion_comment')
          .select(`
            comment_text, created_at, status_at_comment,
            launch_criterion_status_id,
            created_by:app_user!criterion_comment_created_by_fkey(first_name, last_name, email)
          `)
          .in('launch_criterion_status_id', lcsIds)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (!comments || comments.length === 0)
          return { message: `No comments found on "${epic.name}".` };

        const lcsMap = Object.fromEntries(
          (statusRows || []).map((r) => [r.id, (r.criterion as any)?.label])
        );

        return {
          epicName: epic.name,
          commentCount: comments.length,
          comments: comments.map((c) => ({
            criterion: lcsMap[c.launch_criterion_status_id] ?? 'Unknown',
            text: c.comment_text,
            author: [(c.created_by as any)?.first_name, (c.created_by as any)?.last_name]
              .filter(Boolean)
              .join(' ') || (c.created_by as any)?.email,
            statusAtTime: c.status_at_comment,
            date: c.created_at,
          })),
        };
      },
    }),

    get_user_workload: tool({
      description:
        'Get all launches a user is involved with as a decision owner, grouped by epic. Shows how many criteria they own and their statuses.',
      inputSchema: z.object({
        email: z.string().optional().describe('Email of the person — omit for current user'),
      }),
      execute: async ({ email }) => {
        const supabase = createAdminClient();
        const targetEmail = email || userEmail;

        const { data: user } = await supabase
          .from('app_user')
          .select('id, first_name, last_name')
          .eq('email', targetEmail)
          .maybeSingle();
        if (!user) return { error: `No user found with email: ${targetEmail}` };

        const { data: rows } = await supabase
          .from('epic_criterion_status')
          .select(`
            status,
            epic:epic_id (id, name, tier, risk_level, target_launch_date),
            criterion:criterion_id (label, gate)
          `)
          .eq('decision_owner_id', user.id);

        if (!rows || rows.length === 0) {
          const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || targetEmail;
          return { message: `${name} is not assigned as decision owner on any criteria.` };
        }

        // Group by epic
        const epicMap: Record<string, any> = {};
        for (const r of rows) {
          const epic = r.epic as any;
          if (!epic) continue;
          if (!epicMap[epic.id]) {
            epicMap[epic.id] = {
              name: epic.name,
              tier: epic.tier,
              riskLevel: epic.risk_level,
              targetLaunchDate: epic.target_launch_date,
              url: `${APP_URL}/epics/${epic.id}`,
              criteria: { GO: 0, NO_GO: 0, CONDITIONAL: 0, NOT_SET: 0 },
              gatesNotGo: [] as string[],
            };
          }
          epicMap[epic.id].criteria[r.status as string] =
            (epicMap[epic.id].criteria[r.status as string] || 0) + 1;
          if ((r.criterion as any)?.gate && r.status !== 'GO') {
            epicMap[epic.id].gatesNotGo.push((r.criterion as any)?.label);
          }
        }

        const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || targetEmail;
        return {
          user: name,
          totalCriteria: rows.length,
          epics: Object.values(epicMap),
        };
      },
    }),

    check_launch_readiness: tool({
      description:
        'Assess whether a launch is ready to ship. Returns the readiness score, blocking issues, and a clear GO / NO_GO / NEEDS_WORK recommendation.',
      inputSchema: z.object({
        epic_name: z.string().optional().describe('Name of the launch (fuzzy matched)'),
        epic_id: z.string().optional().describe('Epic UUID (use if known)'),
      }),
      execute: async ({ epic_name, epic_id }) => {
        const supabase = createAdminClient();
        let resolvedId = epic_id;

        if (!resolvedId && epic_name) {
          const { data } = await supabase
            .from('epic')
            .select('id')
            .ilike('name', `%${epic_name}%`)
            .limit(1)
            .maybeSingle();
          resolvedId = data?.id;
        }
        if (!resolvedId) return { error: 'Launch not found. Try search_launches first.' };

        const [epicRes, criteriaRes] = await Promise.all([
          supabase
            .from('epic')
            .select('id, name, tier, readiness_score, risk_level, target_launch_date, status')
            .eq('id', resolvedId)
            .single(),
          supabase
            .from('epic_criterion_status')
            .select('status, criterion:criterion_id (label, category, gate)')
            .eq('epic_id', resolvedId),
        ]);

        const epic = epicRes.data;
        const criteria = criteriaRes.data || [];

        const gatesNotGo = criteria.filter(
          (c) => (c.criterion as any)?.gate && c.status !== 'GO'
        );
        const blocking = criteria.filter((c) => c.status === 'NO_GO');
        const notSet = criteria.filter((c) => c.status === 'NOT_SET');
        const score = epic?.readiness_score != null ? Math.round(epic.readiness_score * 100) : null;

        let recommendation: string;
        if (blocking.length > 0) {
          recommendation = 'NO_GO — has blocking criteria that must be resolved first.';
        } else if (gatesNotGo.length > 0) {
          recommendation = 'NO_GO — one or more gate criteria are not yet GO.';
        } else if (notSet.length > 0) {
          recommendation = `NEEDS_WORK — ${notSet.length} criteria still unreviewed (NOT_SET).`;
        } else {
          recommendation = 'GO — all criteria reviewed with no blockers.';
        }

        return {
          name: epic?.name,
          tier: epic?.tier,
          riskLevel: epic?.risk_level,
          targetLaunchDate: epic?.target_launch_date,
          readinessScore: score != null ? `${score}%` : 'N/A',
          recommendation,
          blockingCount: blocking.length,
          gatesNotGoCount: gatesNotGo.length,
          notSetCount: notSet.length,
          blockers: blocking.map((c) => (c.criterion as any)?.label),
          gatesNotGo: gatesNotGo.map((c) => ({
            label: (c.criterion as any)?.label,
            status: c.status,
          })),
          url: `${APP_URL}/epics/${resolvedId}`,
        };
      },
    }),

    get_criteria_by_category: tool({
      description:
        'Get all criteria for a launch filtered by category (e.g. GTM, SUPPORT, PRODUCT_TECH, LEGAL_SECURITY).',
      inputSchema: z.object({
        epic_name: z.string().describe('Name of the launch'),
        category: z
          .string()
          .optional()
          .describe(
            'Category filter: PRODUCT_TECH, GTM, SUPPORT, LEGAL_SECURITY, DATA_ANALYTICS, OPS, STRATEGY, OTHER'
          ),
      }),
      execute: async ({ epic_name, category }) => {
        const supabase = createAdminClient();

        const { data: epic } = await supabase
          .from('epic')
          .select('id, name')
          .ilike('name', `%${epic_name}%`)
          .limit(1)
          .maybeSingle();

        if (!epic) return { error: `Launch not found: "${epic_name}"` };

        const { data } = await supabase
          .from('epic_criterion_status')
          .select(
            `status, current_status_notes, condition, criterion:criterion_id (label, category, gate)`
          )
          .eq('epic_id', epic.id);

        const rows = (data || []).filter(
          (c) => !category || (c.criterion as any)?.category === category
        );

        return {
          epicName: epic.name,
          category: category || 'All',
          criteria: rows.map((c) => ({
            label: (c.criterion as any)?.label,
            category: (c.criterion as any)?.category,
            isGate: (c.criterion as any)?.gate ?? false,
            status: c.status,
            notes: c.current_status_notes || undefined,
            condition: c.condition || undefined,
          })),
        };
      },
    }),

    get_accountability_report: tool({
      description:
        'Identifies which people are holding up valuable launches by owning NOT_SET criteria on high-tier epics. Ranks individuals by impact score based on tier weight, gate status, and proximity to target launch date. Use when asked who is blocking launches, who is delaying things, or who is responsible for unreviewed criteria.',
      inputSchema: z.object({
        top_n: z
          .number()
          .optional()
          .describe('How many people to show (default 10)'),
        tier_filter: z
          .enum(['TIER_1', 'TIER_2', 'TIER_3'])
          .optional()
          .describe('Restrict to a specific tier'),
      }),
      execute: async ({ top_n = 10, tier_filter }) => {
        const supabase = createAdminClient();

        let query = supabase
          .from('epic_criterion_status')
          .select(`
            id,
            decision_owner_id,
            epic:epic_id (id, name, tier, target_launch_date, status),
            criterion:criterion_id (label, gate),
            decision_owner:app_user!epic_criterion_status_decision_owner_id_fkey (
              id, first_name, last_name, email
            )
          `)
          .eq('status', 'NOT_SET')
          .not('decision_owner_id', 'is', null);

        if (tier_filter) {
          query = (query as any).eq('epic.tier', tier_filter);
        }

        const { data: rows } = await query;
        if (!rows || rows.length === 0) {
          return { message: 'No unreviewed criteria with assigned owners. All good!' };
        }

        const tierWeight: Record<string, number> = { TIER_1: 10, TIER_2: 5, TIER_3: 2 };
        const now = Date.now();

        const personMap: Record<
          string,
          {
            name: string;
            email: string;
            score: number;
            criteria: Array<{
              epic: string;
              tier: string;
              label: string;
              isGate: boolean;
              daysUntilLaunch: number | null;
            }>;
          }
        > = {};

        for (const r of rows) {
          const owner = r.decision_owner as any;
          const epic = r.epic as any;
          const criterion = r.criterion as any;
          if (!owner || !epic || epic.status === 'Cancelled') continue;
          if (tier_filter && epic.tier !== tier_filter) continue;

          const personKey = owner.id;
          if (!personMap[personKey]) {
            const name =
              [owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.email;
            personMap[personKey] = { name, email: owner.email, score: 0, criteria: [] };
          }

          const weight = tierWeight[epic.tier] ?? 1;
          const gateMultiplier = criterion?.gate ? 2 : 1;

          let urgencyMultiplier = 1;
          let daysUntilLaunch: number | null = null;
          if (epic.target_launch_date) {
            const msUntil = new Date(epic.target_launch_date).getTime() - now;
            daysUntilLaunch = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
            if (daysUntilLaunch < 0) urgencyMultiplier = 3;
            else if (daysUntilLaunch <= 14) urgencyMultiplier = 2.5;
            else if (daysUntilLaunch <= 30) urgencyMultiplier = 1.5;
          }

          personMap[personKey].score += weight * gateMultiplier * urgencyMultiplier;
          personMap[personKey].criteria.push({
            epic: epic.name,
            tier: epic.tier,
            label: criterion?.label ?? 'Unknown',
            isGate: criterion?.gate ?? false,
            daysUntilLaunch,
          });
        }

        const ranked = Object.values(personMap)
          .sort((a, b) => b.score - a.score)
          .slice(0, top_n);

        return {
          totalUnreviewedCriteria: rows.filter(
            (r) => (r.epic as any)?.status !== 'Cancelled'
          ).length,
          totalPeopleWithPending: Object.keys(personMap).length,
          ranked: ranked.map((p, i) => ({
            rank: i + 1,
            name: p.name,
            email: p.email,
            impactScore: Math.round(p.score),
            unreviewedCount: p.criteria.length,
            mostUrgent: p.criteria
              .sort((a, b) => {
                if (a.daysUntilLaunch === null) return 1;
                if (b.daysUntilLaunch === null) return -1;
                return a.daysUntilLaunch - b.daysUntilLaunch;
              })
              .slice(0, 3),
          })),
        };
      },
    }),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run the agent and return a plain-text response.
 * Used by the Slack bot (app_mention, message.im).
 */
export async function runCleargoAgent(params: {
  message: string;
  userEmail?: string;
  contextEpicId?: string;
}): Promise<string> {
  const { message, userEmail = 'unknown', contextEpicId } = params;

  if (!hasCleargoAgentKey()) {
    return 'The ClearGO AI assistant is not configured. Contact your admin to set up CLAUDE_API_KEY or GEMINI_API_KEY.';
  }

  const model = resolveModel();
  const system = contextEpicId
    ? `${SYSTEM_PROMPT}\n\nThe user is currently viewing epic ID: ${contextEpicId}.`
    : SYSTEM_PROMPT;

  try {
    const { text } = await generateText({
      model,
      system,
      prompt: message,
      tools: buildTools(userEmail),
      stopWhen: stepCountIs(5),
    });
    return text || "I couldn't generate a response — please try rephrasing.";
  } catch (error: any) {
    console.error('ClearGO agent error:', error?.message || error);
    return 'Sorry, something went wrong. Please try again.';
  }
}

/**
 * Return a streamText result for the in-app chat endpoint.
 * Call .toTextStreamResponse() on the result.
 */
export function createCleargoAgentStream(params: {
  messages: { role: 'user' | 'assistant'; content: string }[];
  userEmail?: string;
  contextEpicId?: string;
}) {
  const { messages, userEmail = 'unknown', contextEpicId } = params;

  const model = resolveModel();
  const system = contextEpicId
    ? `${SYSTEM_PROMPT}\n\nThe user is currently viewing epic ID: ${contextEpicId}.`
    : SYSTEM_PROMPT;

  return streamText({
    model,
    system,
    messages,
    tools: buildTools(userEmail),
    stopWhen: stepCountIs(5),
  });
}
