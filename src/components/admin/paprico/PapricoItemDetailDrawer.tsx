"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Anchor, Badge, Button, Drawer, Group, Loader, Stack, Text } from "@mantine/core";
import { formatDateOnlyForDisplay } from "@/lib/date-utils";
import type { PapricoDecision, PapricoItem, PapricoLink } from "@/lib/paprico/types";
import PapricoDecisionForm from "./PapricoDecisionForm";

type ItemDetail = {
    item: PapricoItem;
    epic: { id: string; name: string; tier: string | null } | null;
    criterion: { id: string; label: string; category: string | null; is_active: boolean } | null;
    orphaned: boolean;
    decisions: Array<PapricoDecision & { meeting: { meeting_date: string } | null }>;
};

const STATUS_COLORS: Record<string, string> = {
    proposed: "gray",
    on_agenda: "indigo",
    decided: "green",
    deferred: "yellow",
    blocked: "red",
    closed: "gray",
};

export function ItemStatusBadge({ status }: { status: string }) {
    return (
        <Badge color={STATUS_COLORS[status] ?? "gray"} variant="light">
            {status.replace(/_/g, " ")}
        </Badge>
    );
}

export function DecisionHistory({
    decisions,
}: {
    decisions: Array<PapricoDecision & { meeting?: { meeting_date: string } | null }>;
}) {
    if (decisions.length === 0) {
        return <Text size="sm" c="dimmed">No decisions recorded yet.</Text>;
    }
    const supersededIds = new Set(decisions.map((d) => d.supersedes_id).filter(Boolean));
    return (
        <Stack gap="xs">
            {decisions.map((d) => (
                <div
                    key={d.id}
                    className={`border rounded-lg px-3 py-2 ${supersededIds.has(d.id) ? "opacity-60 border-gray-200 bg-gray-50" : "border-gray-200"}`}
                >
                    <Group gap="xs" wrap="wrap">
                        <Badge variant="filled" color={d.decision_type === "rejected" ? "red" : d.decision_type === "deferred" ? "yellow" : "indigo"}>
                            {d.decision_type.replace(/_/g, " ")}
                        </Badge>
                        {supersededIds.has(d.id) && (
                            <Badge variant="outline" color="gray">superseded</Badge>
                        )}
                        {d.supersedes_id && (
                            <Badge variant="outline" color="orange">supersedes an earlier decision</Badge>
                        )}
                        {d.completed_at && <Badge variant="light" color="green">completed</Badge>}
                    </Group>
                    <Text size="sm" mt={4}>{d.decision_text}</Text>
                    {d.rationale && (
                        <Text size="xs" c="dimmed" mt={2}>Rationale: {d.rationale}</Text>
                    )}
                    <Text size="xs" c="dimmed" mt={2}>
                        {d.owner_email ? `Owner: ${d.owner_email}` : "No owner"}
                        {d.due_date ? ` · due ${formatDateOnlyForDisplay(d.due_date)}` : ""}
                        {` · decided by ${d.decided_by}`}
                        {d.meeting?.meeting_date ? ` · meeting ${formatDateOnlyForDisplay(d.meeting.meeting_date)}` : ""}
                    </Text>
                </div>
            ))}
        </Stack>
    );
}

type Props = {
    itemId: string | null;
    /** Meeting to attach new decisions to (the next open meeting). */
    meetingId: string | null;
    canWrite: boolean;
    onClose: () => void;
    onChanged: () => void;
};

