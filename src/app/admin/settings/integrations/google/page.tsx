"use client";

/**
 * Admin > Settings > Integrations > Google.
 *
 * The connection is ClearGO's, not a person's — stored globally, so whoever
 * holds settings.update can reconnect it. That is the whole point of the page:
 * when the person who authorised it leaves, someone else clicks Connect and
 * nothing else has to change.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Badge, Button, Card, Group, Loader, Stack, Text, Title } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconExternalLink, IconPlugConnected, IconX } from "@tabler/icons-react";

interface TemplateStatus {
    type: string;
    label: string;
    configured: boolean;
}

interface GoogleStatus {
    oauthConfigured: boolean;
    connected: boolean;
    connectedEmail: string | null;
    connectedAt: string | null;
    connectedBy: string | null;
    accessTokenExpired: boolean;
    serviceAccountFallback: boolean;
    launchFolderConfigured: boolean;
    templates: TemplateStatus[];
}

export default function GoogleIntegrationPage() {
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<GoogleStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [disconnecting, setDisconnecting] = useState(false);

    const connectedParam = searchParams.get("connected");
    const errorParam = searchParams.get("error");

    const load = useCallback(async () => {
        try {
            const res = await fetch("/api/integrations/google/status", { credentials: "include" });
            if (res.ok) setStatus(await res.json());
        } catch {
            // Leave status null; the page renders an explicit "could not load".
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const disconnect = async () => {
        if (!confirm("Disconnect Google? ClearGO will stop creating and updating launch documents until it is reconnected.")) {
            return;
        }
        setDisconnecting(true);
        try {
            await fetch("/api/integrations/google/status", { method: "DELETE", credentials: "include" });
            await load();
        } finally {
            setDisconnecting(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8">
                <Group gap="sm"><Loader size="sm" /><Text>Loading Google integration…</Text></Group>
            </div>
        );
    }

    const missingTemplates = (status?.templates ?? []).filter((t) => !t.configured);

    return (
        <div className="p-8" style={{ maxWidth: 820 }}>
            <Title order={2} mb="xs" style={{ fontFamily: "var(--font-heading)" }}>
                Google Drive &amp; Docs
            </Title>
            <Text c="dimmed" size="sm" mb="lg">
                ClearGO creates each launch&apos;s five documents from Kristin&apos;s templates and fills
                them as the agent drafts. This connection belongs to ClearGO, not to one person — any
                admin can reconnect it.
            </Text>

            {connectedParam && (
                <Alert color="teal" icon={<IconCheck size={16} />} mb="md">
                    Connected{connectedParam !== "true" ? ` as ${connectedParam}` : ""}.
                </Alert>
            )}
            {errorParam && (
                <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="md">
                    {errorParam}
                </Alert>
            )}

            {!status && (
                <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                    Could not load the integration status.
                </Alert>
            )}

            {status && (
                <Stack gap="md">
                    <Card withBorder padding="lg">
                        <Group justify="space-between" align="flex-start">
                            <div>
                                <Group gap="xs" mb={4}>
                                    <Text fw={600}>Connection</Text>
                                    {status.connected ? (
                                        <Badge color="teal" variant="light">Connected</Badge>
                                    ) : (
                                        <Badge color="gray" variant="light">Not connected</Badge>
                                    )}
                                </Group>
                                {status.connected ? (
                                    <>
                                        <Text size="sm">
                                            Acting as <b>{status.connectedEmail ?? "unknown account"}</b>
                                        </Text>
                                        <Text size="xs" c="dimmed" mt={2}>
                                            {/* Worth stating plainly: this account appears as the
                                                creator on every document ClearGO makes. */}
                                            Every document ClearGO creates will show this account as its creator.
                                        </Text>
                                        {status.connectedBy && (
                                            <Text size="xs" c="dimmed" mt={2}>
                                                Authorised by {status.connectedBy}
                                                {status.connectedAt
                                                    ? ` on ${new Date(status.connectedAt).toLocaleDateString()}`
                                                    : ""}
                                            </Text>
                                        )}
                                    </>
                                ) : (
                                    <Text size="sm" c="dimmed">
                                        No Google account is connected. Launch documents will not be created.
                                    </Text>
                                )}
                            </div>

                            <Group gap="xs">
                                <Button
                                    component="a"
                                    href="/api/integrations/google/oauth"
                                    leftSection={<IconPlugConnected size={16} />}
                                    disabled={!status.oauthConfigured}
                                >
                                    {status.connected ? "Reconnect" : "Connect Google"}
                                </Button>
                                {status.connected && (
                                    <Button
                                        variant="subtle"
                                        color="red"
                                        onClick={disconnect}
                                        loading={disconnecting}
                                        leftSection={<IconX size={16} />}
                                    >
                                        Disconnect
                                    </Button>
                                )}
                            </Group>
                        </Group>

                        {!status.oauthConfigured && (
                            <Alert color="orange" mt="md" icon={<IconAlertTriangle size={16} />}>
                                <Text size="sm">
                                    <b>GOOGLE_OAUTH_CLIENT_ID</b> and <b>GOOGLE_OAUTH_CLIENT_SECRET</b> are not
                                    set, so the connection cannot be started.
                                </Text>
                            </Alert>
                        )}

                        {status.connected && (
                            <Alert color="blue" mt="md" variant="light">
                                <Text size="sm">
                                    {/* The single most common cause of a connection that keeps
                                        dying, and it is invisible until it happens. */}
                                    The Google OAuth consent screen must be set to <b>Internal</b> and published.
                                    Left in <b>Testing</b>, Google expires the connection every 7 days.
                                </Text>
                            </Alert>
                        )}
                    </Card>

                    <Card withBorder padding="lg">
                        <Text fw={600} mb="sm">Setup</Text>
                        <Stack gap="xs">
                            <CheckRow
                                ok={status.launchFolderConfigured}
                                label="Launch folder configured"
                                detail="GOOGLE_LAUNCH_DRIVE_FOLDER_ID — where per-launch folders are created."
                            />
                            {status.templates.map((t) => (
                                <CheckRow
                                    key={t.type}
                                    ok={t.configured}
                                    label={`${t.label} template`}
                                    detail={`GOOGLE_TEMPLATE_${t.type.toUpperCase()}_ID`}
                                />
                            ))}
                            {status.serviceAccountFallback && (
                                <CheckRow
                                    ok
                                    label="Service account available as a fallback"
                                    detail="Used only when no OAuth connection exists."
                                />
                            )}
                        </Stack>

                        {missingTemplates.length > 0 && (
                            <Alert color="orange" mt="md" variant="light">
                                <Text size="sm">
                                    {missingTemplates.length} template
                                    {missingTemplates.length === 1 ? " is" : "s are"} not configured. Those
                                    documents will not be created for a launch.
                                </Text>
                            </Alert>
                        )}
                    </Card>

                    <Card withBorder padding="lg">
                        <Text fw={600} mb="xs">What ClearGO does with this</Text>
                        <Text size="sm" c="dimmed">
                            Copies the five templates into a folder per launch, fills each one as the agent
                            drafts it, and reads an approved document back when the next one quotes it. It
                            never deletes anything.
                        </Text>
                        <Button
                            variant="subtle"
                            size="xs"
                            mt="sm"
                            component="a"
                            href="https://console.cloud.google.com/apis/credentials"
                            target="_blank"
                            rel="noopener noreferrer"
                            leftSection={<IconExternalLink size={14} />}
                        >
                            Google Cloud credentials
                        </Button>
                    </Card>
                </Stack>
            )}
        </div>
    );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
    return (
        <Group gap="xs" align="flex-start" wrap="nowrap">
            {ok ? (
                <IconCheck size={16} color="var(--mantine-color-teal-6)" style={{ marginTop: 2 }} />
            ) : (
                <IconX size={16} color="var(--mantine-color-red-6)" style={{ marginTop: 2 }} />
            )}
            <div>
                <Text size="sm">{label}</Text>
                <Text size="xs" c="dimmed">{detail}</Text>
            </div>
        </Group>
    );
}
