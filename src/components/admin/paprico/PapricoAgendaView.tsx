"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Badge,
    Button,
    Group,
    Loader,
    Modal,
    NumberInput,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from "@mantine/core";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canRolesPerform } from "@/lib/permissions";
import { formatDateOnlyForDisplay } from "@/lib/date-utils";
import type {
    AgendaItem,
    OpenCommitment,
    PapricoAgenda,
    PapricoMeeting,
    UrgencyBand,
} from "@/lib/paprico/types";
import PapricoItemDetailDrawer, { ItemStatusBadge } from "./PapricoItemDetailDrawer";

const BAND_STYLE: Record<UrgencyBand, { color: string; label: string }> = {
    overdue: { color: "red", label: "OVERDUE" },
    critical: { color: "orange", label: "CRITICAL" },
    soon: { color: "yellow", label: "SOON" },
    horizon: { color: "blue", label: "HORIZON" },
};

function BandBadge({ band }: { band: UrgencyBand | null }) {
    // Urgency is never colour-only: every band carries its text label (spec §6).
    if (!band) return <Badge variant="outline" color="gray">NO DATE</Badge>;
    const s = BAND_STYLE[band];
    return <Badge variant="filled" color={s.color}>{s.label}</Badge>;
}

const EMPTY_STATE_TEXT = "Nothing approaching a stage with pricing, naming or forecast criteria open.";

type AgendaResponse = {
    meeting: PapricoMeeting;
    agenda: PapricoAgenda;
    is_snapshot: boolean;
    live_item_status: Record<string, { status: string; decision_count: number }>;
};

