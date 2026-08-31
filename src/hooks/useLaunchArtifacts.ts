'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import type { ArtifactStatus, ArtifactType, LaunchArtifact } from '@/types/artifacts';

export interface LaunchArtifactsResponse {
    artifacts: LaunchArtifact[];
    /** artifact id -> count of flags still waiting on a human. */
    openQuestions: Record<string, number>;
}

export const launchArtifactsKey = (launchId: string) => ['launch-artifacts', launchId];

/**
 * The launch's artifact rows.
 *
 * Every write goes through the API route rather than Supabase directly: the
 * capability checks (launchArtifact.draft/review/approve) live server-side, and
 * approving also has to flip the linked criterion row, which the client has no
 * business doing. Same reasoning as useStoryBrief.
 *
 * `refetchMs` drives the drafting poll — the artifact row is its own job record,
 * so "is the draft done" is just "has status left DRAFTING".
 */
export function useLaunchArtifacts(launchId: string | null | undefined, refetchMs = 0) {
    return useQuery({
        queryKey: launchArtifactsKey(launchId || ''),
        queryFn: async (): Promise<LaunchArtifactsResponse> => {
            const res = await fetchWithRateLimit(`/api/launches/${launchId}/artifacts`, {
                maxRetries: 1,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to load artifacts');
            }
            return res.json();
        },
        enabled: Boolean(launchId),
        staleTime: 15 * 1000,
        // Drafting completes out of band in a background function, so the cache
        // is stale the moment the panel is out of view and nothing tells us it
        // changed. Re-read whenever the panel comes back -- remount (tab switch,
        // navigating back) and window focus -- rather than making people
        // refresh to find out a draft finished. Cached data still renders
        // immediately, so neither causes a loading flash.
        refetchOnMount: 'always',
        refetchOnWindowFocus: true,
        refetchInterval: refetchMs > 0 ? refetchMs : false,
    });
}

export interface EnsureArtifactsResponse {
    created: number;
    docsCreated: number;
    skipped: number;
    googleConfigured: boolean;
    errors: string[];
}

/**
 * Create any missing artifact rows and Google Docs.
 *
 * Idempotent by design: ensureLaunchArtifacts skips every artifact that already
 * has a doc_id, so this is safe to press repeatedly and only fills the gaps. It
 * deliberately will NOT recreate a document that exists — duplicating a Doc
 * someone is editing is unrecoverable.
 *
 * A 207 is success-with-warnings (the usual shape before Google is configured),
 * NOT a failure.
 */
export function useEnsureLaunchArtifacts(launchId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (): Promise<EnsureArtifactsResponse> => {
            const res = await fetch(`/api/launches/${launchId}/artifacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'ensure' }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok && res.status !== 207) {
                throw new Error(data.error || 'Failed to create documents');
            }
            return data as EnsureArtifactsResponse;
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: launchArtifactsKey(launchId) });
        },
    });
}

export interface DraftArtifactArgs {
    artifactType: ArtifactType;
    sourceNotes?: string;
}

/**
 * Start a draft.
 *
 * On Netlify this returns 202 and the real work happens in a background
 * function, because a synchronous function is capped at 26s and drafting takes
 * minutes. Locally it runs inline and returns 200/207 with the finished draft.
 * Callers must handle both: `accepted` true means "poll for it".
 */
export function useDraftLaunchArtifact(launchId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ artifactType, sourceNotes }: DraftArtifactArgs) => {
            const res = await fetch(`/api/launches/${launchId}/artifacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'draft',
                    artifact_type: artifactType,
                    source_notes: sourceNotes || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok && res.status !== 207) {
                throw new Error(data.error || 'Failed to start the draft');
            }
            return { accepted: res.status === 202, ...data } as {
                accepted: boolean;
                warnings?: string[];
            };
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: launchArtifactsKey(launchId) });
        },
    });
}

export interface ReviewArtifactArgs {
    artifactType: ArtifactType;
    status: Extract<ArtifactStatus, 'PENDING_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED'>;
    changeRequestNote?: string;
}

/**
 * Move an artifact through review.
 *
 * Approving is not cosmetic: the server flips the linked launch_criterion_status
 * row to DONE, which moves readiness, the gate chain and the workback timeline.
 * Callers should refresh the launch itself afterwards, not just this query.
 */
export function useReviewLaunchArtifact(launchId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async ({ artifactType, status, changeRequestNote }: ReviewArtifactArgs) => {
            const res = await fetch(`/api/launches/${launchId}/artifacts`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    artifact_type: artifactType,
                    status,
                    change_request_note: changeRequestNote || undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Failed to update the artifact');
            return data as { artifact: LaunchArtifact; label: string; status: ArtifactStatus };
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: launchArtifactsKey(launchId) });
        },
    });
}
