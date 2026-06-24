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
- Identify which criteria are blocking a launch (GO / NO_GO / CONDITIONAL / NOT_SET)
- Find who owns which decisions
- Send reminders or pings to stakeholders about pending criteria
- Summarize team-wide launch risk and status

Key concepts:
- A "launch" or "epic" is a product feature being shipped
- Epics have readiness criteria across categories: PRODUCT_TECH, GTM, SUPPORT, LEGAL_SECURITY, DATA_ANALYTICS, OPS, etc.
- A "gate" criterion must be GO for the launch to proceed — these are the most critical
- Tiers: TIER_1 = biggest launches, TIER_2 = medium, TIER_3 = smaller
- Risk levels: HIGH, MEDIUM, LOW

When responding:
- Be concise and actionable — lead with the most important information
- Use mrkdwn when in Slack (bold with *, code with \`, lists with -)
- Summarize tool results in plain language — don't dump raw data
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
        'Get criteria decisions that are pending (NOT_SET or CONDITIONAL) for the current user or a specified person.',
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
          .in('status', ['NOT_SET', 'CONDITIONAL'])
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
        'Get a summary of all active launches sorted by risk level and launch date. Useful for portfolio-level questions.',
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
          .select(
            'id, name, tier, status, readiness_score, risk_level, target_launch_date, criteria_red_flag_count'
          )
          .neq('status', 'Cancelled')
          .neq('status', 'Released_Retroed')
          .order('risk_level', { ascending: false })
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
            redFlagCount: e.criteria_red_flag_count ?? 0,
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
