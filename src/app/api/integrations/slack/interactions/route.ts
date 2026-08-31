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
import {
    ARTIFACT_APPROVE_ACTION,
    ARTIFACT_CHANGES_ACTION,
    ARTIFACT_ANSWER_ACTION,
    ARTIFACT_CHANGES_CALLBACK,
    ARTIFACT_ANSWER_CALLBACK,
    MAX_QUESTIONS_PER_MODAL as ARTIFACT_MAX_QUESTIONS,
    buildArtifactInterviewModal,
    buildChangeRequestModal,
    parseArtifactSubmission,
    type ArtifactReviewTarget,
} from '@/lib/slack/templates/artifact-review';
import {
    loadArtifactFlags,
    markArtifactFlagsAsked,
    recordArtifactFlagAnswers,
} from '@/lib/artifacts/flags';
import { approveArtifact, requestArtifactChanges } from '@/lib/artifacts/reviewService';
import { resolveActorFromSlack } from '@/lib/artifacts/slackActor';
import { ARTIFACT_LABEL } from '@/types/artifacts';
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

/**
 * Run one button's handler without letting it fail the whole response.
 *
 * Slack renders ANY non-2xx from this endpoint as "This app returned an error.
 * Please try again, or contact the app's developer." — which tells the person
 * clicking nothing and the person debugging less. A throw out of a handler used
 * to reach the route's catch and become exactly that. Now the reason is said out
 * loud in the channel and Slack still gets its 200.
 *
 * handleArtifactApproval already reports its own failures this way; this gives
 * the modal openers the same treatment.
 */
async function runAction(
    payload: SlackInteractionPayload,
    actionId: string,
    run: () => Promise<void>
): Promise<void> {
    try {
        await run();
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`slack action ${actionId} failed:`, message);
        await respondInChannel(payload, `:x: That did not work: ${message}`);
    }
}

