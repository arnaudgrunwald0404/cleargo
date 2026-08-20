"use client";

import React from "react";
import { Tooltip } from "@mantine/core";
import { IconArrowsRightLeft, IconCheck, IconCircle, IconExternalLink, IconLink, IconLoader2 } from "@tabler/icons-react";
import { UserDisplay } from "@/components/UserDisplay";
import { isGating } from "@/lib/launch-readiness";
import { scheduleState, tierAwareDueDate } from "@/lib/launchCriteria";

/**
 * The launch checklist, in the same table shape epics use for criteria
 * (see the criteria table in Matrix.tsx): a real thead with uppercase column
 * labels, an Accountable column carrying an avatar, and a due column.
 *
 * Kept as its own component rather than inline JSX on the detail page so the
 * launch and epic surfaces can be compared side by side.
 */

export type LaunchTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

export interface ChecklistRow {
    id: string;
    criterion_id: string;
    status: LaunchTaskStatus;
    owner_email: string | null;
    due_date: string | null;
    links: unknown;
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

interface Props {
    rows: ChecklistRow[];
    users: ChecklistUser[];
    targetLaunchDate: string | null;
    tier: string | null;
    launchCreatedAt?: string | null;
    canEdit: boolean;
    busyId: string | null;
    onCycleStatus: (row: ChecklistRow) => void;
    onAssign: (row: ChecklistRow) => void;
    onEditLinks: (row: ChecklistRow) => void;
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
    return <IconCircle size={16} className="text-gray-300" />;
}

/**
 * The stored due_date is when the artifact must be COMPLETE (its successor's
 * start); tier_offset_days is when it must BEGIN. A release that lands closer
 * than the tier's runway needs is compressed and already under way -- the
 * artifact predates the window rather than being missed -- so it must not read
 * as overdue.
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
    const state = scheduleState({
        startDate: start,
        dueDate: row.due_date,
        today: new Date().toISOString().slice(0, 10),
        launchCreatedAt: launchCreatedAt ?? null,
    });
    switch (state) {
        case "compressed":
            return {
                text: `${due} · compressed`,
                className: "text-amber-600",
                title: `Due to start ${starts}, before this launch existed. The release landed closer than the tier's runway needs, so the sequence is compressed rather than missed.`,
            };
        case "late":
            return { text: `${due} · overdue`, className: "text-red-600", title: `Should have started ${starts}` };
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
    onAssign,
    onEditLinks,
}: Props) {
    const userFor = (email: string | null) =>
        email ? users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) : undefined;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full table-fixed w-full" style={{ borderCollapse: "collapse", minWidth: "760px" }}>
                <thead style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #E5E7EB" }}>
                    <tr>
                        <th className="px-4 py-3 text-left font-medium" style={TH}>Task</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "90px" }}>Status</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "170px" }}>Accountable</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "150px" }}>Due On</th>
                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH, width: "150px" }}>Links</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const links = asLinkList(row.links);
                        const owner = userFor(row.owner_email);
                        const due = dueCell(row, targetLaunchDate, tier, launchCreatedAt);
                        return (
                            <tr key={row.criterion_id} className="border-b border-gray-100 hover:bg-gray-50/60">
                                <td className="px-4 py-3">
                                    <div className="flex items-start gap-2">
                                        <span
                                            className={`text-sm ${row.status === "DONE" ? "text-gray-400 line-through" : "text-gray-900"}`}
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
                                        title={`${row.status.replace(/_/g, " ")} — click to cycle`}
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
                                                        onClick={() => onAssign(row)}
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
                                                        onClick={() => onAssign(row)}
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
                                                    onClick={() => onEditLinks(row)}
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
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
