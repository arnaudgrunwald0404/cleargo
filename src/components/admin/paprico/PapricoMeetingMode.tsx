"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Group, Kbd, Loader, Stack, Text } from "@mantine/core";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canRolesPerform } from "@/lib/permissions";
import { formatDateOnlyForDisplay } from "@/lib/date-utils";
import type { AgendaItem, PapricoAgenda, PapricoDecision, PapricoMeeting } from "@/lib/paprico/types";
import PapricoDecisionForm from "./PapricoDecisionForm";
import { DecisionHistory, ItemStatusBadge } from "./PapricoItemDetailDrawer";

type AgendaResponse = {
    meeting: PapricoMeeting;
    agenda: PapricoAgenda;
    is_snapshot: boolean;
    live_item_status: Record<string, { status: string; decision_count: number }>;
};

/**
 * In-meeting mode (spec §5.3): full-width, one item at a time, keyboard
 * navigable — j/k or arrows to move, d to open the decision form.
 */
export default function PapricoMeetingMode({ meetingId }: { meetingId: string }) {
    const { data: currentUser } = useCurrentUser();
    const canWrite = canRolesPerform(currentUser?.roles ?? null, "paprico.manage");

    const [data, setData] = useState<AgendaResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [index, setIndex] = useState(0);
    const [formOpen, setFormOpen] = useState(false);
    const [decisions, setDecisions] = useState<PapricoDecision[]>([]);
    const [liveStatus, setLiveStatus] = useState<Record<string, { status: string; decision_count: number }>>({});

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/paprico/meetings/${meetingId}/agenda`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to load agenda");
            setData(body as AgendaResponse);
            setLiveStatus((body as AgendaResponse).live_item_status ?? {});
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load agenda");
        } finally {
            setLoading(false);
        }
    }, [meetingId]);

    useEffect(() => {
        void load();
    }, [load]);

    const items: AgendaItem[] = useMemo(() => {
        if (!data) return [];
        return [...data.agenda.overdue_critical, ...data.agenda.approaching, ...data.agenda.standing];
    }, [data]);

    const current = items[index] ?? null;

    const loadDecisions = useCallback(async (itemId: string) => {
        const res = await fetch(`/api/paprico/items/${itemId}`);
        if (res.ok) {
            const body = await res.json();
            setDecisions(body.decisions ?? []);
        }
    }, []);

    useEffect(() => {
        setFormOpen(false);
        setDecisions([]);
        if (current) void loadDecisions(current.id);
    }, [current, loadDecisions]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const tag = target?.tagName?.toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
            if (e.key === "j" || e.key === "ArrowDown" || e.key === "ArrowRight") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
            } else if (e.key === "k" || e.key === "ArrowUp" || e.key === "ArrowLeft") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "d" && canWrite) {
                e.preventDefault();
                setFormOpen(true);
            } else if (e.key === "Escape") {
                setFormOpen(false);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [items.length, canWrite]);

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="max-w-2xl mx-auto py-16 text-center">
                <Text c="red">{error ?? "Failed to load"}</Text>
                <Button component={Link} href="/admin/settings/paprico" variant="light" mt="md">
                    Back to PaPriCo
                </Button>
            </div>
        );
    }

    const status = current ? liveStatus[current.id]?.status ?? current.status : null;

    return (
        <div className="max-w-4xl mx-auto">
            <Group justify="space-between" mb="md" wrap="wrap">
                <div>
                    <Text fw={700} size="lg">
                        PaPriCo — {formatDateOnlyForDisplay(data.meeting.meeting_date)}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {data.meeting.chair_email ? `Chair: ${data.meeting.chair_email} · ` : ""}
                        Item {items.length === 0 ? 0 : index + 1} of {items.length}
                        {" · "}
                        <Kbd>j</Kbd>/<Kbd>k</Kbd> or arrows to move, <Kbd>d</Kbd> to record a decision
                    </Text>
                </div>
                <Button component={Link} href="/admin/settings/paprico" variant="subtle">
                    Exit meeting mode
                </Button>
            </Group>

            {items.length === 0 && (
                <div className="border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center text-gray-500">
                    The agenda is empty.
                </div>
            )}

            {current && (
                <div className="border border-gray-200 rounded-xl bg-white px-6 py-5">
                    <Group gap="xs" mb="xs" wrap="wrap">
                        {current.band && (
                            <Badge variant="filled" color={current.band === "overdue" ? "red" : current.band === "critical" ? "orange" : current.band === "soon" ? "yellow" : "blue"}>
                                {current.band.toUpperCase()}
                            </Badge>
                        )}
                        {status && <ItemStatusBadge status={status} />}
                        {current.tier && <Badge variant="outline" color="gray">{current.tier.replace("TIER_", "Tier ")}</Badge>}
                        {current.category && <Badge variant="outline" color="grape">{current.category}</Badge>}
                    </Group>
                    <Text fw={700} size="xl">{current.title}</Text>
                    {current.description && <Text size="sm" mt="xs">{current.description}</Text>}
                    <div className="mt-3 text-sm text-gray-600 space-y-1">
                        {current.release_name && <div>Release: {current.release_name}</div>}
                        {current.criterion_label && <div>Open criterion: {current.criterion_label}</div>}
                        {current.stage_name && (
                            <div>
                                Stage: {current.stage_name} ({formatDateOnlyForDisplay(current.stage_date)})
                                {current.days_to_stage != null &&
                                    (current.days_to_stage < 0
                                        ? ` — ${-current.days_to_stage}d past`
                                        : ` — in ${current.days_to_stage}d`)}
                            </div>
                        )}
                        {current.owner_email && <div>Owner: {current.owner_email}</div>}
                        {current.blocked_reason && <div className="text-red-700">Blocked on: {current.blocked_reason}</div>}
                    </div>

                    <div className="mt-5">
                        <Group justify="space-between" mb="xs">
                            <Text fw={600} size="sm">Decision history</Text>
                            {canWrite && !formOpen && (
                                <Button size="xs" onClick={() => setFormOpen(true)}>
                                    Record decision (<Kbd>d</Kbd>)
                                </Button>
                            )}
                        </Group>
                        {formOpen && canWrite && (
                            <div className="border border-indigo-100 rounded-lg p-4 mb-3 bg-indigo-50/40">
                                <PapricoDecisionForm
                                    itemId={current.id}
                                    meetingId={meetingId}
                                    onSaved={() => {
                                        setFormOpen(false);
                                        void loadDecisions(current.id);
                                        setLiveStatus((prev) => ({
                                            ...prev,
                                            [current.id]: {
                                                status: "decided",
                                                decision_count: (prev[current.id]?.decision_count ?? 0) + 1,
                                            },
                                        }));
                                    }}
                                    onCancel={() => setFormOpen(false)}
                                />
                            </div>
                        )}
                        <DecisionHistory decisions={decisions} />
                    </div>
                </div>
            )}

            <Group justify="space-between" mt="md">
                <Button variant="light" disabled={index === 0} onClick={() => setIndex((i) => Math.max(i - 1, 0))}>
                    ← Previous
                </Button>
                <Stack gap={0} align="center">
                    <Text size="xs" c="dimmed">
                        {items.length === 0 ? "" : `${index + 1} / ${items.length}`}
                    </Text>
                </Stack>
                <Button
                    variant="light"
                    disabled={index >= items.length - 1}
                    onClick={() => setIndex((i) => Math.min(i + 1, items.length - 1))}
                >
                    Next →
                </Button>
            </Group>
        </div>
    );
}
