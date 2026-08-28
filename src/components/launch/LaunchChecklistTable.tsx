"use client";

import React from "react";
import { Tooltip } from "@mantine/core";
import { IconArrowsRightLeft, IconCheck, IconChevronRight, IconCircle, IconExternalLink, IconLink, IconLoader2, IconMessageCircle, IconX } from "@tabler/icons-react";
import { UserDisplay } from "@/components/UserDisplay";
import { isGating } from "@/lib/launch-readiness";
import { effectiveDueDate, runwayWasCompressed, scheduleState, tierAwareDueDate } from "@/lib/launchCriteria";

/**
 * The launch checklist, in the same table shape epics use for criteria
 * (see the criteria table in Matrix.tsx): a real thead with uppercase column
 * labels, an Accountable column carrying an avatar, and a due column.
 *
 * Kept as its own component rather than inline JSX on the detail page so the
 * launch and epic surfaces can be compared side by side.
 */

/**
 * NOT_APPLICABLE exists for the Beta proof gate, which is "if applicable". A
 * capability that runs no beta must be able to close the gate out rather than
 * carry it open forever once things depend on it.
 */
export type LaunchTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_APPLICABLE";

/** One checklist item inside a gate, each owned by its own function. */
export interface ChecklistItem {
    id: string;
    label: string;
    status: LaunchTaskStatus;
    owner_email: string | null;
    /** The accountable function, shown until a real person is assigned. */
    owner_role: string | null;
    description: string | null;
    optional: boolean;
    sort_order: number;
}

export interface ChecklistRow {
    id: string;
    criterion_id: string;
    status: LaunchTaskStatus;
    owner_email: string | null;
    due_date: string | null;
    notes: string | null;
    links: unknown;
    /** Items inside this gate. A gate with items is not voted on directly. */
    items?: ChecklistItem[];
    /**
     * 'items' when the gate's status comes from the checklist items inside it,
     * 'direct' when it is ticked here. Only 'direct' rows are editable.
     */
    status_source?: "items" | "direct";
    criterion: {
        id: string;
        label: string;
        description: string | null;
        phase: string | null;
        gate: boolean | string | null;
        sort_order: number;
        default_due_offset_days?: number | null;
        tier_offset_days?: Record<string, number> | null;
    };
}

export interface ChecklistUser {
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    avatar_url?: string | null;
}

/**
 * Which field the detail modal opens focused on. The inline cells each name
 * their own, so one panel serves what used to be three modals -- the same shape
 * as CommentsModal's initialTab on the epic readiness table.
 */
export type LaunchCriterionDetailSection = "note" | "assignee" | "links";

interface Props {
    rows: ChecklistRow[];
    users: ChecklistUser[];
    targetLaunchDate: string | null;
    tier: string | null;
    launchCreatedAt?: string | null;
    canEdit: boolean;
    busyId: string | null;
    onCycleStatus: (row: ChecklistRow) => void;
    /** Tick one checklist item inside a gate. Omit to render items read-only. */
    onCycleItem?: (row: ChecklistRow, item: ChecklistItem) => void;
    /**
     * Open the row's detail panel. Replaces the separate onAssign/onEditLinks/
     * onEditNotes callbacks, which opened three different modals from three
     * different cells with no row-level way in at all.
     */
    onOpenDetail: (row: ChecklistRow, section: LaunchCriterionDetailSection) => void;
}

const TH: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6B7280",
};

export function asLinkList(raw: unknown): Array<{ url: string; label?: string }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{ url: string; label?: string }> = [];
    for (const entry of raw) {
        if (typeof entry === "string") {
            out.push({ url: entry });
            continue;
        }
        if (entry && typeof entry === "object") {
            const rec = entry as Record<string, unknown>;
            if (typeof rec.url === "string") {
                out.push({
                    url: rec.url,
                    ...(typeof rec.label === "string" ? { label: rec.label } : {}),
                });
            }
        }
    }
    return out;
}

function formatDate(d: string | null): string {
    if (!d) return "—";
    try {
        return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
        return d;
    }
}

