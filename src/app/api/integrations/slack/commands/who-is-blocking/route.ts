/**
 * Slack slash command: /who-is-blocking
 * Ranks people by unreviewed (NOT_SET) criteria on active launches, weighted
 * by tier, gate status, and proximity to target launch date.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import { createAdminClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://launch-console.clearcompany.com';

const TIER_WEIGHT: Record<string, number> = { TIER_1: 10, TIER_2: 5, TIER_3: 2 };

export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        const { timestamp, signature } = extractSlackHeaders(request);

        if (!timestamp || !signature) {
            return NextResponse.json({ error: 'Missing Slack headers' }, { status: 400 });
        }
        if (!verifySlackRequest(body, timestamp, signature, SLACK_SIGNING_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const formData = new URLSearchParams(body);
        const tierArg = (formData.get('text') || '').trim().toUpperCase();
        const validTiers = ['TIER_1', 'TIER_2', 'TIER_3'];
        const tierFilter = validTiers.includes(tierArg) ? tierArg : null;

        const supabase = createAdminClient();

        const { data: rows, error } = await supabase
            .from('epic_criterion_status')
            .select(`
                id,
                decision_owner_id,
                epic:epic_id (id, name, tier, target_launch_date, status, archived),
                criterion:criterion_id (label, gate),
                decision_owner:app_user!epic_criterion_status_decision_owner_id_fkey (
                    id, first_name, last_name, email
                )
            `)
            .eq('status', 'NOT_SET')
            .not('decision_owner_id', 'is', null);

        if (error) {
            console.error('who-is-blocking query error:', error);
            return NextResponse.json({ response_type: 'ephemeral', text: 'Error querying data. Please try again.' });
        }

        const now = Date.now();

        type PersonEntry = {
            name: string;
            email: string;
            score: number;
            criteria: Array<{ epic: string; tier: string; label: string; isGate: boolean; daysUntilLaunch: number | null }>;
        };

        const personMap: Record<string, PersonEntry> = {};

        for (const r of rows || []) {
            const owner = r.decision_owner as any;
            const epic = r.epic as any;
            const criterion = r.criterion as any;

            if (!owner || !epic || epic.archived || epic.status === 'Cancelled') continue;
            if (tierFilter && epic.tier !== tierFilter) continue;

            const personKey: string = owner.id;
            if (!personMap[personKey]) {
                const name = [owner.first_name, owner.last_name].filter(Boolean).join(' ') || owner.email;
                personMap[personKey] = { name, email: owner.email, score: 0, criteria: [] };
            }

            const weight = TIER_WEIGHT[epic.tier] ?? 1;
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
            .slice(0, 10);

        const totalCriteria = Object.values(personMap).reduce((sum, p) => sum + p.criteria.length, 0);
        const totalPeople = ranked.length;

        if (totalPeople === 0) {
            return NextResponse.json({
                response_type: 'in_channel',
                text: '✅ No unreviewed criteria with assigned owners. Everyone is caught up!',
            });
        }

        const headerText = tierFilter
            ? `🚨 Who is blocking ${tierFilter} launches?`
            : '🚨 Who is blocking launches?';

        const blocks: any[] = [
            {
                type: 'header',
                text: { type: 'plain_text', text: headerText, emoji: true },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${totalCriteria} unreviewed criteria* across *${totalPeople} people*${tierFilter ? ` (${tierFilter} only)` : ''}. Ranked by impact on launch timelines:`,
                },
            },
            { type: 'divider' },
        ];

        const medals = ['🥇', '🥈', '🥉'];

        for (let i = 0; i < ranked.length; i++) {
            const p = ranked[i];
            const medal = medals[i] ?? `${i + 1}.`;

            // Sort their criteria by urgency
            const sortedCriteria = [...p.criteria].sort((a, b) => {
                if (a.daysUntilLaunch === null) return 1;
                if (b.daysUntilLaunch === null) return -1;
                return a.daysUntilLaunch - b.daysUntilLaunch;
            });

            const topCriteria = sortedCriteria.slice(0, 2);
            const criteriaLines = topCriteria.map((c) => {
                const gateTag = c.isGate ? ' *(GATE)*' : '';
                const urgency = c.daysUntilLaunch === null
                    ? ''
                    : c.daysUntilLaunch < 0
                        ? ` — ⚠️ overdue by ${Math.abs(c.daysUntilLaunch)}d`
                        : ` — due in ${c.daysUntilLaunch}d`;
                return `  • _${c.label}_${gateTag} on *${c.epic}*${urgency}`;
            }).join('\n');

            const moreCount = p.criteria.length - topCriteria.length;
            const moreText = moreCount > 0 ? `\n  _…and ${moreCount} more_` : '';

            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${medal} *${p.name}* — *${p.criteria.length}* unreviewed (impact score: ${Math.round(p.score)})\n${criteriaLines}${moreText}`,
                },
                accessory: {
                    type: 'button',
                    text: { type: 'plain_text', text: 'View in app', emoji: true },
                    url: `${APP_URL}/?viewAsEmail=${encodeURIComponent(p.email)}`,
                },
            });
        }

        blocks.push({ type: 'divider' });
        blocks.push({
            type: 'context',
            elements: [{
                type: 'mrkdwn',
                text: `Impact score = tier weight × gate multiplier × urgency. Try \`/who-is-blocking TIER_1\` to filter by tier.`,
            }],
        });

        return NextResponse.json({
            response_type: 'in_channel',
            blocks,
        });
    } catch (err) {
        console.error('who-is-blocking error:', err);
        return NextResponse.json({
            response_type: 'ephemeral',
            text: 'Sorry, something went wrong. Please try again.',
        });
    }
}