async function handleBlockActions(payload: SlackInteractionPayload) {
    const actions = payload.actions || [];

    for (const action of actions) {
        switch (action.action_id) {
            case FLAG_INTERVIEW_ACTION:
                await runAction(payload, action.action_id, () =>
                    openFlagInterview(payload, action.value)
                );
                break;

            case ARTIFACT_APPROVE_ACTION:
                await handleArtifactApproval(payload, action.value);
                break;

            case ARTIFACT_CHANGES_ACTION:
                await runAction(payload, action.action_id, () =>
                    openChangeRequest(payload, action.value)
                );
                break;

            case ARTIFACT_ANSWER_ACTION:
                await runAction(payload, action.action_id, () =>
                    openArtifactInterview(payload, action.value)
                );
                break;

            // A url button does not dispatch, but Slack still posts the action.
            case 'launch_artifact_open_doc':
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

/** Read the artifact identifiers a button carries. */
function parseArtifactButton(value?: string): ArtifactReviewTarget | null {
    try {
        const parsed = JSON.parse(value || '{}');
        if (!parsed.artifactId) return null;
        return {
            artifactId: parsed.artifactId,
            launchId: parsed.launchId,
            launchName: parsed.launchName ?? 'Launch',
            artifactType: parsed.artifactType,
        };
    } catch {
        return null;
    }
}

/**
 * Approve from Slack.
 *
 * The button carries a confirm dialog, so by the time this runs the reviewer
 * has said yes twice. Replaces the original message rather than adding to it —
 * a decided artifact should not keep offering Approve.
 */
async function handleArtifactApproval(payload: SlackInteractionPayload, value?: string) {
    const target = parseArtifactButton(value);
    if (!target) {
        console.error('artifact approve: button carried no artifactId');
        return;
    }

    const actor = await resolveActorFromSlack(payload.user?.id);
    if (!actor.allowedToApprove) {
        await respondInChannel(
            payload,
            actor.email
                ? `:lock: ${actor.email} does not have permission to approve launch documents.`
                : ':lock: I could not match your Slack account to a ClearGO user.'
        );
        return;
    }

    try {
        const result = await approveArtifact(target.artifactId, {
            email: actor.email!,
            name: actor.name,
        });
        const label = ARTIFACT_LABEL[result.artifact.artifact_type];

        const lines = [`:white_check_mark: *${label}* approved — now v1.0.`];
        if (result.criterionMarkedDone) lines.push('Its readiness criterion is marked done.');
        if (result.signoffRecorded) lines.push('Your sign-off is recorded on the gate.');
        if (result.unblocked) lines.push(`Next up: *${ARTIFACT_LABEL[result.unblocked]}*.`);
        for (const w of result.warnings) lines.push(`:warning: ${w}`);

        await replaceMessage(payload, lines.join('\n'));
    } catch (err) {
        console.error('artifact approve failed', err);
        await respondInChannel(
            payload,
            `:x: Could not approve: ${err instanceof Error ? err.message : 'unknown error'}`
        );
    }
}

/** Open the change-request modal. Nothing between reading and views.open. */
async function openChangeRequest(payload: SlackInteractionPayload, value?: string) {
    const target = parseArtifactButton(value);
    if (!target) return;
    await getSlackClient().openView(payload.trigger_id, buildChangeRequestModal(target));
}

/**
 * Open the interview for an artifact's ungrounded claims.
 *
 * One query, deliberately: `trigger_id` is valid for roughly three seconds and
 * views.open has to land inside that. The button already carries the artifact
 * type and the launch name, so joining to re-read them would be a round trip
 * spent fetching what we were handed.
 */
async function openArtifactInterview(payload: SlackInteractionPayload, value?: string) {
    const target = parseArtifactButton(value);
    if (!target) return;

    const flags = await loadArtifactFlags(target.artifactId);
    const client = getSlackClient();

    if (flags.length === 0) {
        await client.openView(payload.trigger_id, {
            type: 'modal',
            title: { type: 'plain_text', text: 'Nothing to answer' },
            close: { type: 'plain_text', text: 'Close' },
            blocks: [
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: 'Every open question on this document has been answered.' },
                },
            ],
        });
        return;
    }

    await client.openView(payload.trigger_id, buildArtifactInterviewModal(target, flags));

    // After the view is up: losing this is not worth losing the modal over.
    await markArtifactFlagsAsked(flags.slice(0, ARTIFACT_MAX_QUESTIONS).map((f) => f.id));
}

/** Replace the review message once a decision is made. */
async function replaceMessage(payload: SlackInteractionPayload, text: string) {
    const channel = payload.channel?.id;
    const ts = payload.message?.ts;
    if (!channel || !ts) return;
    try {
        await getSlackClient().updateMessage(channel, ts, { text, blocks: [] });
    } catch (err) {
        console.error('could not update review message', err);
    }
}

/** Say something back when the action could not proceed. */
async function respondInChannel(payload: SlackInteractionPayload, text: string) {
    const channel = payload.channel?.id;
    if (!channel) return;
    try {
        await getSlackClient().postMessage({ channel, text });
    } catch (err) {
        console.error('could not respond in channel', err);
    }
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

    if (callbackId === ARTIFACT_CHANGES_CALLBACK) {
        const parsed = parseArtifactSubmission(payload.view);
        if (!parsed.artifactId || !parsed.reason) {
            // Slack renders this under the input rather than closing the modal.
            return NextResponse.json({
                response_action: 'errors',
                errors: { change_request: 'Say what needs to change — the next draft is written from this.' },
            });
        }

        const actor = await resolveActorFromSlack(payload.user?.id);
        try {
            await requestArtifactChanges(parsed.artifactId, parsed.reason, actor.email ?? 'slack');
        } catch (err) {
            return NextResponse.json({
                response_action: 'errors',
                errors: {
                    change_request: err instanceof Error ? err.message : 'Could not record the change request.',
                },
            });
        }
        return NextResponse.json({});
    }

    if (callbackId === ARTIFACT_ANSWER_CALLBACK) {
        const parsed = parseArtifactSubmission(payload.view);
        if (!parsed.artifactId) {
            console.error('artifact interview: submission carried no artifactId');
            return NextResponse.json({ ok: true });
        }
        const { saved, remaining } = await recordArtifactFlagAnswers(
            parsed.artifactId,
            parsed.answers,
            payload.user?.id || 'slack'
        );
        console.log(`artifact interview: saved ${saved}, ${remaining} still open`, parsed.artifactId);
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