function statusIcon(status: LaunchTaskStatus) {
    if (status === "DONE") return <IconCheck size={16} className="text-emerald-600" />;
    if (status === "IN_PROGRESS") return <IconLoader2 size={16} className="text-amber-500" />;
    if (status === "NOT_APPLICABLE") return <IconX size={16} className="text-gray-300" />;
    return <IconCircle size={16} className="text-gray-300" />;
}

/** Why a status cannot be edited on this row, or null when it can. */
function derivedReason(row: ChecklistRow): string | null {
    if (row.status_source === "items") {
        const items = row.items || [];
        const done = items.filter((i) => i.status === "DONE").length;
        const applicable = items.filter((i) => i.status !== "NOT_APPLICABLE").length;
        return `Derived from ${done}/${applicable} checklist items below — tick those, not this.`;
    }
    return null;
}

/**
 * The stored due_date is when the artifact must be COMPLETE (its successor's
 * start); tier_offset_days is when it must BEGIN. A release that lands closer
 * than the tier's runway needs is compressed and already under way -- the
 * artifact predates the window rather than being missed -- so it must not read
 * as overdue while its fair window from launch creation is still open. Past
 * that, it is overdue, and the cell says so while still naming the compression
 * as the reason the dates were never achievable.
 */
function dueCell(
    row: ChecklistRow,
    targetLaunchDate: string | null,
    tier: string | null,
    launchCreatedAt: string | null | undefined
): { text: string; className: string; title: string } {
    const start = tierAwareDueDate(
        targetLaunchDate,
        {
            default_due_offset_days: row.criterion?.default_due_offset_days ?? null,
            tier_offset_days: row.criterion?.tier_offset_days ?? null,
        },
        tier
    );
    const due = formatDate(row.due_date);
    const starts = start ? formatDate(start) : "—";

    if (row.status === "DONE") {
        return { text: due, className: "text-gray-400", title: "Complete" };
    }
    if (row.status === "NOT_APPLICABLE") {
        // Nothing to be late for. Dates on an inapplicable row are noise.
        return { text: "—", className: "text-gray-300", title: "Does not apply to this launch" };
    }
    const window = {
        startDate: start,
        dueDate: row.due_date,
        launchCreatedAt: launchCreatedAt ?? null,
        targetLaunchDate,
    };
    const state = scheduleState({ ...window, today: new Date().toISOString().slice(0, 10) });
    const effective = effectiveDueDate(window);
    const compressed = runwayWasCompressed(window);
    switch (state) {
        case "compressed":
            return {
                text: `${due} · compressed`,
                className: "text-amber-600",
                title: `Due to start ${starts}, before this launch existed. The release landed closer than the tier's runway needs, so the sequence is compressed rather than missed${
                    effective && effective !== row.due_date ? ` — due ${formatDate(effective)}` : ""
                }.`,
            };
        case "late":
            return {
                text: `${due} · overdue`,
                className: "text-red-600",
                title: compressed
                    ? `The runway never fit (due to start ${starts}, before this launch existed), but the window allowed from launch creation closed ${
                          effective ? formatDate(effective) : "already"
                      }.`
                    : `Should have started ${starts}`,
            };
        case "upcoming":
            return { text: due, className: "text-gray-400", title: `Starts ${starts}` };
        case "in_window":
            return { text: due, className: "text-gray-700", title: `Started ${starts}` };
        default:
            return { text: "—", className: "text-gray-300", title: "No date set" };
    }
}

