"use client";

import React, { useMemo } from "react";
import { Tooltip } from "@mantine/core";
import { scheduleState, tierAwareDueDate, type ScheduleState } from "@/lib/launchCriteria";

/**
 * Horizontal workback for one launch, modelled on the "CAPABILITIES LAUNCH -
 * DRAFT WORKBACK" swimlane in the GTM Motion Operating Playbook: artifacts
 * counted back from the release date, each occupying the span between where it
 * starts and where its successor picks up.
 *
 * A sibling to ReleaseStagesChart rather than an extension of it. That component
 * derives its dates from stage DURATIONS in business days, with buffers and
 * per-level overrides; a launch artifact already carries an explicit start (from
 * tier_offset_days) and an explicit due date (its successor's start), so there
 * is nothing to derive. The two share a visual language, not a data model.
 */

const TRACK_H = 10;
const ROW_H = 34;

export interface WorkbackItem {
    id: string;
    label: string;
    status: string;
    due_date: string | null;
    phase: string | null;
    sort_order: number;
    default_due_offset_days?: number | null;
    tier_offset_days?: Record<string, number> | null;
}

interface Props {
    items: WorkbackItem[];
    targetLaunchDate: string | null;
    tier: string | null;
    launchCreatedAt?: string | null;
    /** Defaults to today; injectable so the component stays testable. */
    today?: string;
}

const STATE_COLOR: Record<ScheduleState | "done", string> = {
    done: "var(--color-success-base, #16a765)",
    compressed: "var(--color-brass, #d59b2a)",
    late: "var(--color-error-base, #dc2626)",
    in_window: "var(--color-copper)",
    upcoming: "var(--color-gray-400)",
    no_date: "var(--color-gray-200)",
};

const STATE_LABEL: Record<ScheduleState | "done", string> = {
    done: "Delivered",
    compressed: "Compressed — the window closed before this launch existed",
    late: "Overdue",
    in_window: "In progress window",
    upcoming: "Not started yet",
    no_date: "No date set",
};

function toDate(d: string): number {
    return new Date(`${d}T00:00:00Z`).getTime();
}

function fmt(d: string | null): string {
    if (!d) return "—";
    try {
        return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
        return d;
    }
}

export function LaunchWorkbackTimeline({
    items,
    targetLaunchDate,
    tier,
    launchCreatedAt,
    today,
}: Props) {
    const todayStr = today ?? new Date().toISOString().slice(0, 10);

    const rows = useMemo(() => {
        if (!targetLaunchDate) return [];
        return items
            .map((it) => {
                const start = tierAwareDueDate(
                    targetLaunchDate,
                    {
                        default_due_offset_days: it.default_due_offset_days ?? null,
                        tier_offset_days: it.tier_offset_days ?? null,
                    },
                    tier
                );
                if (!start || !it.due_date) return null;
                const state: ScheduleState | "done" =
                    it.status === "DONE"
                        ? "done"
                        : scheduleState({
                              startDate: start,
                              dueDate: it.due_date,
                              today: todayStr,
                              launchCreatedAt: launchCreatedAt ?? null,
                          });
                return { ...it, start, due: it.due_date, state };
            })
            .filter(Boolean) as Array<
            WorkbackItem & { start: string; due: string; state: ScheduleState | "done" }
        >;
    }, [items, targetLaunchDate, tier, launchCreatedAt, todayStr]);

    if (!targetLaunchDate) {
        return (
            <p className="text-xs text-gray-400">
                Set a target launch date to see the workback.
            </p>
        );
    }
    if (rows.length === 0) {
        return <p className="text-xs text-gray-400">No dated artifacts on this launch yet.</p>;
    }

    // The window spans the earliest start through GA, widened to include today
    // when the launch is already behind us — otherwise the marker has nowhere to sit.
    const starts = rows.map((r) => toDate(r.start));
    const min = Math.min(...starts, toDate(todayStr));
    const max = Math.max(toDate(targetLaunchDate), toDate(todayStr));
    const span = Math.max(max - min, 1);
    const pct = (d: string) => ((toDate(d) - min) / span) * 100;

    return (
        <div>
            <div className="flex items-center gap-4 mb-3 text-[11px] text-gray-500">
                {(["done", "in_window", "compressed", "late", "upcoming"] as const).map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                        <span
                            style={{
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                backgroundColor: STATE_COLOR[s],
                                display: "inline-block",
                            }}
                        />
                        {s === "in_window" ? "In window" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </span>
                ))}
            </div>

            <div className="relative" style={{ paddingBottom: 22 }}>
                {rows.map((r) => {
                    const left = pct(r.start);
                    const right = pct(r.due);
                    // A zero-length window (a point-in-time sign-off, e.g. two
                    // gates signed at one sitting) still needs to be visible.
                    const width = Math.max(right - left, 1.2);
                    return (
                        <div key={r.id} className="relative" style={{ height: ROW_H }}>
                            <div
                                className="absolute text-xs text-gray-600 truncate"
                                style={{ left: 0, top: 0, width: 190 }}
                                title={r.label}
                            >
                                {r.label}
                            </div>
                            <div
                                className="absolute"
                                style={{ left: 200, right: 0, top: 4, height: TRACK_H }}
                            >
                                <div
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        height: TRACK_H,
                                        backgroundColor: "var(--color-gray-100)",
                                        borderRadius: TRACK_H,
                                    }}
                                />
                                <Tooltip
                                    withArrow
                                    position="top"
                                    label={`${r.label} — ${STATE_LABEL[r.state]}. Starts ${fmt(r.start)}, due ${fmt(r.due)}.`}
                                >
                                    <div
                                        style={{
                                            position: "absolute",
                                            left: `${left}%`,
                                            width: `${width}%`,
                                            height: TRACK_H,
                                            backgroundColor: STATE_COLOR[r.state],
                                            borderRadius: TRACK_H,
                                            cursor: "default",
                                        }}
                                    />
                                </Tooltip>
                            </div>
                        </div>
                    );
                })}

                {/* TODAY marker, spanning the rows */}
                <div
                    className="absolute"
                    style={{ left: 200, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}
                >
                    <div
                        style={{
                            position: "absolute",
                            left: `${pct(todayStr)}%`,
                            top: 0,
                            bottom: 18,
                            width: 1.5,
                            backgroundColor: "var(--color-copper)",
                        }}
                    />
                    <div
                        className="absolute text-[10px] font-medium"
                        style={{
                            left: `${pct(todayStr)}%`,
                            bottom: 0,
                            transform: "translateX(-50%)",
                            color: "var(--color-copper)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        Today
                    </div>
                    {/* GA marker */}
                    <div
                        style={{
                            position: "absolute",
                            left: `${pct(targetLaunchDate)}%`,
                            top: 0,
                            bottom: 18,
                            width: 1.5,
                            backgroundColor: "var(--color-cast-iron)",
                        }}
                    />
                    <div
                        className="absolute text-[10px] font-medium"
                        style={{
                            left: `${pct(targetLaunchDate)}%`,
                            bottom: 0,
                            transform: "translateX(-50%)",
                            color: "var(--color-cast-iron)",
                            whiteSpace: "nowrap",
                        }}
                    >
                        GA {fmt(targetLaunchDate)}
                    </div>
                </div>
            </div>
        </div>
    );
}
