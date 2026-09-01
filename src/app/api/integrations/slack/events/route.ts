/**
 * Slack Events API endpoint
 * Handles incoming events from Slack (app mentions, home opened, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import type { SlackEventPayload } from '@/types/slack';
import { getSlackClient } from '@/lib/slack/client';
import { hasCleargoAgentKey } from '@/lib/ai/cleargoAgent';
import {
    buildArtifactBlocks,
    buildStoryBriefQuestionBlocks,
    buildUnassignedBlocks,
} from '@/lib/slack/templates/launch-home';
import {
    buildOwnedReleaseBlocks,
    buildPendingCriteriaBlocks,
    MAX_HOME_CRITERIA,
    MAX_HOME_RELEASES,
    type HomeCriterion,
    type HomeRelease,
} from '@/lib/slack/templates/release-home';
import { loadLaunchHomeWork, loadHomeBriefs } from '@/lib/services/launchHomeService';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cleargo.netlify.app';

async function triggerAgentBackground(payload: {
    type: 'app_mention' | 'direct_message';
    message: string;
    channel: string;
    thread_ts?: string;
    userEmail?: string;
}): Promise<void> {
    const baseUrl = (process.env.NETLIFY_URL || process.env.URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');
    if (!baseUrl || baseUrl.includes('localhost')) return;
    const secret = process.env.CRON_SECRET || '';
    const bgUrl = `${baseUrl}/.netlify/functions/slack-agent-background`;
    try {
        await fetch(bgUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret, ...payload }),
        });
    } catch (err) {
        console.error('Failed to trigger slack-agent-background:', err);
    }
}

export async function POST(request: NextRequest) {
    try {
        // Get raw body for signature verification
        const body = await request.text();
        const payload: SlackEventPayload = JSON.parse(body);

        // Handle URL verification challenge FIRST (before signature check)
        // Slack's challenge request may not include proper signing headers
        if (payload.type === 'url_verification') {
            return NextResponse.json({ challenge: payload.challenge });
        }

        // Now verify request is from Slack for all other events
        const { timestamp, signature } = extractSlackHeaders(request);

        if (!timestamp || !signature) {
            return NextResponse.json({ error: 'Missing Slack headers' }, { status: 400 });
        }

        if (!SLACK_SIGNING_SECRET) {
            console.error('SLACK_SIGNING_SECRET not configured');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        if (!verifySlackRequest(body, timestamp, signature, SLACK_SIGNING_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        // Handle events
        if (payload.type === 'event_callback') {
            const { event } = payload;

            switch (event.type) {
                case 'app_home_opened':
                    await handleAppHomeOpened(event);
                    break;

                case 'app_mention':
                    await handleAppMention(event);
                    break;

                case 'message':
                    if (event.channel_type === 'im') {
                        await handleDirectMessage(event);
                    }
                    break;

                case 'link_shared':
                    await handleLinkShared(event);
                    break;

                default:
                    console.log('Unhandled event type:', event.type);
            }
        }

        // Acknowledge receipt
        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Slack events error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function handleAppHomeOpened(event: any) {
    try {
        const userId = event.user;
        if (!userId) {
            console.error('No user ID in app_home_opened event');
            return;
        }

        // app_home_opened also fires when someone opens the Messages tab. Only
        // the Home tab has a view to publish; republishing on a DM open is a
        // wasted round-trip to the database and to Slack.
        if (event.tab && event.tab !== 'home') {
            return;
        }

        // Look up user by Slack user_id.
        //
        // MUST be the admin client. `app_user` carries RLS "Allow authenticated
        // read USING (auth.role() = 'authenticated')" (20240101000000), and a
        // Slack webhook has no session at all -- so under the RLS client this
        // read returns zero rows whatever the person's slack_handle is, and App
        // Home told everyone their account was not linked. Matches
        // resolveUserEmailFromSlackId below and slackActor.ts, which is why the
        // review buttons could resolve an actor and this could not.
        const supabase = (await import('@/lib/supabase/server')).createAdminClient();

        const { data: appUser, error: userError } = await supabase
            .from('app_user')
            .select('id, email, first_name, last_name')
            .eq('slack_handle', userId)
            .maybeSingle();

        // Build home view blocks
        const blocks: any[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: '🚀 ClearGO',
                    emoji: true,
                },
            },
        ];

        if (userError || !appUser) {
            // User not linked - show welcome message
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text:
                        `👋 Hi! I couldn't find your account linked to this Slack user.` +
                        `\n\nPlease make sure your Slack handle is synced in ClearGO.`,
                },
            });
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: "Once your account is linked, you'll see your releases and criteria here.",
                },
            });
        } else {
            const { releases, releaseTotal } = await loadOwnedReleases(supabase, appUser.id);
            const { criteria, criteriaTotal } = await loadPendingCriteria(supabase, appUser.id);

            // Add welcome message
            const firstName = appUser.first_name || 'there';
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `Welcome back, *${firstName}*! 👋\n\nHere's what needs your attention:`,
                },
            });

            blocks.push({ type: 'divider' });
            blocks.push(...buildOwnedReleaseBlocks(releases, releaseTotal, APP_URL));
            blocks.push({ type: 'divider' });
            blocks.push(...buildPendingCriteriaBlocks(criteria, criteriaTotal, APP_URL));

            blocks.push({ type: 'divider' });

            // GTM launch work. The home tab has only ever known about epics, so
            // a PMM carrying artifacts on the launch table saw nothing here.
            // Failures degrade to a missing section rather than an error view.
            try {
                const work = await loadLaunchHomeWork(appUser.email);
                blocks.push(...buildArtifactBlocks(work.artifacts, APP_URL));
                const gaps = buildUnassignedBlocks(work.unassigned, APP_URL);
                if (gaps.length > 0) {
                    blocks.push({ type: 'divider' });
                    blocks.push(...gaps);
                }
            } catch (err) {
                console.error('home: launch artifacts unavailable', err);
            }

            try {
                const briefs = await loadHomeBriefs(appUser.email);
                const briefBlocks = buildStoryBriefQuestionBlocks(briefs);
                if (briefBlocks.length > 0) {
                    blocks.push({ type: 'divider' });
                    blocks.push(...briefBlocks);
                }
            } catch (err) {
                console.error('home: story brief questions unavailable', err);
            }

            blocks.push({ type: 'divider' });

            // Add action buttons
            blocks.push({
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'View Portfolio Dashboard',
                            emoji: true,
                        },
                        url: `${APP_URL}/portfolio`,
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'All Releases',
                            emoji: true,
                        },
                        url: `${APP_URL}/epics`,
                    },
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'GTM Launches',
                            emoji: true,
                        },
                        url: `${APP_URL}/gtm-launches`,
                    },
                ],
            });
        }

        // Publish home view
        const slackClient = getSlackClient();
        await slackClient.publishHomeView(userId, {
            type: 'home',
            blocks,
        });

        console.log('Published home view for user:', userId);
    } catch (error) {
        console.error('Error handling app home opened:', error);
        // Try to publish a basic error view
        try {
            const slackClient = getSlackClient();
            await slackClient.publishHomeView(event.user, {
                type: 'home',
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: '⚠️ Sorry, there was an error loading your home view. Please try again later.',
                        },
                    },
                ],
            });
        } catch (publishError) {
            console.error('Failed to publish error home view:', publishError);
        }
    }
}

/**
 * Releases this person owns that are still live work.
 *
 * Three things the old inline query got wrong:
 *  - it returned archived epics (not ClearGO candidates — hidden everywhere
 *    else in the app) and Cancelled ones;
 *  - it ordered by target_launch_date ASC across all time and took five, so a
 *    long-serving PM got their five OLDEST releases, all of them shipped years
 *    ago, and never saw the one launching next week;
 *  - it reported `rows.length` as the total, which is always <= the page size.
 *
 * Ordering here is upcoming-first (soonest target date), topped up with the
 * most recently shipped when there is room. Release lifecycle is derived, not
 * stored (see src/lib/epic-release-status.ts), and deriving it needs retros and
 * the release schedule per epic — too much for a home tab — so the target date
 * stands in for it. Cancelled is the one status that is genuinely stored.
 */
