"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PurpleLoader } from "@/components/PurpleLoader";
import {
    IconArrowLeft,
    IconCheck,
    IconCircle,
    IconLoader2,
    IconChevronDown,
    IconChevronRight,
} from "@tabler/icons-react";
import { getEpicDisplayName } from "@/lib/epicDisplayName";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

interface CriterionStatus {
    id: string;
    launch_id: string;
    criterion_id: string;
    status: TaskStatus;
    owner_email: string | null;
    due_date: string | null;
    notes: string | null;
    links: any;
    criterion: {
        id: string;
        label: string;
        description: string | null;
        phase: string | null;
        gate: string | null;
        sort_order: number;
    };
}

interface LaunchData {
    id: string;
    name: string;
    target_launch_date: string | null;
    readiness_pct: number;
    status: string;
}

interface EpicData {
    id: string;
    name: string;
    tier: string;
    status: string;
    target_launch_date: string | null;
    risk_level: string | null;
    readiness_status: string | null;
    aha_fields?: Record<string, any> | null;
}

function formatDate(d: string | null): string {
    if (!d) return "—";
    try {
        return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    } catch {
        return d;
    }
}

function statusIcon(status: TaskStatus) {
    if (status === "DONE")
        return <IconCheck size={16} className="text-emerald-600" />;
    if (status === "IN_PROGRESS")
        return <IconLoader2 size={16} className="text-amber-500" />;
    return <IconCircle size={16} className="text-gray-300" />;
}

const STATUS_CYCLE: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE"];

