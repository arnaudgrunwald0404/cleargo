/**
 * Turning a StartDraftResult into something a model can act on.
 *
 * The important case is `accepted`. Drafting runs in a background function, so
 * the tool returns in about a second with the work still in flight — and a model
 * that reads "success" will happily go on to read the artifact and find the old
 * content. The response therefore says, in words, that the draft is running and
 * that get-artifact is how to find out when it is done.
 */
import type { StartDraftResult } from '@/lib/artifacts/startDraft';
import type { ArtifactType } from '@/types/artifacts';

export function describeDraftResult(
    result: StartDraftResult,
    artifactType: ArtifactType,
    label = 'Draft'
): Record<string, unknown> {
    switch (result.outcome) {
        case 'accepted':
            return {
                status: 'DRAFTING',
                started: true,
                message:
                    `${label} started for ${artifactType}. It runs in the background and usually ` +
                    `takes one to three minutes.`,
                next_step:
                    `Call get-artifact for this launch and artifact type to check progress. Status ` +
                    `stays DRAFTING until it finishes, then becomes PENDING_REVIEW. Do not report ` +
                    `the content as updated until you have seen that change.`,
            };

        case 'completed':
            return {
                status: result.draft.status ?? 'PENDING_REVIEW',
                started: true,
                completed: true,
                message: `${label} completed for ${artifactType}.`,
                warnings: result.draft.warnings,
                draft: result.draft,
            };

        case 'not_found':
            return {
                error: `No ${artifactType} exists on this launch yet.`,
                next_step: 'Call ensure-artifacts first to create the rows and documents.',
            };

        case 'already_running':
            return {
                error: `A draft is already running for ${artifactType}.`,
                next_step: 'Call get-artifact to watch for it to leave DRAFTING.',
            };

        case 'dispatch_failed':
            return {
                error: `Could not start the ${label.toLowerCase()} for ${artifactType}.`,
                next_step: 'Nothing is running and the artifact is unchanged. Try again.',
            };
    }
}
