"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { UserDisplay } from "@/components/UserDisplay";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canRolesPerform } from "@/lib/permissions";
import { formatDateOnlyForDisplay, getCalendarDateStringInTimeZone } from "@/lib/date-utils";
import { agendaGroupTitle, groupAgendaItemsByEpic, PAPRICO_TIMEZONE } from "@/lib/paprico/agenda";
import type { NextCalendarEvent } from "@/lib/google/calendar";
import type {
    AgendaEpicGroup,
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

/** Column header style, matching LaunchChecklistTable and the epic criteria matrix. */
const TH: CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6B7280",
};

const EMPTY_STATE_TEXT = "Nothing open.";

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
    const [calendarSuggestion, setCalendarSuggestion] = useState<NextCalendarEvent | null>(null);
    const [calendarUnavailable, setCalendarUnavailable] = useState<string | null>(null);

    const [standingOpen, setStandingOpen] = useState(false);
    const [standingTitle, setStandingTitle] = useState("");
    const [standingDescription, setStandingDescription] = useState("");
    const [standingCategory, setStandingCategory] = useState("");
    const [standingSaving, setStandingSaving] = useState(false);
    // Assignable people for the Accountable column. The agenda sync picks an
    // owner (criterion decision owner -> epic owner -> none) but nothing could
    // change it afterwards, so an item assigned to the wrong person stayed that
    // way. /api/users is role-gated and may 403 for a chair, so a failure just
    // leaves the column read-only rather than breaking the agenda.
    const [assignableUsers, setAssignableUsers] = useState<Array<{ value: string; label: string }> | null>(null);

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

    // Calendar suggestion, fetched on page load: it drives the "Start next
    // meeting prep" banner when no meeting exists yet, and pre-fills the New
    // Meeting form. Silently absent when Google isn't connected or no PaPriCo
    // event is found.
    useEffect(() => {
        let stale = false;
        (async () => {
            try {
                const res = await fetch("/api/paprico/next-calendar-meeting");
                if (!res.ok) {
                    if (!stale) setCalendarUnavailable(`request failed (HTTP ${res.status})`);
                    return;
                }
                const body = await res.json();
                if (stale) return;
                if (body.found) {
                    setCalendarSuggestion(body.event as NextCalendarEvent);
                    setCalendarUnavailable(null);
                } else if (body.reason !== "no_matching_event") {
                    // Config problems (not connected, missing scope, API disabled)
                    // should diagnose themselves for the people who can fix them.
                    setCalendarUnavailable(
                        `${body.reason ?? "unknown"}${body.detail ? ` — ${body.detail}` : ""}`
                    );
                }
            } catch {
                // No suggestion is fine; the form works without one.
            }
        })();
        return () => {
            stale = true;
        };
    }, []);

    const suggestionDateYmd = useMemo(() => {
        if (!calendarSuggestion) return null;
        return calendarSuggestion.all_day
            ? calendarSuggestion.start
            : getCalendarDateStringInTimeZone(PAPRICO_TIMEZONE, new Date(calendarSuggestion.start));
    }, [calendarSuggestion]);

    const applyCalendarSuggestion = () => {
        if (!calendarSuggestion || !suggestionDateYmd) return;
        setNewDate(suggestionDateYmd);
        if (calendarSuggestion.duration_minutes) setNewLength(calendarSuggestion.duration_minutes);
    };

    const calendarSuggestionLabel = (() => {
        if (!calendarSuggestion) return null;
        if (calendarSuggestion.all_day) return formatDateOnlyForDisplay(calendarSuggestion.start);
        return new Date(calendarSuggestion.start).toLocaleString("en-US", {
            timeZone: PAPRICO_TIMEZONE,
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
        });
    })();

    const refresh = useCallback(() => {
        if (selectedMeetingId) void loadAgenda(selectedMeetingId);
        void loadMeetings();
    }, [selectedMeetingId, loadAgenda, loadMeetings]);

    // "Start next meeting prep" banner: shown when the calendar knows the next
    // committee meeting but no prep exists for it — no open (draft/published)
    // meeting, and no meeting row already on that date. One click creates the
    // meeting with the calendar's date and length.
    const hasOpenMeeting = meetings.some((m) => m.status === "draft" || m.status === "agenda_published");
    const hasMeetingForSuggestedDate =
        !!suggestionDateYmd && meetings.some((m) => String(m.meeting_date).split("T")[0] === suggestionDateYmd);
    const showPrepBanner =
        !loading && canWrite && !!calendarSuggestion && !!suggestionDateYmd && !hasOpenMeeting && !hasMeetingForSuggestedDate;
    const [startingPrep, setStartingPrep] = useState(false);

    const handleStartPrep = async () => {
        if (!calendarSuggestion || !suggestionDateYmd) return;
        setStartingPrep(true);
        try {
            const res = await fetch("/api/paprico/meetings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    meeting_date: suggestionDateYmd,
                    meeting_length_minutes: calendarSuggestion.duration_minutes ?? 60,
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                setError(body.error || "Failed to create meeting");
                return;
            }
            await loadMeetings();
            setSelectedMeetingId(body.meeting.id);
            await loadAgenda(body.meeting.id);
        } finally {
            setStartingPrep(false);
        }
    };

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
    // An item with no time box contributes zero minutes, so the total on its own
    // reads as spare capacity when it is really an unknown. Show the count next
    // to it rather than folding a guess into the number.
    const unbudgetedCount = agenda?.unbudgeted_item_count ?? 0;

    useEffect(() => {
        if (!canWrite) return;
        let cancelled = false;
        void fetch("/api/users", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((body) => {
                if (cancelled || !body?.users) return;
                const opts = (body.users as Array<Record<string, unknown>>)
                    .filter((u) => u.email && u.is_active !== false)
                    .map((u) => {
                        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
                        return { value: String(u.email), label: name || String(u.email) };
                    });
                setAssignableUsers(opts);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [canWrite]);

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Loader />
            </div>
        );
    }

    // `nested` = rendered inside an epic group, where the epic name, tier,
    // release and owner already sit on the group header. Repeating them on every
    // criterion row is what made one epic read as three separate topics.
    // One row per criterion, in the column shape the launch checklist and the
    // epic criteria matrix already use (LaunchChecklistTable.tsx). The agenda
    // used to stack "label: value" lines per item, which is why it read as a
    // wall of text next to every other criteria surface in the app.
    const renderCriterionRow = (
        item: AgendaItem,
        section: AgendaItem[],
        draggable: boolean,
        opts: { nested?: boolean; groupBand?: UrgencyBand | null } = {}
    ) => {
        const { nested = false, groupBand = null } = opts;
        const live = liveStatus[item.id];
        const status = live?.status ?? item.status;
        const overdue = item.days_to_stage != null && item.days_to_stage < 0;
        return (
            <tr
                key={item.id}
                draggable={canWrite && draggable}
                onDragStart={() => setDraggedItemId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void handleDrop(item.id, section)}
                className={`border-b border-gray-100 hover:bg-gray-50/60 ${canWrite && draggable ? "cursor-grab" : ""}`}
            >
                <td className="px-4 py-3">
                    <div className={`flex items-start gap-2 ${nested ? "pl-4" : ""}`}>
                        {(!nested || item.band !== groupBand) && <BandBadge band={item.band} />}
                        <button
                            type="button"
                            className="text-sm text-left text-gray-900 hover:text-indigo-700"
                            onClick={() => setDetailItemId(item.id)}
                        >
                            {nested ? (item.criterion_label ?? item.title) : item.title}
                        </button>
                        {item.orphaned && <Badge variant="light" color="orange">orphaned</Badge>}
                    </div>
                    {!nested && item.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                    )}
                </td>

                <td className="px-4 py-3 align-middle" style={{ width: "132px" }}>
                    <ItemStatusBadge status={status} />
                </td>

                <td className="px-4 py-3 align-middle" style={{ width: "170px" }}>
                    {canWrite && assignableUsers ? (
                        <Select
                            size="xs"
                            searchable
                            clearable
                            placeholder="Unassigned"
                            aria-label={"Accountable for " + item.title}
                            data={assignableUsers}
                            value={item.owner_email}
                            onChange={(email) => {
                                if (email !== (item.owner_email ?? null)) {
                                    void patchItem(item.id, { owner_email: email });
                                }
                            }}
                        />
                    ) : item.owner_email ? (
                        <UserDisplay email={item.owner_email} size="xs" />
                    ) : (
                        <span className="text-xs text-gray-300">Unassigned</span>
                    )}
                </td>

                <td className="px-4 py-3 align-middle text-xs" style={{ width: "180px" }}>
                    {item.stage_date ? (
                        <>
                            <div className="text-gray-700">{formatDateOnlyForDisplay(item.stage_date)}</div>
                            <div className={overdue ? "text-red-600" : "text-gray-400"}>
                                {overdue
                                    ? `${-(item.days_to_stage as number)}d overdue`
                                    : `${item.days_to_stage}d out`}
                            </div>
                        </>
                    ) : (
                        // No target launch date on the epic, so no stage date derives.
                        <span className="text-gray-300">no date</span>
                    )}
                </td>

                <td className="px-4 py-3 align-middle" style={{ width: "110px" }}>
                    {canWrite ? (
                        <NumberInput
                            size="xs"
                            min={1}
                            max={480}
                            placeholder="min"
                            aria-label={`Time box minutes for ${item.title}`}
                            defaultValue={item.time_box_minutes ?? ""}
                            onBlur={(e) => {
                                const raw = e.currentTarget.value.replace(/[^0-9]/g, "");
                                const minutes = raw ? Math.min(480, Math.max(1, parseInt(raw, 10))) : null;
                                if (minutes !== (item.time_box_minutes ?? null)) {
                                    void patchItem(item.id, { time_box_minutes: minutes });
                                }
                            }}
                        />
                    ) : (
                        <span className="text-xs text-gray-500">
                            {item.time_box_minutes ? `${item.time_box_minutes} min` : "—"}
                        </span>
                    )}
                </td>

                <td className="px-4 py-3 align-middle" style={{ width: "190px" }}>
                    {canWrite && (
                        <div className="flex flex-wrap items-center gap-1">
                            {status === "proposed" && (
                                <Button size="compact-xs" variant="light" onClick={() => patchItem(item.id, { status: "on_agenda" })}>
                                    Add
                                </Button>
                            )}
                            {status === "on_agenda" && (
                                <Button size="compact-xs" variant="subtle" onClick={() => patchItem(item.id, { status: "proposed" })}>
                                    Remove
                                </Button>
                            )}
                            {(status === "deferred" || status === "blocked") && (
                                <Button size="compact-xs" variant="subtle" onClick={() => patchItem(item.id, { status: "proposed" })}>
                                    Reopen
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
                        </div>
                    )}
                </td>
            </tr>
        );
    };

    /** Banner row introducing one epic's criteria. */
    const renderEpicHeaderRow = (group: AgendaEpicGroup) => (
        <tr key={`${group.key}-head`} className="bg-gray-50/80 border-b border-gray-100">
            <td className="px-4 py-2" colSpan={6}>
                <div className="flex flex-wrap items-center gap-2">
                    <BandBadge band={group.band} />
                    <span className="font-medium text-sm text-gray-900">{agendaGroupTitle(group)}</span>
                    {group.tier && (
                        <Badge variant="outline" color="gray">{group.tier.replace("TIER_", "Tier ")}</Badge>
                    )}
                    <span className="text-xs text-gray-500">
                        {group.release_name}
                        {group.items.length > 1 && ` · ${group.items.length} open criteria`}
                    </span>
                </div>
            </td>
        </tr>
    );

    const renderSection = (
        title: string,
        subtitle: string,
        items: AgendaItem[],
        emptyText: string,
        draggable: boolean
    ) => {
        // Grouping is presentational: `items` stays the flat, already-sorted
        // section so drag-to-reorder still works off one list of item ids.
        const groups = groupAgendaItemsByEpic(items);
        return (
            <div>
                <Text fw={600} size="sm" mb={2}>{title}</Text>
                <Text size="xs" c="dimmed" mb="xs">
                    {subtitle}
                    {groups.length > 0 && <> · {items.length} criteria, {groups.length} epics</>}
                </Text>
                {items.length === 0 ? (
                    <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-3">
                        {emptyText}
                    </div>
                ) : (
                    <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white">
                        <table className="w-full">
                            <thead style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #E5E7EB" }}>
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium" style={TH}>Criterion</th>
                                    <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "132px" }}>Status</th>
                                    <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "170px" }}>Accountable</th>
                                    <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "180px" }}>Ready by</th>
                                    <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "110px" }}>Time box</th>
                                    <th className="px-4 py-3" style={{ ...TH, width: "190px" }} />
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((g) => {
                                    if (!g.epic_id) {
                                        return renderCriterionRow(g.items[0], items, draggable);
                                    }
                                    return (
                                        <Fragment key={g.key}>
                                            {renderEpicHeaderRow(g)}
                                            {g.items.map((i) =>
                                                renderCriterionRow(i, items, draggable, {
                                                    nested: true,
                                                    groupBand: g.band,
                                                })
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

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

            {showPrepBanner && (
                <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[260px]">
                        <Text fw={600} size="sm">
                            Next PaPriCo on your calendar: {calendarSuggestionLabel}
                            {calendarSuggestion?.duration_minutes ? ` (${calendarSuggestion.duration_minutes} min)` : ""}
                        </Text>
                        <Text size="xs" c="dimmed">
                            No prep exists for it yet — start one and the agenda assembles itself from open release criteria.
                        </Text>
                    </div>
                    <Button onClick={handleStartPrep} loading={startingPrep}>
                        Start next meeting prep
                    </Button>
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
                                <Tooltip
                                    label={
                                        unbudgetedCount > 0
                                            ? `Sum of item time boxes vs meeting length. ${unbudgetedCount} item${unbudgetedCount === 1 ? " has" : "s have"} no time box, so the total understates the meeting.`
                                            : "Sum of item time boxes vs meeting length"
                                    }
                                    withArrow
                                >
                                    <div>
                                        <Text fw={500} c={overTime ? "red" : undefined}>
                                            {agenda.total_time_box_minutes} / {meeting.meeting_length_minutes} min
                                            {overTime ? " — over" : ""}
                                        </Text>
                                        {unbudgetedCount > 0 && (
                                            <Text size="xs" c="orange.7" fw={500}>
                                                {unbudgetedCount} unbudgeted
                                            </Text>
                                        )}
                                    </div>
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
                            Owner and due date set, not yet complete.
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
                        "Stage date passed, or within 14 days.",
                        agenda.overdue_critical,
                        EMPTY_STATE_TEXT,
                        false
                    )}
                    {renderSection(
                        "3. Approaching",
                        "Inside the lookahead window.",
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
                            Added by hand. Stays until closed. Drag to reorder.
                        </Text>
                        {agenda.standing.length === 0 ? (
                            <div className="text-sm text-gray-500 border border-dashed border-gray-200 rounded-lg px-4 py-3">
                                None.
                            </div>
                        ) : (
                            <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white">
                                <table className="w-full">
                                    <thead style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #E5E7EB" }}>
                                        <tr>
                                            <th className="px-4 py-3 text-left font-medium" style={TH}>Topic</th>
                                            <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "132px" }}>Status</th>
                                            <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "170px" }}>Accountable</th>
                                            <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "180px" }} />
                                            <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "110px" }}>Time box</th>
                                            <th className="px-4 py-3" style={{ ...TH, width: "190px" }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {agenda.standing.map((i) => renderCriterionRow(i, agenda.standing, true))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </Stack>
            )}

            {/* Create meeting */}
            <Modal opened={createOpen} onClose={() => setCreateOpen(false)} title="New PaPriCo meeting">
                <Stack gap="sm">
                    {calendarSuggestion && (
                        <div className="text-sm bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                            <span>
                                Next on your calendar: <b>{calendarSuggestionLabel}</b>
                                {calendarSuggestion.duration_minutes ? ` (${calendarSuggestion.duration_minutes} min)` : ""}
                            </span>
                            <Button size="compact-xs" variant="light" onClick={applyCalendarSuggestion}>
                                Use this date
                            </Button>
                        </div>
                    )}
                    {!calendarSuggestion && calendarUnavailable && canWrite && (
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-words">
                            Calendar suggestion unavailable: {calendarUnavailable}
                        </div>
                    )}
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