export default function PapricoItemDetailDrawer({ itemId, meetingId, canWrite, onClose, onChanged }: Props) {
    const [detail, setDetail] = useState<ItemDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [showDecisionForm, setShowDecisionForm] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!itemId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/paprico/items/${itemId}`);
            if (res.ok) setDetail(await res.json());
        } finally {
            setLoading(false);
        }
    }, [itemId]);

    useEffect(() => {
        setDetail(null);
        setShowDecisionForm(false);
        setActionError(null);
        if (itemId) void load();
    }, [itemId, load]);

    const patchItem = async (updates: Record<string, unknown>) => {
        if (!itemId) return;
        setActionError(null);
        const res = await fetch(`/api/paprico/items/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
        });
        const body = await res.json();
        if (!res.ok) {
            setActionError(body.error || "Update failed");
            return;
        }
        await load();
        onChanged();
    };

    const item = detail?.item;
    const links = (item?.links ?? []) as PapricoLink[];

    return (
        <Drawer opened={!!itemId} onClose={onClose} title="Agenda item" position="right" size="lg">
            {loading && !detail && <Loader size="sm" />}
            {item && (
                <Stack gap="md">
                    <div>
                        <Group gap="xs" mb={4}>
                            <ItemStatusBadge status={item.status} />
                            <Badge variant="outline" color="gray">{item.source}</Badge>
                            {item.category && <Badge variant="outline" color="grape">{item.category}</Badge>}
                            {item.auto_closed && <Badge variant="light" color="teal">auto-closed</Badge>}
                            {detail?.orphaned && <Badge variant="light" color="orange">orphaned</Badge>}
                        </Group>
                        <Text fw={600}>{item.title}</Text>
                        {item.description && <Text size="sm" mt={4}>{item.description}</Text>}
                    </div>

                    <div className="text-sm text-gray-600 space-y-1">
                        {detail?.epic && (
                            <div>
                                Release:{" "}
                                <Anchor component={Link} href={`/epics/${detail.epic.id}`} size="sm">
                                    {detail.epic.name}
                                </Anchor>{" "}
                                {detail.epic.tier ? `(${detail.epic.tier.replace("TIER_", "Tier ")})` : ""}
                            </div>
                        )}
                        {detail?.criterion && (
                            <div>
                                Criterion:{" "}
                                <Anchor component={Link} href="/admin/settings/criteria" size="sm">
                                    {detail.criterion.label}
                                </Anchor>
                                {!detail.criterion.is_active && " (inactive)"}
                            </div>
                        )}
                        {item.owner_email && <div>Owner: {item.owner_email}</div>}
                        {item.blocked_reason && <div className="text-red-700">Blocked on: {item.blocked_reason}</div>}
                        {item.system_notes && (
                            <div className="whitespace-pre-line text-gray-500">{item.system_notes}</div>
                        )}
                        <div>
                            Links:{" "}
                            {links.length === 0 && <span className="text-gray-400">none</span>}
                            {links.map((l, i) => (
                                <span key={`${l.url}-${i}`}>
                                    {i > 0 && " · "}
                                    <Anchor href={l.url} target="_blank" rel="noopener noreferrer" size="sm">
                                        {l.label}
                                    </Anchor>
                                    {canWrite && (
                                        <button
                                            type="button"
                                            aria-label={`Remove link ${l.label}`}
                                            className="ml-0.5 text-gray-400 hover:text-red-600"
                                            onClick={() => patchItem({ links: links.filter((_, j) => j !== i) })}
                                        >
                                            ×
                                        </button>
                                    )}
                                </span>
                            ))}
                            {canWrite && (
                                <button
                                    type="button"
                                    className="ml-2 text-indigo-600 hover:text-indigo-800 text-xs"
                                    onClick={() => {
                                        const url = window.prompt("Link URL (submission deck, spreadsheet, Slack thread…)");
                                        if (!url?.trim()) return;
                                        const label = window.prompt("Link label") || url.trim();
                                        void patchItem({ links: [...links, { label: label.trim(), url: url.trim() }] });
                                    }}
                                >
                                    + add link
                                </button>
                            )}
                        </div>
                    </div>

                    {canWrite && item.status !== "closed" && (
                        <Group gap="xs">
                            {item.status !== "on_agenda" && (
                                <Button size="xs" variant="light" onClick={() => patchItem({ status: "on_agenda" })}>
                                    Add to agenda
                                </Button>
                            )}
                            {item.status !== "deferred" && (
                                <Button size="xs" variant="light" color="yellow" onClick={() => patchItem({ status: "deferred" })}>
                                    Defer
                                </Button>
                            )}
                            {item.status !== "blocked" && (
                                <Button
                                    size="xs"
                                    variant="light"
                                    color="red"
                                    onClick={() => {
                                        const reason = window.prompt("What is this item blocked on?");
                                        if (reason?.trim()) void patchItem({ status: "blocked", blocked_reason: reason.trim() });
                                    }}
                                >
                                    Block
                                </Button>
                            )}
                            {item.source === "standing" && (
                                <Button size="xs" variant="subtle" color="gray" onClick={() => patchItem({ status: "closed" })}>
                                    Close
                                </Button>
                            )}
                        </Group>
                    )}
                    {actionError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2" role="alert">
                            {actionError}
                        </div>
                    )}

                    <div>
                        <Group justify="space-between" mb="xs">
                            <Text fw={600} size="sm">Decision history</Text>
                            {canWrite && meetingId && !showDecisionForm && (
                                <Button size="xs" onClick={() => setShowDecisionForm(true)}>
                                    Record decision
                                </Button>
                            )}
                        </Group>
                        {showDecisionForm && meetingId && item && (
                            <div className="border border-indigo-100 rounded-lg p-3 mb-3 bg-indigo-50/40">
                                <PapricoDecisionForm
                                    itemId={item.id}
                                    meetingId={meetingId}
                                    onSaved={() => {
                                        setShowDecisionForm(false);
                                        void load();
                                        onChanged();
                                    }}
                                    onCancel={() => setShowDecisionForm(false)}
                                />
                            </div>
                        )}
                        <DecisionHistory decisions={detail?.decisions ?? []} />
                    </div>
                </Stack>
            )}
        </Drawer>
    );
}
