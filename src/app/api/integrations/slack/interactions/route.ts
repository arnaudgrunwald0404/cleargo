/**
 * Slack Interactions API endpoint
 * Handles button clicks, dropdown selections, and modal submissions
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest, extractSlackHeaders } from '@/lib/slack/verify';
import { getSlackClient } from '@/lib/slack/client';
import {
    FLAG_INTERVIEW_ACTION,
    FLAG_INTERVIEW_CALLBACK,
    MAX_QUESTIONS_PER_MODAL,
    buildFlagInterviewModal,
    parseFlagInterviewSubmission,
} from '@/lib/slack/templates/story-brief-interview';
import {
    loadOpenInterview,
    markFlagsAsked,
    recordFlagAnswers,
} from '@/lib/story-brief/interview';
import type { SlackInteractionPayload } from '@/types/slack';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';

export async function POST(request: NextRequest) {
    try {
        // Get raw body for signature verification
        const body = await request.text();
        const { timestamp, signature } = extractSlackHeaders(request);

        // Verify request is from Slack
        if (!timestamp || !signature) {
            return NextResponse.json({ error: 'Missing Slack headers' }, { status: 400 });
        }

        if (!verifySlackRequest(body, timestamp, signature, SLACK_SIGNING_SECRET)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        // Parse payload (Slack sends it as form-encoded)
        const formData = new URLSearchParams(body);
        const payloadStr = formData.get('payload');
        if (!payloadStr) {
            return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
        }

        const payload: SlackInteractionPayload = JSON.parse(payloadStr);

        // Route based on interaction type
        switch (payload.type) {
            case 'block_actions':
                return await handleBlockActions(payload);

            case 'view_submission':
                return await handleViewSubmission(payload);

            case 'view_closed':
                return await handleViewClosed(payload);

            default:
                console.log('Unhandled interaction type:', payload.type);
                return NextResponse.json({ ok: true });
        }
    } catch (error) {
        console.error('Slack interactions error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function handleBlockActions(payload: SlackInteractionPayload) {
    const actions = payload.actions || [];

    for (const action of actions) {
        switch (action.action_id) {
            case FLAG_INTERVIEW_ACTION:
                await openFlagInterview(payload, action.value);
                break;

            case 'update_criterion':
                // User clicked "Update Status" button
                // TODO: Open modal or redirect to launch detail
                console.log('Update criterion action:', action.value);
                break;

            case 'snooze_reminder':
                // User clicked "Snooze" button
                // TODO: Update notification schedule
                const data = JSON.parse(action.value || '{}');
                console.log('Snooze reminder:', data);
                break;

            default:
                console.log('Unhandled action:', action.action_id);
        }
    }

    return NextResponse.json({ ok: true });
}

/**
 * Open the gap-only interview for the brief named on the button.
 *
 * Slack expires a trigger_id in ~3 seconds, so this reads the flags and opens
 * the view with nothing else in between. Marking them asked happens after the
 * view is up: a failure to record that is not worth losing the modal over.
 */
async function openFlagInterview(payload: SlackInteractionPayload, value?: string) {
    let briefId: string | null = null;
    try {
        briefId = JSON.parse(value || '{}').briefId ?? null;
    } catch {
        briefId = null;
    }
    if (!briefId) {
        console.error('story brief interview: button carried no briefId');
        return;
    }

    const interview = await loadOpenInterview(briefId);
    if (!interview) return;

    const client = getSlackClient();

    // Nothing left to ask. Say so rather than opening an empty modal — a PM who
    // clicks a stale button should learn the queue is clear.
    if (interview.flags.length === 0) {
        await client.openView(payload.trigger_id, {
            type: 'modal',
            title: { type: 'plain_text', text: 'Nothing to answer' },
            close: { type: 'plain_text', text: 'Close' },
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `Every open question on *${interview.target.epicName}* has been answered.`,
                    },
                },
            ],
        });
        return;
    }

    await client.openView(
        payload.trigger_id,
        buildFlagInterviewModal(interview.target, interview.flags)
    );

    await markFlagsAsked(
        interview.flags.slice(0, MAX_QUESTIONS_PER_MODAL).map((f) => f.id)
    );
}

async function handleViewSubmission(payload: SlackInteractionPayload) {
    const callbackId = payload.view?.callback_id;

    if (callbackId === FLAG_INTERVIEW_CALLBACK) {
        const parsed = parseFlagInterviewSubmission(payload.view);
        if (!parsed.briefId) {
            console.error('story brief interview: submission carried no briefId');
            return NextResponse.json({ ok: true });
        }

        const answeredBy = payload.user?.id || 'slack';
        const { saved, remaining } = await recordFlagAnswers(
            parsed.briefId,
            parsed.answers,
            answeredBy
        );
        console.log(
            `story brief interview: saved ${saved} answer(s), ${remaining} still open`,
            parsed.briefId
        );
        // Empty 200 closes the modal. Slack shows an error banner if we send
        // anything it does not recognise, so keep the body minimal.
        return NextResponse.json({});
    }

    console.log('Unhandled view submission:', callbackId);
    return NextResponse.json({ ok: true });
}

async function handleViewClosed(payload: SlackInteractionPayload) {
    // Flags stay `asked`, not reverted to `open`: the question was put to the
    // person, they chose to come back to it, and the button still works.
    console.log('View closed:', payload.view?.callback_id);
    return NextResponse.json({ ok: true });
}