async function loadOwnedReleases(
    supabase: SupabaseClient,
    ownerId: string
): Promise<{ releases: HomeRelease[]; releaseTotal: number }> {
    const COLUMNS =
        'id, name, tier, readiness_status, readiness_score, risk_level, target_launch_date';
    const today = new Date().toISOString().slice(0, 10);

    const active = () =>
        supabase
            .from('epic')
            .select(COLUMNS)
            .eq('owner_id', ownerId)
            .eq('archived', false)
            .neq('status', 'Cancelled');

    // Counted over the whole active set in one head request, so the heading is
    // a real total rather than however many rows the two pages below returned.
    const { count } = await supabase
        .from('epic')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', ownerId)
        .eq('archived', false)
        .neq('status', 'Cancelled');

    // Undated releases sort last in an ASC order, so they ride along with the
    // upcoming bucket rather than being stranded behind the shipped ones.
    const upcoming = await active()
        .or(`target_launch_date.gte.${today},target_launch_date.is.null`)
        .order('target_launch_date', { ascending: true, nullsFirst: false })
        .limit(MAX_HOME_RELEASES);

    if (upcoming.error) throw upcoming.error;
    const rows = [...(upcoming.data ?? [])];

    // Only top up with recently shipped work when the upcoming bucket is thin.
    if (rows.length < MAX_HOME_RELEASES) {
        const shipped = await active()
            .lt('target_launch_date', today)
            .order('target_launch_date', { ascending: false })
            .limit(MAX_HOME_RELEASES - rows.length);

        if (shipped.error) throw shipped.error;
        rows.push(...(shipped.data ?? []));
    }

    return {
        releases: rows.map((r) => ({
            id: r.id,
            name: r.name,
            tier: r.tier ?? null,
            readinessStatus: r.readiness_status ?? null,
            readinessScore: r.readiness_score ?? null,
            riskLevel: r.risk_level ?? null,
            targetLaunchDate: r.target_launch_date ?? null,
        })),
        releaseTotal: count ?? rows.length,
    };
}

