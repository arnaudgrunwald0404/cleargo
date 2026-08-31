'use client';

/**
 * The five launch artifacts, as documents rather than checklist rows.
 *
 * This is the first UI for a pipeline that was previously headless: the doc
 * factory, the drafting agent and the review cycle all existed and were only
 * reachable from Slack and the MCP server, so a launch could be created and
 * nothing visibly happened. This panel is a client for the existing
 * /api/launches/[id]/artifacts route — it adds no server behaviour.
 *
 * It deliberately replaces the old "Launch Artifacts" table on the Assets tab,
 * which showed the same five artifacts derived from launch_criterion_status and
 * therefore could never say whether a document existed.
 */

import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Group,
    Loader,
    Modal,
    Paper,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
    IconAlertTriangle,
    IconCheck,
    IconExternalLink,
    IconFilePlus,
    IconMessageCircle,
    IconRobot,
    IconX,
} from '@tabler/icons-react';
import { fetchWithRateLimit } from '@/lib/fetch-with-rate-limit';
import { canRolesPerform } from '@/lib/permissions';
import { UserDisplay } from '@/components/UserDisplay';
import {
    useLaunchArtifacts,
    useEnsureLaunchArtifacts,
    useDraftLaunchArtifact,
    useReviewLaunchArtifact,
} from '@/hooks/useLaunchArtifacts';
import {
    ARTIFACT_LABEL,
    ARTIFACT_STATUS_LABEL,
    isDraftStalled,
    type ArtifactStatus,
    type ArtifactType,
    type LaunchArtifact,
} from '@/types/artifacts';

/** How often to re-read while a draft runs in the background function. */
const DRAFT_POLL_MS = 5000;

const STATUS_COLOR: Record<ArtifactStatus, string> = {
    NOT_STARTED: 'gray',
    DRAFTING: 'blue',
    PENDING_REVIEW: 'yellow',
    CHANGES_REQUESTED: 'orange',
    APPROVED: 'teal',
};

interface Props {
    launchId: string;
    /** Approving flips the linked criterion to DONE, so the page must refresh. */
    onArtifactApproved?: () => void;
}