export default function PapricoAgendaView() {
    const { data: currentUser } = useCurrentUser();
    const canWrite = canRolesPerform(currentUser?.roles ?? null, "paprico.manage");

    const [meetings, setMeetings] = useState<PapricoMeeting[]>([]);
    const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
    const [agendaData, setAgendaData] = useState<AgendaResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [agendaLoading, setAgendaLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [newDate, setNewDate] = useState("");
    const [newChair, setNewChair] = useState("");
    const [newLength, setNewLength] = useState<number | string>(60);
    const [creating, setCreating] = useState(false);

    const [standingOpen, setStandingOpen] = useState(false);
    const [standingTitle, setStandingTitle] = useState("");
    const [standingDescription, setStandingDescription] = useState("");
    const [standingCategory, setStandingCategory] = useState("");
    const [standingSaving, setStandingSaving] = useState(false);

    const [publishOpen, setPublishOpen] = useState(false);
    const [slackBlock, setSlackBlock] = useState<string>("");
    const [publishing, setPublishing] = useState(false);

    const [minutesOpen, setMinutesOpen] = useState(false);
    const [minutesMarkdown, setMinutesMarkdown] = useState<string>("");
    const [minutesLoading, setMinutesLoading] = useState(false);

    const [detailItemId, setDetailItemId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

    const loadMeetings = useCallback(async (): Promise<{ meetings: PapricoMeeting[]; nextId: string | null }> => {
        const res = await fetch("/api/paprico/meetings");
        if (!res.ok) throw new Error("Failed to load meetings");
        const body = await res.json();
        setMeetings(body.meetings ?? []);
        return { meetings: body.meetings ?? [], nextId: body.next_meeting_id ?? null };
    }, []);

    const loadAgenda = useCallback(async (meetingId: string) => {
        setAgendaLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/paprico/meetings/${meetingId}/agenda`);
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || "Failed to load agenda");
            setAgendaData(body as AgendaResponse);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load agenda");
        } finally {
            setAgendaLoading(false);
        }
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const { nextId } = await loadMeetings();
                if (nextId) {
                    setSelectedMeetingId(nextId);
                    await loadAgenda(nextId);
                }
            } catch {
                setError("Failed to load PaPriCo meetings");
            } finally {
                setLoading(false);
            }
        })();
    }, [loadMeetings, loadAgenda]);

    const refresh = useCallback(() => {
        if (selectedMeetingId) void loadAgenda(selectedMeetingId);
        void loadMeetings();
    }, [selectedMeetingId, loadAgenda, loadMeetings]);

    const handleSelectMeeting = (id: string | null) => {
        setSelectedMeetingId(id);
        setAgendaData(null);
        if (id) void loadAgenda(id);
    };

    const handleCreateMeeting = async () => {
        if (!newDate) return;
        setCreating(true);
        try {
            const res = await fetch("/api/paprico/meetings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meeting_date: newDate,
                    chair_email: newChair || undefined,
                    meeting_length_minutes: typeof newLength === "number" ? newLength : 60,
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || "Failed to create meeting");
                return;
            }
            setCreateOpen(false);
            setNewDate("");
            setNewChair("");
            await loadMeetings();
            setSelectedMeetingId(body.meeting.id);
            await loadAgenda(body.meeting.id);
        } finally {
            setCreating(false);
        }
    };

    const handleCreateStanding = async () => {
        if (!standingTitle.trim()) return;
        setStandingSaving(true);
        try {
            const res = await fetch("/api/paprico/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: standingTitle.trim(),
                    description: standingDescription.trim() || null,
                    category: standingCategory.trim() || null,
                }),
            });
            if (res.ok) {
                setStandingOpen(false);
                setStandingTitle("");
                setStandingDescription("");
                setStandingCategory("");
                refresh();
            } else {
                const body = await res.json();
                setError(body.error || "Failed to add standing item");
            }
        } finally {
            setStandingSaving(false);
        }
    };

    const handlePublish = async () => {
        if (!selectedMeetingId) return;
        setPublishing(true);
        try {
            const res = await fetch(`/api/paprico/meetings/${selectedMeetingId}/publish`, { method: "POST" });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || "Failed to publish agenda");
                return;
            }
            setSlackBlock(body.slack_block ?? "");
            setPublishOpen(true);
            refresh();
        } finally {
            setPublishing(false);
        }
    };

    const handleMeetingStatus = async (status: "held" | "closed") => {
        if (!selectedMeetingId) return;
        const res = await fetch(`/api/paprico/meetings/${selectedMeetingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        if (res.ok) refresh();
    };

    const handleMinutes = async () => {
        if (!selectedMeetingId) return;
        setMinutesLoading(true);
        setMinutesOpen(true);
        try {
            const res = await fetch(`/api/paprico/meetings/${selectedMeetingId}/minutes`);
            const body = await res.json();
            setMinutesMarkdown(res.ok ? body.markdown : `Error: ${body.error}`);
        } finally {
            setMinutesLoading(false);
        }
    };

    const patchItem = async (itemId: string, updates: Record<string, unknown>) => {
        const res = await fetch(`/api/paprico/items/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
        });
        if (!res.ok) {
            const body = await res.json();
            setError(body.error || "Update failed");
        } else {
            refresh();
        }
    };

    const completeCommitment = async (decisionId: string) => {
        const res = await fetch(`/api/paprico/decisions/${decisionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed: true }),
        });
        if (res.ok) refresh();
    };

    const handleDrop = async (targetId: string, section: AgendaItem[]) => {
        if (!draggedItemId || draggedItemId === targetId) return;
        const ids = section.map((i) => i.id);
        const from = ids.indexOf(draggedItemId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, draggedItemId);
        setDraggedItemId(null);
        const res = await fetch("/api/paprico/items/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ordered_ids: ids }),
        });
        if (res.ok) refresh();
    };

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard unavailable — the text stays selectable in the textarea.
        }
    };

    const meeting = agendaData?.meeting ?? null;
    const agenda = agendaData?.agenda ?? null;
    const liveStatus = agendaData?.live_item_status ?? {};

    const meetingOptions = useMemo(
        () =>
            meetings.map((m) => ({
                value: m.id,
                label: `${formatDateOnlyForDisplay(m.meeting_date)} — ${m.status.replace(/_/g, " ")}`,
            })),
        [meetings]
    );

    const overTime =
        meeting && agenda ? agenda.total_time_box_minutes > meeting.meeting_length_minutes : false;

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader />
            </div>
        );
    }

    const renderItemRow = (item: AgendaItem, section: AgendaItem[], draggable: boolean) => {
        const live = liveStatus[item.id];
        const status = live?.status ?? item.status;
        return (
            <div
                key={item.id}
                draggable={canWrite && draggable}
                onDragStart={() => setDraggedItemId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void handleDrop(item.id, section)}
                className={`border border-gray-200 rounded-lg px-4 py-3 bg-white hover:border-indigo-200 transition-colors ${
                    canWrite && draggable ? "cursor-grab" : ""
                }`}
            >
                <div className="flex flex-wrap items-center gap-2">
                    <BandBadge band={item.band} />
                    <button
                        type="button"
                        className="font-medium text-left text-gray-900 hover:text-indigo-700"
                        onClick={() => setDetailItemId(item.id)}
                    >
                        {item.title}
                    </button>
                    {item.tier && <Badge variant="outline" color="gray">{item.tier.replace("TIER_", "Tier ")}</Badge>}
                    {item.orphaned && <Badge variant="light" color="orange">orphaned</Badge>}
                    <span className="ml-auto flex items-center gap-2">
                        <ItemStatusBadge status={status} />
                    </span>
                </div>
                <div className="mt-1 text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                    {item.release_name && <span>Release: {item.release_name}</span>}
                    {item.criterion_label && <span>Criterion: {item.criterion_label}</span>}
                    {item.stage_name && (
                        <span>
                            Stage: {item.stage_name} ({formatDateOnlyForDisplay(item.stage_date)})
                        </span>
                    )}
                    {item.days_to_stage != null && (
                        <span>
                            {item.days_to_stage < 0
                                ? `${-item.days_to_stage}d past stage date`
                                : `${item.days_to_stage}d to stage date`}
                        </span>
                    )}
                    {item.owner_email && <span>Owner: {item.owner_email}</span>}
                </div>
                {canWrite && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {status === "proposed" && (
                            <Button size="compact-xs" variant="light" onClick={() => patchItem(item.id, { status: "on_agenda" })}>
                                Add to agenda
                            </Button>
                        )}
                        {status !== "deferred" && status !== "closed" && (
                            <Button size="compact-xs" variant="subtle" color="yellow" onClick={() => patchItem(item.id, { status: "deferred" })}>
                                Defer
                            </Button>
                        )}
                        {status !== "blocked" && status !== "closed" && (
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                onClick={() => {
                                    const reason = window.prompt("What is this item blocked on?");
                                    if (reason?.trim()) void patchItem(item.id, { status: "blocked", blocked_reason: reason.trim() });
                                }}
                            >
                                Block
                            </Button>
                        )}
                        <NumberInput
                            size="xs"
                            w={110}
                            min={1}
                            max={480}
                            placeholder="time box"
                            aria-label={`Time box minutes for ${item.title}`}
                            defaultValue={item.time_box_minutes ?? ""}
                            onBlur={(e) => {
                                const raw = e.currentTarget.value.replace(/[^\d]/g, "");
                                const minutes = raw ? Math.min(480, Math.max(1, parseInt(raw, 10))) : null;
                                if (minutes !== (item.time_box_minutes ?? null)) {
                                    void patchItem(item.id, { time_box_minutes: minutes });
                                }
                            }}
                            suffix=" min"
                        />
                    </div>
                )}
            </div>
        );
    };

    const renderSection = (
        title: string,
        subtitle: string,
        items: AgendaItem[],
        emptyText: string,
        draggable: boolean
    ) => (
        <div>
            <Text fw={600} size="sm" mb={2}>{title}</Text>
            <Text size="xs" c="dimmed" mb="xs">{subtitle}</Text>
            {items.length === 0 ? (
                <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-3">
                    {emptyText}
                </div>
            ) : (
                <Stack gap="xs">{items.map((i) => renderItemRow(i, items, draggable))}</Stack>
            )}
        </div>
    );

    const renderCommitment = (c: OpenCommitment) => (
        <div key={c.id} className="border border-gray-200 rounded-lg px-4 py-3 bg-white">
            <div className="flex flex-wrap items-center gap-2">
                {c.age_days != null && c.age_days > 0 ? (
                    <Badge variant="filled" color="red">{c.age_days}d OVERDUE</Badge>
                ) : (
                    <Badge variant="light" color="yellow">DUE {formatDateOnlyForDisplay(c.due_date)}</Badge>
                )}
                <span className="font-medium text-gray-900">{c.item_title ?? "(item)"}</span>
                <span className="ml-auto text-xs text-gray-500">{c.owner_email}</span>
            </div>
            <div className="mt-1 text-xs text-gray-600">{c.decision_text}</div>
            {canWrite && (
                <div className="mt-2">
                    <Button size="compact-xs" variant="light" color="green" onClick={() => completeCommitment(c.id)}>
                        Mark complete
                    </Button>
                </div>
            )}
        </div>
    );

    return (
        <div>
            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg" role="alert">
                    {error}
                </div>
            )}

            <Group justify="space-between" align="flex-end" mb="md" wrap="wrap">
                <Group gap="sm" align="flex-end">
                    <Select
                        label="Meeting"
                        placeholder={meetings.length === 0 ? "No meetings yet" : "Pick a meeting"}
                        data={meetingOptions}
                        value={selectedMeetingId}
                        onChange={handleSelectMeeting}
                        w={280}
                        searchable={false}
                    />
                    {canWrite && (
                        <Button variant="light" onClick={() => setCreateOpen(true)}>
                            New meeting
                        </Button>
                    )}
                </Group>
                {meeting && (
                    <Group gap="xs">
                        {canWrite && meeting.status === "draft" && (
                            <Button onClick={handlePublish} loading={publishing}>
                                Publish agenda
                            </Button>
                        )}
                        {meeting.status === "agenda_published" && (
                            <>
                                <Button
                                    component={Link}
                                    href={`/paprico/meeting/${meeting.id}`}
                                    variant="filled"
                                    color="indigo"
                                >
                                    Run meeting
                                </Button>
                                {canWrite && (
                                    <Button variant="light" onClick={() => handleMeetingStatus("held")}>
                                        Mark held
                                    </Button>
                                )}
                            </>
                        )}
                        {(meeting.status === "held" || meeting.status === "closed") && (
                            <Button variant="light" onClick={handleMinutes}>
                                Minutes
                            </Button>
                        )}
                        {canWrite && meeting.status === "held" && (
                            <Button variant="subtle" color="gray" onClick={() => handleMeetingStatus("closed")}>
                                Close meeting
                            </Button>
                        )}
                    </Group>
                )}
            </Group>

            {meetings.length === 0 && (
                <div className="border border-dashed border-gray-300 rounded-xl px-6 py-12 text-center">
                    <Text fw={600} mb={4}>No PaPriCo meeting scheduled</Text>
                    <Text size="sm" c="dimmed" mb="md">
                        Create the next committee meeting to generate its agenda from open release criteria.
                    </Text>
                    {canWrite ? (
                        <Button onClick={() => setCreateOpen(true)}>Create the next meeting</Button>
                    ) : (
                        <Text size="sm" c="dimmed">Ask the chair (Product Ops / CPO) to create one.</Text>
                    )}
                </div>
            )}

            {meeting && (
                <div className="mb-4 border border-gray-200 rounded-xl px-5 py-4 bg-white">
                    <Group gap="lg" wrap="wrap">
                        <div>
                            <Text size="xs" c="dimmed">Meeting</Text>
                            <Text fw={600}>{formatDateOnlyForDisplay(meeting.meeting_date)}</Text>
                        </div>
                        <div>
                            <Text size="xs" c="dimmed">Chair</Text>
                            <Text fw={500}>{meeting.chair_email ?? "—"}</Text>
                        </div>
                        <div>
                            <Text size="xs" c="dimmed">Status</Text>
                            <Badge variant="light" color={meeting.status === "draft" ? "gray" : meeting.status === "agenda_published" ? "indigo" : "green"}>
                                {meeting.status.replace(/_/g, " ")}
                            </Badge>
                        </div>
                        {agenda && (
                            <div>
                                <Text size="xs" c="dimmed">Time boxed</Text>
                                <Tooltip label="Sum of item time boxes vs meeting length" withArrow>
                                    <Text fw={500} c={overTime ? "red" : undefined}>
                                        {agenda.total_time_box_minutes} / {meeting.meeting_length_minutes} min
                                        {overTime ? " — over" : ""}
                                    </Text>
                                </Tooltip>
                            </div>
                        )}
                        {agendaData?.is_snapshot && (
                            <Badge variant="outline" color="indigo" mt="auto">
                                published snapshot{meeting.agenda_published_at ? ` · ${new Date(meeting.agenda_published_at).toLocaleString()}` : ""}
                            </Badge>
                        )}
                    </Group>
                </div>
            )}

            {agendaLoading && (
                <div className="flex justify-center py-8">
                    <Loader size="sm" />
                </div>
            )}

            {agenda && !agendaLoading && (
                <Stack gap="lg">
                    <div>
                        <Text fw={600} size="sm" mb={2}>1. Open commitments</Text>
                        <Text size="xs" c="dimmed" mb="xs">
                            Decisions with an owner and a due date, not yet complete — first on purpose.
                        </Text>
                        {agenda.open_commitments.length === 0 ? (
                            <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-3">
                                None — everything landed.
                            </div>
                        ) : (
                            <Stack gap="xs">{agenda.open_commitments.map(renderCommitment)}</Stack>
                        )}
                    </div>
                    {renderSection(
                        "2. Overdue and critical",
                        "Release items whose stage date has passed or is inside 14 days.",
                        agenda.overdue_critical,
                        EMPTY_STATE_TEXT,
                        false
                    )}
                    {renderSection(
                        "3. Approaching",
                        "Release-derived items inside the lookahead horizon.",
                        agenda.approaching,
                        EMPTY_STATE_TEXT,
                        false
                    )}
                    <div>
                        <Group justify="space-between" mb={2}>
                            <Text fw={600} size="sm">4. Standing items</Text>
                            {canWrite && (
                                <Button size="compact-xs" variant="light" onClick={() => setStandingOpen(true)}>
                                    Add standing item
                                </Button>
                            )}
                        </Group>
                        <Text size="xs" c="dimmed" mb="xs">
                            The manually-added backlog — stays until explicitly closed. Drag to reorder.
                        </Text>
                        {agenda.standing.length === 0 ? (
                            <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-3">
                                None.
                            </div>
                        ) : (
                            <Stack gap="xs">{agenda.standing.map((i) => renderItemRow(i, agenda.standing, true))}</Stack>
                        )}
                    </div>
                </Stack>
            )}

            {/* Create meeting */}
            <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New PaPriCo meeting">
                <Stack gap="sm">
                    <TextInput
                        label="Meeting date"
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.currentTarget.value)}
                        required
                    />
                    <TextInput
                        label="Chair"
                        placeholder="defaults to you"
                        value={newChair}
                        onChange={(e) => setNewChair(e.currentTarget.value)}
                    />
                    <NumberInput
                        label="Meeting length (minutes)"
                        min={15}
                        max={480}
                        value={newLength}
                        onChange={setNewLength}
                    />
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateMeeting} loading={creating} disabled={!newDate}>
                            Create
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Add standing item */}
            <Modal opened={standingOpen} onClose={() => setStandingOpen(false)} title="Add standing item">
                <Stack gap="sm">
                    <TextInput
                        label="Title"
                        value={standingTitle}
                        onChange={(e) => setStandingTitle(e.currentTarget.value)}
                        required
                    />
                    <Textarea
                        label="Description"
                        value={standingDescription}
                        onChange={(e) => setStandingDescription(e.currentTarget.value)}
                        minRows={2}
                        autosize
                    />
                    <TextInput
                        label="Category"
                        placeholder="Pricing, Packaging, Naming, Forecasting, Process…"
                        value={standingCategory}
                        onChange={(e) => setStandingCategory(e.currentTarget.value)}
                    />
                    <Group justify="flex-end">
                        <Button variant="subtle" onClick={() => setStandingOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateStanding} loading={standingSaving} disabled={!standingTitle.trim()}>
                            Add
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Publish result: copyable Slack block */}
            <Modal opened={publishOpen} onClose={() => setPublishOpen(false)} title="Agenda published" size="lg">
                <Stack gap="sm">
                    <Text size="sm">
                        The agenda is frozen. Paste this into <b>#paprico</b>:
                    </Text>
                    <Textarea value={slackBlock} readOnly minRows={12} autosize styles={{ input: { fontFamily: "monospace", fontSize: 12 } }} />
                    <Group justify="flex-end">
                        <Button onClick={() => copyText(slackBlock)}>{copied ? "Copied!" : "Copy to clipboard"}</Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Minutes */}
            <Modal opened={minutesOpen} onClose={() => setMinutesOpen(false)} title="Meeting minutes" size="lg">
                {minutesLoading ? (
                    <div className="flex justify-center py-8"><Loader size="sm" /></div>
                ) : (
                    <Stack gap="sm">
                        <Textarea value={minutesMarkdown} readOnly minRows={16} autosize styles={{ input: { fontFamily: "monospace", fontSize: 12 } }} />
                        <Group justify="flex-end">
                            <Button variant="light" onClick={() => copyText(minutesMarkdown)}>{copied ? "Copied!" : "Copy markdown"}</Button>
                            <Button
                                onClick={() => {
                                    const blob = new Blob([minutesMarkdown], { type: "text/markdown" });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `paprico-minutes-${meeting?.meeting_date ?? "meeting"}.md`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                            >
                                Download
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <PapricoItemDetailDrawer
                itemId={detailItemId}
                meetingId={meeting?.id ?? null}
                canWrite={canWrite}
                onClose={() => setDetailItemId(null)}
                onChanged={refresh}
            />
        </div>
    );
}