export default function GTMLaunchDetailPage() {
    const params = useParams();
    const router = useRouter();
    const launchRef = decodeURIComponent((params.ref as string) || "");

    const [launch, setLaunch] = useState<LaunchData | null>(null);
    const [statuses, setStatuses] = useState<CriterionStatus[]>([]);
    const [epics, setEpics] = useState<EpicData[]>([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/gtm-launches/${encodeURIComponent(launchRef)}`
            );
            if (res.ok) {
                const data = await res.json();
                setLaunch(data.launch);
                setStatuses(data.statuses || []);
                setEpics(data.epics || []);
            }
        } catch (err) {
            console.error("Failed to fetch launch detail:", err);
        } finally {
            setLoading(false);
        }
    }, [launchRef]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const phases = useMemo(() => {
        const map = new Map<string, CriterionStatus[]>();
        for (const s of statuses) {
            const phase = s.criterion?.phase || "Uncategorized";
            const list = map.get(phase) || [];
            list.push(s);
            map.set(phase, list);
        }
        // Sort within each phase by sort_order
        for (const [, items] of map) {
            items.sort(
                (a, b) =>
                    (a.criterion?.sort_order ?? 0) - (b.criterion?.sort_order ?? 0)
            );
        }
        return map;
    }, [statuses]);

    const handleToggleStatus = useCallback(
        async (criterionId: string, currentStatus: TaskStatus) => {
            if (!launch) return;
            const nextIdx =
                (STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length;
            const nextStatus = STATUS_CYCLE[nextIdx];

            setUpdating(criterionId);

            // Optimistic update
            setStatuses((prev) =>
                prev.map((s) =>
                    s.criterion_id === criterionId
                        ? { ...s, status: nextStatus }
                        : s
                )
            );

            try {
                const res = await fetch(
                    `/api/launch-criteria-status/${launch.id}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            criterion_id: criterionId,
                            status: nextStatus,
                        }),
                    }
                );
                if (!res.ok) {
                    // Revert on error
                    setStatuses((prev) =>
                        prev.map((s) =>
                            s.criterion_id === criterionId
                                ? { ...s, status: currentStatus }
                                : s
                        )
                    );
                } else {
                    // Update readiness
                    setLaunch((prev) => {
                        if (!prev) return prev;
                        const all = statuses.map((s) =>
                            s.criterion_id === criterionId
                                ? { status: nextStatus }
                                : { status: s.status }
                        );
                        const done = all.filter(
                            (s) => s.status === "DONE"
                        ).length;
                        return {
                            ...prev,
                            readiness_pct: Math.round(
                                (done / all.length) * 100
                            ),
                        };
                    });
                }
            } catch {
                setStatuses((prev) =>
                    prev.map((s) =>
                        s.criterion_id === criterionId
                            ? { ...s, status: currentStatus }
                            : s
                    )
                );
            } finally {
                setUpdating(null);
            }
        },
        [launch, statuses]
    );

    const togglePhase = (phase: string) => {
        setCollapsedPhases((prev) => {
            const next = new Set(prev);
            if (next.has(phase)) next.delete(phase);
            else next.add(phase);
            return next;
        });
    };

    const readinessPct = launch?.readiness_pct ?? 0;
    const doneCount = statuses.filter((s) => s.status === "DONE").length;

    if (loading) {
        return (
            <main className="min-h-screen" style={{ background: "var(--color-platinum)" }}>
                <div className="flex items-center justify-center py-24 gap-2 text-gray-500">
                    <PurpleLoader size="sm" />
                    <span>Loading launch...</span>
                </div>
            </main>
        );
    }

    if (!launch) {
        return (
            <main className="min-h-screen" style={{ background: "var(--color-platinum)" }}>
                <div className="text-center py-24">
                    <p className="text-gray-500">Launch not found.</p>
                    <Link
                        href="/gtm-launches"
                        className="text-indigo-600 hover:underline text-sm mt-2 inline-block"
                    >
                        Back to GTM Launches
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen" style={{ background: "var(--color-platinum)" }}>
            <div
                style={{
                    maxWidth: "var(--page-container-max-width)",
                    margin: "0 auto",
                    paddingLeft: "var(--page-container-padding-x)",
                    paddingRight: "var(--page-container-padding-x)",
                    paddingTop: "var(--page-container-padding-top)",
                    paddingBottom: "var(--spacing-8)",
                }}
            >
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={() => router.push("/gtm-launches")}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3 transition-colors"
                    >
                        <IconArrowLeft size={16} />
                        Back to GTM Launches
                    </button>

                    <div className="flex items-start justify-between flex-wrap gap-4">
                        <div>
                            <h1
                                className="text-2xl font-bold text-gray-900"
                                style={{ fontFamily: "var(--font-heading)" }}
                            >
                                {launchRef}
                            </h1>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                                <span>Target: {formatDate(launch.target_launch_date)}</span>
                                <span>·</span>
                                <span>{epics.length} epic{epics.length !== 1 ? "s" : ""}</span>
                            </div>
                        </div>

                        {/* Readiness gauge */}
                        <div className="bg-white rounded-lg border border-gray-200 px-5 py-3 text-center min-w-[140px]">
                            <div className="text-2xl font-bold text-gray-900">
                                {readinessPct}%
                            </div>
                            <div className="text-xs text-gray-500">
                                {doneCount}/{statuses.length} tasks done
                            </div>
                            <div className="mt-1.5 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${readinessPct >= 80 ? "bg-emerald-500" : readinessPct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                                    style={{ width: `${readinessPct}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Criteria checklist by phase */}
                <div className="space-y-4">
                    {[...phases.entries()].map(([phase, items]) => {
                        const isCollapsed = collapsedPhases.has(phase);
                        const phDone = items.filter((i) => i.status === "DONE").length;

                        return (
                            <div
                                key={phase}
                                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                            >
                                <button
                                    onClick={() => togglePhase(phase)}
                                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        {isCollapsed ? (
                                            <IconChevronRight size={18} className="text-gray-400" />
                                        ) : (
                                            <IconChevronDown size={18} className="text-gray-400" />
                                        )}
                                        <span className="text-sm font-semibold text-gray-800">
                                            {phase}
                                        </span>
                                    </div>
                                    <span className="text-xs text-gray-400">
                                        {phDone}/{items.length} done
                                    </span>
                                </button>

                                {!isCollapsed && (
                                    <div className="border-t border-gray-100 divide-y divide-gray-100">
                                        {items.map((item) => (
                                            <div
                                                key={item.criterion_id}
                                                className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50/50 transition-colors"
                                            >
                                                <button
                                                    onClick={() =>
                                                        handleToggleStatus(
                                                            item.criterion_id,
                                                            item.status
                                                        )
                                                    }
                                                    disabled={updating === item.criterion_id}
                                                    className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 transition-colors disabled:opacity-50"
                                                    title={`Status: ${item.status.replace(/_/g, " ")} — Click to cycle`}
                                                >
                                                    {statusIcon(item.status)}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <span
                                                        className={`text-sm ${item.status === "DONE" ? "text-gray-400 line-through" : "text-gray-900"}`}
                                                    >
                                                        {item.criterion?.label}
                                                    </span>
                                                    {item.criterion?.description && (
                                                        <p className="text-xs text-gray-400 truncate mt-0.5">
                                                            {item.criterion.description}
                                                        </p>
                                                    )}
                                                </div>
                                                {item.criterion?.gate === "hard" && (
                                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500 bg-red-50 px-1.5 py-0.5 rounded flex-shrink-0">
                                                        Hard Gate
                                                    </span>
                                                )}
                                                {item.due_date && (
                                                    <span className="text-xs text-gray-400 flex-shrink-0">
                                                        Due {formatDate(item.due_date)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Linked epics */}
                {epics.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-sm font-semibold text-gray-700 mb-3">
                            Linked Epics
                        </h2>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                            Name
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-24">
                                            Tier
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-32">
                                            Status
                                        </th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-32">
                                            Release Date
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {epics.map((epic) => (
                                        <tr
                                            key={epic.id}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() =>
                                                router.push(`/epics/${epic.id}`)
                                            }
                                        >
                                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                                {getEpicDisplayName(epic)}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span
                                                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                                        epic.tier === "TIER_1"
                                                            ? "bg-purple-100 text-purple-800"
                                                            : epic.tier === "TIER_2"
                                                              ? "bg-blue-100 text-blue-800"
                                                              : "bg-gray-100 text-gray-800"
                                                    }`}
                                                >
                                                    {epic.tier?.replace("_", " ")}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-600">
                                                {epic.status?.replace(/_/g, " ")}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-600">
                                                {formatDate(epic.target_launch_date)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