export function LaunchArtifactsPanel({ launchId, onArtifactApproved }: Props) {
    const [roles, setRoles] = useState<string[]>([]);
    const [sourceNotes, setSourceNotes] = useState<Record<string, string>>({});
    const [changeTarget, setChangeTarget] = useState<LaunchArtifact | null>(null);
    const [changeNote, setChangeNote] = useState('');
    const [busy, setBusy] = useState<ArtifactType | null>(null);

    useEffect(() => {
        fetchWithRateLimit('/api/me', { maxRetries: 1 })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setRoles((data?.user?.roles || []) as string[]))
            .catch(() => setRoles([]));
    }, []);

    const canDraft = canRolesPerform(roles, 'launchArtifact.draft');
    const canReview = canRolesPerform(roles, 'launchArtifact.review');
    const canApprove = canRolesPerform(roles, 'launchArtifact.approve');

    // A draft runs in a Netlify background function and reports nothing back, so
    // the row's own status is the progress signal — draftArtifact sets DRAFTING
    // on entry and PENDING_REVIEW on exit. Poll only while one is actually
    // running; an idle panel should not be hitting the API every few seconds.
    const [pollMs, setPollMs] = useState(0);
    const { data, isLoading, error, refetch } = useLaunchArtifacts(launchId, pollMs);

    const artifacts = useMemo(() => data?.artifacts ?? [], [data]);
    const openQuestions = data?.openQuestions ?? {};

    // A row whose worker died stays DRAFTING forever. Polling it is pointless
    // and disabling its button on that basis would kill the artifact, so it is
    // treated as idle here and the server agrees (isDraftStalled in the route).
    const anyDrafting = useMemo(
        () => artifacts.some((a) => a.status === 'DRAFTING' && !isDraftStalled(a)),
        [artifacts]
    );

    useEffect(() => {
        setPollMs(anyDrafting ? DRAFT_POLL_MS : 0);
    }, [anyDrafting]);

    const ensure = useEnsureLaunchArtifacts(launchId);
    const draft = useDraftLaunchArtifact(launchId);
    const review = useReviewLaunchArtifact(launchId);

    const approvedCount = useMemo(
        () => artifacts.filter((a) => a.status === 'APPROVED').length,
        [artifacts]
    );
    const missingDocs = useMemo(() => artifacts.filter((a) => !a.doc_id).length, [artifacts]);

    const handleEnsure = async () => {
        try {
            const result = await ensure.mutateAsync();
            if (!result.googleConfigured) {
                notifications.show({
                    title: 'Google is not connected',
                    message:
                        'Rows were created but no documents. Connect Google in Admin > Settings > Integrations.',
                    color: 'orange',
                });
            } else if (result.docsCreated > 0) {
                notifications.show({
                    message: `${result.docsCreated} document${result.docsCreated === 1 ? '' : 's'} created`,
                    color: 'teal',
                    autoClose: 2000,
                });
            } else {
                notifications.show({
                    message: 'Nothing missing — every document already exists.',
                    color: 'gray',
                    autoClose: 2000,
                });
            }
            if (result.errors.length > 0) {
                notifications.show({
                    title: 'Some documents were not created',
                    message: result.errors.join('; '),
                    color: 'orange',
                });
            }
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: err instanceof Error ? err.message : 'Failed to create documents',
                color: 'red',
            });
        }
    };

    const handleDraft = async (a: LaunchArtifact) => {
        setBusy(a.artifact_type);
        try {
            const result = await draft.mutateAsync({
                artifactType: a.artifact_type,
                sourceNotes: sourceNotes[a.artifact_type],
            });
            setSourceNotes((prev) => ({ ...prev, [a.artifact_type]: '' }));
            notifications.show({
                title: result.accepted ? 'Drafting started' : 'Draft ready',
                message: result.accepted
                    ? 'This takes a few minutes. The status updates on its own.'
                    : 'Review it in the document.',
                color: result.accepted ? 'blue' : 'teal',
            });
            if (result.warnings?.length) {
                notifications.show({
                    title: 'Drafted with warnings',
                    message: result.warnings.join('; '),
                    color: 'orange',
                });
            }
            // Awaited, not fired and forgotten: `busy` clears in the finally
            // below, and the button must not become clickable again before the
            // fetched row says DRAFTING. The server claims the row before it
            // returns 202, so this read is guaranteed to see it.
            await refetch();
        } catch (err) {
            notifications.show({
                title: 'Draft failed',
                message: err instanceof Error ? err.message : 'Failed to start the draft',
                color: 'red',
                // The server's message is the diagnosis (a model error, a Drive
                // failure, a missing upstream). Long enough to need reading, so
                // it does not disappear on a timer.
                autoClose: false,
            });
        } finally {
            setBusy(null);
        }
    };

    const handleReview = async (
        a: LaunchArtifact,
        status: 'APPROVED' | 'CHANGES_REQUESTED',
        note?: string
    ) => {
        setBusy(a.artifact_type);
        try {
            await review.mutateAsync({
                artifactType: a.artifact_type,
                status,
                changeRequestNote: note,
            });
            notifications.show({
                message: status === 'APPROVED' ? 'Approved' : 'Sent back for changes',
                color: 'teal',
                autoClose: 2000,
            });
            // Approving marks the runway criterion DONE, which readiness, the
            // gate chain and the workback timeline all read.
            if (status === 'APPROVED') onArtifactApproved?.();
        } catch (err) {
            notifications.show({
                title: 'Error',
                message: err instanceof Error ? err.message : 'Failed to update the artifact',
                color: 'red',
            });
        } finally {
            setBusy(null);
        }
    };

    if (isLoading) {
        return (
            <Group justify="center" p="xl">
                <Loader size="sm" />
            </Group>
        );
    }

    if (error) {
        return (
            <Text size="sm" c="red">
                {error instanceof Error ? error.message : 'Failed to load artifacts'}
            </Text>
        );
    }

    return (
        <>
            <Group justify="space-between" align="center" mb="md">
                <Text fw={600} size="sm" c="dimmed">
                    {approvedCount}/{artifacts.length} approved
                </Text>
                {canDraft && (
                    <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconFilePlus size={14} />}
                        loading={ensure.isPending}
                        onClick={handleEnsure}
                    >
                        {artifacts.length === 0 ? 'Create documents' : 'Create missing documents'}
                    </Button>
                )}
            </Group>

            {artifacts.length === 0 ? (
                <Text size="sm" c="dimmed">
                    No artifacts yet. They are created with the launch once a tier is set — use
                    Create documents to build them now.
                </Text>
            ) : (
                <Stack gap="sm">
                    {missingDocs > 0 && (
                        <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />}>
                            <Text size="sm">
                                {missingDocs} of {artifacts.length} have no Google Doc. Drafts are
                                still stored in ClearGO and fill the document once Google is
                                connected and the documents are created.
                            </Text>
                        </Alert>
                    )}

                    {artifacts.map((a) => {
                        const questions = openQuestions[a.id] ?? 0;
                        const stalled = isDraftStalled(a);
                        const drafting = a.status === 'DRAFTING' && !stalled;
                        const rowBusy = busy === a.artifact_type || drafting;
                        return (
                            <Paper key={a.id} withBorder p="md" radius="md">
                                <Group justify="space-between" align="flex-start" wrap="nowrap">
                                    <Stack gap={4} style={{ minWidth: 0 }}>
                                        <Group gap="xs">
                                            <Text size="sm" fw={500}>
                                                {ARTIFACT_LABEL[a.artifact_type]}
                                            </Text>
                                            <Badge
                                                size="sm"
                                                color={stalled ? 'red' : STATUS_COLOR[a.status]}
                                                variant="light"
                                            >
                                                {stalled
                                                    ? 'Drafting stalled'
                                                    : ARTIFACT_STATUS_LABEL[a.status]}
                                            </Badge>
                                            <Text size="xs" c="dimmed">
                                                {a.version}
                                            </Text>
                                            {questions > 0 && (
                                                <Tooltip label="Open questions the agent could not ground. Answer them in Slack.">
                                                    <Badge
                                                        size="sm"
                                                        color="yellow"
                                                        variant="outline"
                                                        leftSection={<IconMessageCircle size={11} />}
                                                    >
                                                        {questions}
                                                    </Badge>
                                                </Tooltip>
                                            )}
                                        </Group>
                                        {a.owner_email ? (
                                            <UserDisplay email={a.owner_email} size="xs" />
                                        ) : (
                                            <Text size="xs" c="dimmed">
                                                Unassigned
                                            </Text>
                                        )}
                                        {a.change_request_note && (
                                            <Text size="xs" c="orange.7">
                                                {a.change_request_note}
                                            </Text>
                                        )}
                                    </Stack>

                                    <Group gap="xs" wrap="nowrap">
                                        {a.doc_url ? (
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                component="a"
                                                href={a.doc_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                leftSection={<IconExternalLink size={13} />}
                                            >
                                                Open
                                            </Button>
                                        ) : (
                                            <Text size="xs" c="dimmed">
                                                No doc
                                            </Text>
                                        )}
                                        {canDraft && (
                                            <Button
                                                size="xs"
                                                variant="light"
                                                leftSection={<IconRobot size={13} />}
                                                loading={rowBusy}
                                                onClick={() => handleDraft(a)}
                                            >
                                                {a.status === 'NOT_STARTED' ? 'Draft' : 'Redraft'}
                                            </Button>
                                        )}
                                        {canReview && a.status === 'PENDING_REVIEW' && (
                                            <Button
                                                size="xs"
                                                variant="subtle"
                                                color="orange"
                                                leftSection={<IconX size={13} />}
                                                disabled={rowBusy}
                                                onClick={() => {
                                                    setChangeTarget(a);
                                                    setChangeNote('');
                                                }}
                                            >
                                                Changes
                                            </Button>
                                        )}
                                        {canApprove && a.status === 'PENDING_REVIEW' && (
                                            <Button
                                                size="xs"
                                                color="teal"
                                                leftSection={<IconCheck size={13} />}
                                                loading={rowBusy}
                                                onClick={() => handleReview(a, 'APPROVED')}
                                            >
                                                Approve
                                            </Button>
                                        )}
                                    </Group>
                                </Group>

                                {canDraft && a.status !== 'APPROVED' && (
                                    <Textarea
                                        mt="sm"
                                        size="xs"
                                        autosize
                                        minRows={1}
                                        maxRows={4}
                                        placeholder="Optional notes for the next draft — call notes, decisions, anything Aha and Jira cannot tell it."
                                        value={sourceNotes[a.artifact_type] ?? ''}
                                        onChange={(e) =>
                                            setSourceNotes((prev) => ({
                                                ...prev,
                                                [a.artifact_type]: e.currentTarget.value,
                                            }))
                                        }
                                        disabled={rowBusy}
                                    />
                                )}
                            </Paper>
                        );
                    })}
                </Stack>
            )}

            <Modal
                opened={changeTarget !== null}
                onClose={() => setChangeTarget(null)}
                title={
                    changeTarget
                        ? `Request changes — ${ARTIFACT_LABEL[changeTarget.artifact_type]}`
                        : ''
                }
                size="md"
            >
                <Stack gap="md">
                    <Textarea
                        label="What needs to change?"
                        description="The next draft is written to address this, so be specific."
                        autosize
                        minRows={3}
                        value={changeNote}
                        onChange={(e) => setChangeNote(e.currentTarget.value)}
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setChangeTarget(null)}>
                            Cancel
                        </Button>
                        <Button
                            color="orange"
                            disabled={!changeNote.trim()}
                            loading={review.isPending}
                            onClick={async () => {
                                const target = changeTarget;
                                if (!target) return;
                                setChangeTarget(null);
                                await handleReview(target, 'CHANGES_REQUESTED', changeNote.trim());
                            }}
                        >
                            Send back
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