export function LaunchChecklistTable({
    rows,
    users,
    targetLaunchDate,
    tier,
    launchCreatedAt,
    canEdit,
    busyId,
    onCycleStatus,
    onCycleItem,
    onOpenDetail,
}: Props) {
    const userFor = (email: string | null) =>
        email ? users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) : undefined;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full table-fixed w-full" style={{ borderCollapse: "collapse", minWidth: "900px" }}>
                <thead style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #E5E7EB" }}>
                    <tr>
                        <th className="px-4 py-3 text-left font-medium" style={TH}>Task</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "90px" }}>Status</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "170px" }}>Accountable</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "150px" }}>Due On</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "150px" }}>Links</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "140px" }}>Notes</th>
                        <th className="px-4 py-3" style={{ ...TH, width: "44px" }}>
                            <span className="sr-only">Open details</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const links = asLinkList(row.links);
                        const owner = userFor(row.owner_email);
                        const due = dueCell(row, targetLaunchDate, tier, launchCreatedAt);
                        const items = [...(row.items || [])].sort(
                            (a, b) => a.sort_order - b.sort_order
                        );
                        const reason = derivedReason(row);
                        return (
                            <React.Fragment key={row.criterion_id}>
                            <tr className="border-b border-gray-100 hover:bg-gray-50/60">
                                <td className="px-4 py-3">
                                    <div className="flex items-start gap-2">
                                        <span
                                            className={`text-sm ${
                                                row.status === "DONE" || row.status === "NOT_APPLICABLE"
                                                    ? "text-gray-400 line-through"
                                                    : "text-gray-900"
                                            }`}
                                        >
                                            {row.criterion?.label}
                                        </span>
                                        {isGating(row.criterion?.gate) && (
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500 bg-red-50 px-1.5 py-0.5 rounded flex-shrink-0">
                                                Gate
                                            </span>
                                        )}
                                    </div>
                                    {row.criterion?.description && (
                                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">
                                            {row.criterion.description}
                                        </p>
                                    )}
                                </td>

                                <td className="px-4 py-3 align-middle" style={{ width: "90px" }}>
                                    <button
                                        type="button"
                                        onClick={() => onCycleStatus(row)}
                                        disabled={!canEdit || busyId === row.criterion_id}
                                        className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-50"
                                        title={
                                            reason
                                                ? `${row.status.replace(/_/g, " ")} — ${reason}`
                                                : `${row.status.replace(/_/g, " ")} — click to cycle`
                                        }
                                    >
                                        {statusIcon(row.status)}
                                    </button>
                                </td>

                                <td className="px-4 py-3 align-middle" style={{ width: "170px" }}>
                                    {owner || row.owner_email ? (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="min-w-0 flex-1">
                                                <UserDisplay
                                                    email={row.owner_email}
                                                    firstName={owner?.first_name}
                                                    lastName={owner?.last_name}
                                                    avatarUrl={owner?.avatar_url}
                                                    size="xs"
                                                />
                                            </div>
                                            {canEdit && (
                                                <Tooltip label="Reassign" position="top" withArrow>
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenDetail(row, "assignee")}
                                                        className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
                                                    >
                                                        <IconArrowsRightLeft size={14} />
                                                    </button>
                                                </Tooltip>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-500">-</span>
                                            {canEdit && (
                                                <Tooltip label="Assign this task" position="top" withArrow>
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenDetail(row, "assignee")}
                                                        className="p-1 rounded hover:bg-gray-100 text-gray-600"
                                                    >
                                                        <IconArrowsRightLeft size={16} />
                                                    </button>
                                                </Tooltip>
                                            )}
                                        </div>
                                    )}
                                </td>

                                <td className="px-4 py-3 text-sm align-middle" style={{ width: "150px" }}>
                                    <span className={due.className} title={due.title}>
                                        {due.text}
                                    </span>
                                </td>

                                <td className="px-4 py-3 text-sm align-middle" style={{ width: "150px" }}>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        {links.map((l, i) => (
                                            <a
                                                key={i}
                                                href={l.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-purple-600 hover:underline flex items-center gap-1 truncate"
                                                title={l.url}
                                            >
                                                <IconExternalLink size={12} className="flex-shrink-0" />
                                                <span className="truncate">{l.label || "Link"}</span>
                                            </a>
                                        ))}
                                        {canEdit && (
                                            <Tooltip label={links.length ? "Edit links" : "Add a link"} position="top" withArrow>
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenDetail(row, "links")}
                                                    className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
                                                >
                                                    <IconLink size={14} />
                                                </button>
                                            </Tooltip>
                                        )}
                                        {!canEdit && links.length === 0 && (
                                            <span className="text-sm text-gray-500">-</span>
                                        )}
                                    </div>
                                </td>

                                <td className="px-4 py-3 text-sm align-middle" style={{ width: "140px" }}>
                                    {canEdit ? (
                                        <button
                                            type="button"
                                            onClick={() => onOpenDetail(row, "note")}
                                            className="flex items-center gap-1 min-w-0 text-left w-full group"
                                            title={row.notes || "Add a note"}
                                        >
                                            {row.notes ? (
                                                <>
                                                    <IconMessageCircle size={14} className="text-purple-600 flex-shrink-0" />
                                                    <span className="truncate text-gray-600">{row.notes}</span>
                                                </>
                                            ) : (
                                                <span className="text-gray-400 group-hover:text-purple-600">Add a note</span>
                                            )}
                                        </button>
                                    ) : row.notes ? (
                                        <span className="truncate block text-gray-600" title={row.notes}>
                                            {row.notes}
                                        </span>
                                    ) : (
                                        <span className="text-sm text-gray-500">-</span>
                                    )}
                                </td>

                                {/* Same gesture the epic readiness row uses: the
                                    chevron opens the row's details. Rendered even
                                    without edit rights, so a long note stays
                                    readable. */}
                                <td className="px-4 py-3 align-middle" style={{ width: "44px" }}>
                                    <button
                                        type="button"
                                        onClick={() => onOpenDetail(row, "note")}
                                        className="text-gray-400 hover:text-gray-600 transition-colors"
                                        title="Open details"
                                        aria-label={`Open details for ${row.criterion?.label ?? "this task"}`}
                                    >
                                        <IconChevronRight size={20} />
                                    </button>
                                </td>
                            </tr>

                            {/* Checklist items. A gate is a set of items owned by
                                different functions -- the Beta gate alone spans PM,
                                SE, UX, PMM and RevOps -- so these are what people
                                actually tick. The gate row above is derived. */}
                            {items.map((item) => {
                                const itemOwner = userFor(item.owner_email);
                                const settled =
                                    item.status === "DONE" || item.status === "NOT_APPLICABLE";
                                return (
                                    <tr
                                        key={item.id}
                                        className="border-b border-gray-100 bg-gray-50/40"
                                    >
                                        <td className="px-4 py-2 pl-10">
                                            <div className="flex items-start gap-2">
                                                <span
                                                    className={`text-[13px] ${
                                                        settled
                                                            ? "text-gray-400 line-through"
                                                            : "text-gray-700"
                                                    }`}
                                                    title={item.description || undefined}
                                                >
                                                    {item.label}
                                                </span>
                                                {item.optional && (
                                                    <span className="text-[10px] uppercase tracking-wider text-gray-400 flex-shrink-0 mt-0.5">
                                                        Optional
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 align-middle" style={{ width: "90px" }}>
                                            <button
                                                type="button"
                                                disabled={!canEdit || !onCycleItem}
                                                onClick={() => onCycleItem?.(row, item)}
                                                className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-50"
                                                title={`${item.status.replace(/_/g, " ")} - click to cycle`}
                                            >
                                                {statusIcon(item.status)}
                                            </button>
                                        </td>
                                        <td className="px-4 py-2 align-middle" style={{ width: "170px" }}>
                                            {item.owner_email ? (
                                                <UserDisplay
                                                    email={item.owner_email}
                                                    firstName={itemOwner?.first_name}
                                                    lastName={itemOwner?.last_name}
                                                    size="xs"
                                                />
                                            ) : (
                                                // The accountable FUNCTION, when no
                                                // person is assigned yet. Better than
                                                // a dash: it says who this is waiting on.
                                                <span className="text-[11px] uppercase tracking-wider text-gray-500">
                                                    {item.owner_role || "-"}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2" style={{ width: "150px" }} />
                                        <td className="px-4 py-2" style={{ width: "150px" }} />
                                        <td className="px-4 py-2" style={{ width: "140px" }} />
                                        <td className="px-4 py-2" style={{ width: "44px" }} />
                                    </tr>
                                );
                            })}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