/**
 * Criteria waiting on this person's decision. `!inner` on the epic join is what
 * lets the archived/Cancelled filter apply — without it the embed is a left
 * join and the filters silently do nothing.
 *
 * NOT_SET only, matching the section heading. /my-releases also counts
 * CONDITIONAL, which the nudge jobs treat as never complete; that asymmetry is
 * a product decision (see COMPLETE_STATUSES in criteriaNotificationFilters) and
 * is deliberately not changed here.
 */
async function loadPendingCriteria(
    supabase: SupabaseClient,
    decisionOwnerId: string
): Promise<{ criteria: HomeCriterion[]; criteriaTotal: number }> {
    const { data, error, count } = await supabase
        .from('epic_criterion_status')
        .select(
            `
                id,
                status,
                last_updated_at,
                epic:epic_id!inner (id, name, archived, status),
                criterion:criterion_id!inner (id, label)
            `,
            { count: 'exact' }
        )
        .eq('decision_owner_id', decisionOwnerId)
        .eq('status', 'NOT_SET')
        .eq('epic.archived', false)
        .neq('epic.status', 'Cancelled')
        // Stalest first: the ones that have sat longest are the ones the
        // section's clock icon is about.
        .order('last_updated_at', { ascending: true, nullsFirst: true })
        .limit(MAX_HOME_CRITERIA);

    if (error) throw error;

    const criteria: HomeCriterion[] = [];
    for (const row of data ?? []) {
        const epic = Array.isArray(row.epic) ? row.epic[0] : row.epic;
        const criterion = Array.isArray(row.criterion) ? row.criterion[0] : row.criterion;
        if (!epic || !criterion) continue;
        criteria.push({
            label: criterion.label,
            epicId: epic.id,
            epicName: epic.name,
            lastUpdatedAt: row.last_updated_at ?? null,
        });
    }

    return { criteria, criteriaTotal: count ?? criteria.length };
}

async function resolveUserEmailFromSlackId(slackUserId: string): Promise<string | null> {
    try {
        const { createAdminClient } = await import('@/lib/supabase/server');
        const supabase = createAdminClient();
        const { data } = await supabase
            .from('app_user')
            .select('email')
            .eq('slack_handle', slackUserId)
            .maybeSingle();
        return data?.email ?? null;
    } catch {
        return null;
    }
}

/** Strip the bot @mention from the text so the agent sees a clean query */
function stripBotMention(text: string): string {
    return text.replace(/<@[A-Z0-9]+>/g, '').trim();
}

async function handleAppMention(event: any) {
    const slackUserId: string = event.user;
    const rawText: string = event.text || '';
    const channel: string = event.channel;
    const threadTs: string = event.thread_ts || event.ts;

    if (event.bot_id) return;

    const message = stripBotMention(rawText);
    if (!message) return;

    const slackClient = getSlackClient();

    if (!hasCleargoAgentKey()) {
        await slackClient.postMessage({
            channel,
            thread_ts: threadTs,
            text: 'The ClearGO AI assistant is not configured. Contact your admin to enable it.',
        });
        return;
    }

    try {
        await slackClient.addReaction(channel, event.ts, 'hourglass_flowing_sand');
    } catch {
        // Reactions are non-critical
    }

    const userEmail = await resolveUserEmailFromSlackId(slackUserId);
    await triggerAgentBackground({
        type: 'app_mention',
        message,
        channel,
        thread_ts: threadTs,
        userEmail: userEmail ?? undefined,
    });
}

async function handleDirectMessage(event: any) {
    const slackUserId: string = event.user;
    const channel: string = event.channel;
    const text: string = event.text || '';

    if (event.bot_id || event.subtype) return;
    if (!text.trim()) return;

    const slackClient = getSlackClient();

    if (!hasCleargoAgentKey()) {
        await slackClient.postMessage({
            channel,
            text: 'The ClearGO AI assistant is not configured. Contact your admin to enable it.',
        });
        return;
    }

    const userEmail = await resolveUserEmailFromSlackId(slackUserId);
    await triggerAgentBackground({
        type: 'direct_message',
        message: text.trim(),
        channel,
        userEmail: userEmail ?? undefined,
    });
}

async function handleLinkShared(event: any) {
    // TODO: Unfurl launch console URLs
    console.log('Link shared:', event.links);
}
