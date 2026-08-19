"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PurpleLoader } from "@/components/PurpleLoader";
import {
    Select,
    TextInput,
    Button,
    Modal,
    Stack,
    Group,
    ScrollArea,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
    IconArrowLeft,
    IconCheck,
    IconCircle,
    IconLoader2,
    IconChevronDown,
    IconChevronRight,
    IconExternalLink,
    IconLink,
    IconX,
    IconSearch,
} from "@tabler/icons-react";
import type { LaunchStatus, LaunchAsset, AssetStatus } from "@/types/launches";
import { canRolesPerform } from "@/lib/permissions";
import { scheduleState, tierAwareDueDate } from "@/lib/launchCriteria";

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
        default_due_offset_days?: number | null;
        tier_offset_days?: Record<string, number> | null;
    };
}

interface LaunchData {
    id: string;
    name: string;
    created_at?: string | null;
    tier: string | null;
    target_launch_date: string | null;
    readiness_pct: number;
    status: LaunchStatus;
    owner_email: string | null;
    brief_url: string | null;
    feg_url: string | null;
    launch_epic?: Array<{
        id: string;
        epic_id: string;
        epic?: EpicData;
    }>;
    launch_criterion_status?: CriterionStatus[];
}

interface EpicData {
    id: string;
    name: string;
    tier: string;
    status: string;
    target_launch_date?: string | null;
    readiness_score?: number;
    readiness_status?: string | null;
}

/**
 * Workback status for one checklist row.
 *
 * The stored due_date is when the artifact must be COMPLETE (its successor's
 * start); tier_offset_days is when it must BEGIN. Showing both is what makes a
 * compressed runway legible: per Kristin, when a release lands closer than the
 * tier's runway needs, the sequence is compressed and already started -- the
 * artifact predates the window, it isn't missing -- so it must not read as late.
 */
function workbackStatus(
    item: CriterionStatus,
    launch: LaunchData | null
): { label: string; className: string; tooltip: string } | null {
    if (!item.due_date && !item.criterion?.tier_offset_days) return null;

    const startDate = tierAwareDueDate(
        launch?.target_launch_date,
        {
            default_due_offset_days: item.criterion?.default_due_offset_days ?? null,
            tier_offset_days: item.criterion?.tier_offset_days ?? null,
        },
        launch?.tier
    );
    const due = formatDate(item.due_date);

    if (item.status === "DONE") {
        return { label: `Due ${due}`, className: "text-gray-400", tooltip: "Complete" };
    }

    const state = scheduleState({
        startDate,
        dueDate: item.due_date,
        today: new Date().toISOString().slice(0, 10),
        launchCreatedAt: launch?.created_at ?? null,
    });

    const starts = startDate ? formatDate(startDate) : "—";
    switch (state) {
        case "compressed":
            return {
                label: `Compressed · due ${due}`,
                className: "text-amber-600",
                tooltip: `This artifact was due to start ${starts}, before the launch was created. The release landed closer than this tier's runway needs, so the sequence is compressed rather than missed.`,
            };
        case "upcoming":
            return { label: `Starts ${starts}`, className: "text-gray-400", tooltip: `Due ${due}` };
        case "late":
            return { label: `Overdue · was due ${due}`, className: "text-red-500", tooltip: `Should have started ${starts}` };
        case "in_window":
            return { label: `Due ${due}`, className: "text-gray-500", tooltip: `Started ${starts}` };
        default:
            return null;
    }
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

/**
 * Assets cycle through the same three states as checklist items, plus
 * NOT_APPLICABLE — Part 6 marks two rows optional, and an optional asset that
 * won't ship needs to be closed out rather than left permanently unticked.
 */
const ASSET_CYCLE: AssetStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE"];

function nextAssetStatus(current: AssetStatus, optional: boolean): AssetStatus {
    if (current === "NOT_APPLICABLE") return "NOT_STARTED";
    const i = ASSET_CYCLE.indexOf(current);
    const next = ASSET_CYCLE[(i + 1) % ASSET_CYCLE.length];
    // Optional assets get an extra stop after DONE so they can be marked N/A.
    if (optional && current === "DONE") return "NOT_APPLICABLE";
    return next;
}

/**
 * launch_criterion_status.links is a free-form jsonb array; the API has always
 * accepted it but nothing ever wrote to it, so anything could be in there.
 * Normalise defensively rather than trusting the shape.
 */
function asLinkList(raw: unknown): Array<{ url: string; label?: string }> {
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

/** Reject anything that is not an http(s) URL — these render as clickable links. */
function normalizeUrl(input: string): string | null {
    const t = input.trim();
    if (!t) return null;
    const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    try {
        const u = new URL(withScheme);
        return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
        return null;
    }
}

function assetStatusIcon(status: AssetStatus) {
    if (status === "DONE") return <IconCheck size={16} className="text-emerald-600" />;
    if (status === "IN_PROGRESS") return <IconLoader2 size={16} className="text-amber-500" />;
    if (status === "NOT_APPLICABLE") return <IconX size={16} className="text-gray-300" />;
    return <IconCircle size={16} className="text-gray-300" />;
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
    const launchId = params.id as string;

    const [launch, setLaunch] = useState<LaunchData | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
    const [canManage, setCanManage] = useState(false);
    const [canToggleTasks, setCanToggleTasks] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/me", { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    const roles = Array.isArray(data.user?.roles)
                        ? data.user.roles
                        : (data.user?.role ? [data.user.role] : []);
                    setCanManage(canRolesPerform(roles, "launches.manage"));
                    setCanToggleTasks(canRolesPerform(roles, "launchCriteria.status.update"));
                }
            } catch {
                // leave permissions false
            }
        })();
    }, []);

    // Link epic modal
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [allEpics, setAllEpics] = useState<EpicData[]>([]);
    const [epicSearch, setEpicSearch] = useState("");
    const [loadingEpics, setLoadingEpics] = useState(false);
    const [linkingEpicId, setLinkingEpicId] = useState<string | null>(null);

    const fetchLaunch = useCallback(async () => {
        try {
            const res = await fetch(`/api/launches/${launchId}`);
            if (res.ok) {
                const data = await res.json();
                setLaunch(data);
            }
        } catch (err) {
            console.error("Failed to fetch launch detail:", err);
        } finally {
            setLoading(false);
        }
    }, [launchId]);

    useEffect(() => {
        fetchLaunch();
    }, [fetchLaunch]);

    const [assets, setAssets] = useState<LaunchAsset[]>([]);
    const [updatingAsset, setUpdatingAsset] = useState<string | null>(null);

    const fetchAssets = useCallback(async () => {
        try {
            const res = await fetch(`/api/launches/${launchId}/assets`);
            if (res.ok) {
                const data = await res.json();
                setAssets(data.assets || []);
            }
        } catch (err) {
            console.error("Failed to fetch launch assets:", err);
        }
    }, [launchId]);

    useEffect(() => {
        fetchAssets();
    }, [fetchAssets]);

    // Link editor, shared by checklist rows (links jsonb) and assets (url).
    const [linkTarget, setLinkTarget] = useState<
        | { kind: "criterion"; item: CriterionStatus }
        | { kind: "asset"; item: LaunchAsset }
        | null
    >(null);
    const [linkUrl, setLinkUrl] = useState("");
    const [linkLabel, setLinkLabel] = useState("");
    const [savingLink, setSavingLink] = useState(false);

    const openLinkEditor = (
        kind: "criterion" | "asset",
        item: CriterionStatus | LaunchAsset
    ) => {
        if (kind === "criterion") {
            const existing = asLinkList((item as CriterionStatus).links)[0];
            setLinkUrl(existing?.url || "");
            setLinkLabel(existing?.label || "");
            setLinkTarget({ kind, item: item as CriterionStatus });
        } else {
            setLinkUrl((item as LaunchAsset).url || "");
            setLinkLabel("");
            setLinkTarget({ kind, item: item as LaunchAsset });
        }
    };

    const saveLink = async () => {
        if (!linkTarget) return;
        const cleared = linkUrl.trim() === "";
        const url = cleared ? null : normalizeUrl(linkUrl);
        if (!cleared && !url) {
            notifications.show({ color: "red", message: "That does not look like a valid web address." });
            return;
        }
        setSavingLink(true);
        try {
            if (linkTarget.kind === "asset") {
                const res = await fetch(`/api/launches/${launchId}/assets`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ asset_id: linkTarget.item.id, url }),
                });
                if (!res.ok) throw new Error(await res.text());
                setAssets((prev) =>
                    prev.map((a) => (a.id === linkTarget.item.id ? { ...a, url } : a))
                );
            } else {
                const links = url ? [{ url, ...(linkLabel.trim() ? { label: linkLabel.trim() } : {}) }] : [];
                const res = await fetch(`/api/launch-criteria-status/${launchId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ criterion_id: linkTarget.item.criterion_id, links }),
                });
                if (!res.ok) throw new Error(await res.text());
                await fetchLaunch();
            }
            setLinkTarget(null);
        } catch (err) {
            console.error("Failed to save link:", err);
            notifications.show({ color: "red", message: "Could not save that link." });
        } finally {
            setSavingLink(false);
        }
    };

    const cycleAssetStatus = async (asset: LaunchAsset) => {
        const status = nextAssetStatus(asset.status, asset.optional);
        setUpdatingAsset(asset.id);
        // Optimistic: the row is a single field and the request is tiny, so
        // reverting on failure is cheaper than making the user wait.
        setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, status } : a)));
        try {
            const res = await fetch(`/api/launches/${launchId}/assets`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ asset_id: asset.id, status }),
            });
            if (!res.ok) throw new Error(await res.text());
        } catch (err) {
            console.error("Failed to update asset:", err);
            setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, status: asset.status } : a)));
            notifications.show({ color: "red", message: "Could not update that asset." });
        } finally {
            setUpdatingAsset(null);
        }
    };

    const statuses = launch?.launch_criterion_status || [];
    const epics = (launch?.launch_epic || []).map((le) => le.epic).filter(Boolean) as EpicData[];
    const linkedEpicIds = new Set((launch?.launch_epic || []).map((le) => le.epic_id));

    const phases = useMemo(() => {
        const map = new Map<string, CriterionStatus[]>();
        for (const s of statuses) {
            const phase = s.criterion?.phase || "Uncategorized";
            const list = map.get(phase) || [];
            list.push(s);
            map.set(phase, list);
        }
        for (const [, items] of map) {
            items.sort(
                (a, b) =>
                    (a.criterion?.sort_order ?? 0) - (b.criterion?.sort_order ?? 0)
            );
        }
        return map;
    }, [statuses]);

    // Inline field save
    const patchLaunch = async (field: string, value: any) => {
        try {
            const res = await fetch(`/api/launches/${launchId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [field]: value }),
            });
            if (res.ok) {
                const updated = await res.json();
                setLaunch((prev) => prev ? { ...prev, ...updated } : prev);
                notifications.show({ message: "Updated", color: "teal", autoClose: 1500 });
            } else {
                notifications.show({ title: "Error", message: "Failed to save", color: "red" });
            }
        } catch {
            notifications.show({ title: "Error", message: "Failed to save", color: "red" });
        }
    };

    const handleToggleStatus = useCallback(
        async (criterionId: string, currentStatus: TaskStatus) => {
            if (!launch) return;
            const nextIdx =
                (STATUS_CYCLE.indexOf(currentStatus) + 1) % STATUS_CYCLE.length;
            const nextStatus = STATUS_CYCLE[nextIdx];

            setUpdating(criterionId);

            setLaunch((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    launch_criterion_status: (prev.launch_criterion_status || []).map((s) =>
                        s.criterion_id === criterionId ? { ...s, status: nextStatus } : s
                    ),
                };
            });

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
                    setLaunch((prev) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            launch_criterion_status: (prev.launch_criterion_status || []).map((s) =>
                                s.criterion_id === criterionId ? { ...s, status: currentStatus } : s
                            ),
                        };
                    });
                } else {
                    // Recompute readiness
                    setLaunch((prev) => {
                        if (!prev) return prev;
                        const all = (prev.launch_criterion_status || []);
                        const done = all.filter((s) => s.status === "DONE").length;
                        return { ...prev, readiness_pct: all.length > 0 ? Math.round((done / all.length) * 100) : 0 };
                    });
                }
            } catch {
                setLaunch((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        launch_criterion_status: (prev.launch_criterion_status || []).map((s) =>
                            s.criterion_id === criterionId ? { ...s, status: currentStatus } : s
                        ),
                    };
                });
            } finally {
                setUpdating(null);
            }
        },
        [launch]
    );

    const togglePhase = (phase: string) => {
        setCollapsedPhases((prev) => {
            const next = new Set(prev);
            if (next.has(phase)) next.delete(phase);
            else next.add(phase);
            return next;
        });
    };

    // Link epic
    const openLinkModal = async () => {
        setLinkModalOpen(true);
        setLoadingEpics(true);
        try {
            const res = await fetch("/api/epics");
            if (res.ok) {
                const data = await res.json();
                setAllEpics(Array.isArray(data) ? data : data.epics || []);
            }
        } catch {
            notifications.show({ title: "Error", message: "Failed to load epics", color: "red" });
        } finally {
            setLoadingEpics(false);
        }
    };

    const linkEpic = async (epicId: string) => {
        setLinkingEpicId(epicId);
        try {
            const res = await fetch(`/api/launches/${launchId}/epics`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ epic_id: epicId }),
            });
            if (res.ok) {
                notifications.show({ message: "Epic linked", color: "teal", autoClose: 1500 });
                setLinkModalOpen(false);
                fetchLaunch();
            } else {
                const err = await res.json();
                notifications.show({ title: "Error", message: err.error || "Failed to link", color: "red" });
            }
        } catch {
            notifications.show({ title: "Error", message: "Failed to link epic", color: "red" });
        } finally {
            setLinkingEpicId(null);
        }
    };

    const unlinkEpic = async (epicId: string) => {
        try {
            const res = await fetch(`/api/launches/${launchId}/epics?epic_id=${epicId}`, {
                method: "DELETE",
            });
            if (res.ok) {
                notifications.show({ message: "Epic unlinked", color: "teal", autoClose: 1500 });
                fetchLaunch();
            }
        } catch {
            notifications.show({ title: "Error", message: "Failed to unlink epic", color: "red" });
        }
    };

    const filteredEpics = allEpics.filter((e) => {
        if (linkedEpicIds.has(e.id)) return false;
        if (!epicSearch) return true;
        return e.name.toLowerCase().includes(epicSearch.toLowerCase());
    });

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
                {/* Back link + Title */}
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
                                {launch.name}
                            </h1>
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

                {/* Editable metadata card */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Select
                            label="Tier"
                            size="sm"
                            data={[
                                { value: "TIER_1", label: "Tier 1" },
                                { value: "TIER_2", label: "Tier 2" },
                            ]}
                            value={launch.tier || null}
                            onChange={(val) => patchLaunch("tier", val)}
                            clearable
                            disabled={!canManage}
                        />
                        <Select
                            label="Status"
                            size="sm"
                            data={[
                                { value: "Planning", label: "Planning" },
                                { value: "In Progress", label: "In Progress" },
                                { value: "Launched", label: "Launched" },
                                { value: "Post-Launch", label: "Post-Launch" },
                            ]}
                            value={launch.status}
                            onChange={(val) => val && patchLaunch("status", val)}
                            disabled={!canManage}
                        />
                        <DateInput
                            label="Target Launch Date"
                            size="sm"
                            value={launch.target_launch_date ? new Date(launch.target_launch_date + "T00:00:00") : null}
                            onChange={(val) => {
                                const d = val as Date | null;
                                patchLaunch("target_launch_date", d ? d.toISOString().split("T")[0] : null);
                            }}
                            clearable
                            disabled={!canManage}
                        />
                        <TextInput
                            label="Owner"
                            size="sm"
                            placeholder="owner@clearcompany.com"
                            defaultValue={launch.owner_email || ""}
                            key={`owner-${launch.owner_email}`}
                            onBlur={(e) => {
                                const val = e.currentTarget.value.trim() || null;
                                if (val !== launch.owner_email) patchLaunch("owner_email", val);
                            }}
                            disabled={!canManage}
                        />
                        <div>
                            <TextInput
                                label="Brief URL"
                                size="sm"
                                placeholder="https://docs.google.com/..."
                                defaultValue={launch.brief_url || ""}
                                key={`brief-${launch.brief_url}`}
                                onBlur={(e) => {
                                    const val = e.currentTarget.value.trim() || null;
                                    if (val !== launch.brief_url) patchLaunch("brief_url", val);
                                }}
                                disabled={!canManage}
                                rightSection={
                                    launch.brief_url ? (
                                        <a href={launch.brief_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                            <IconExternalLink size={14} className="text-gray-400 hover:text-indigo-600" />
                                        </a>
                                    ) : undefined
                                }
                            />
                        </div>
                        <div>
                            <TextInput
                                label="FEG URL"
                                size="sm"
                                placeholder="https://docs.google.com/..."
                                defaultValue={launch.feg_url || ""}
                                key={`feg-${launch.feg_url}`}
                                onBlur={(e) => {
                                    const val = e.currentTarget.value.trim() || null;
                                    if (val !== launch.feg_url) patchLaunch("feg_url", val);
                                }}
                                disabled={!canManage}
                                rightSection={
                                    launch.feg_url ? (
                                        <a href={launch.feg_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                            <IconExternalLink size={14} className="text-gray-400 hover:text-indigo-600" />
                                        </a>
                                    ) : undefined
                                }
                            />
                        </div>
                    </div>
                </div>

                {/* Criteria checklist by phase */}
                {statuses.length > 0 && (
                    <div className="space-y-4 mb-8">
                        <h2 className="text-sm font-semibold text-gray-700">Readiness Checklist</h2>
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
                                                        disabled={!canToggleTasks || updating === item.criterion_id}
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
                                                    {(() => {
                                                        const s = workbackStatus(item, launch);
                                                        if (!s) return null;
                                                        return (
                                                            <span
                                                                className={`text-xs flex-shrink-0 ${s.className}`}
                                                                title={s.tooltip}
                                                            >
                                                                {s.label}
                                                            </span>
                                                        );
                                                    })()}
                                                    {(() => {
                                                        const links = asLinkList(item.links);
                                                        return (
                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                {links.map((l, i) => (
                                                                    <a
                                                                        key={i}
                                                                        href={l.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                                                                        title={l.url}
                                                                    >
                                                                        <IconExternalLink size={12} />
                                                                        {l.label || "Link"}
                                                                    </a>
                                                                ))}
                                                                {canToggleTasks && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openLinkEditor("criterion", item)}
                                                                        className="text-gray-300 hover:text-purple-600 transition-colors"
                                                                        title={links.length ? "Edit links" : "Add a link"}
                                                                    >
                                                                        <IconLink size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Supporting assets — Campaign Brief Part 6 */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-700">
                            Supporting Assets ({assets.filter((a) => a.status === "DONE").length}/
                            {assets.filter((a) => a.status !== "NOT_APPLICABLE").length})
                        </h2>
                    </div>
                    {assets.length === 0 ? (
                        <p className="text-xs text-gray-400">
                            No assets tracked yet. They are created with the launch.
                        </p>
                    ) : (
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                            {assets.map((a) => (
                                <div key={a.id} className="flex items-center gap-3 px-3 py-2">
                                    <button
                                        type="button"
                                        disabled={!canToggleTasks || updatingAsset === a.id}
                                        onClick={() => cycleAssetStatus(a)}
                                        className="flex-shrink-0 disabled:opacity-50"
                                        title={
                                            canToggleTasks
                                                ? "Click to advance status"
                                                : "You do not have permission to change this"
                                        }
                                    >
                                        {assetStatusIcon(a.status)}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <span
                                            className={`text-sm ${
                                                a.status === "NOT_APPLICABLE"
                                                    ? "text-gray-400 line-through"
                                                    : "text-gray-700"
                                            }`}
                                        >
                                            {a.label}
                                        </span>
                                        {a.optional && (
                                            <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">
                                                Optional
                                            </span>
                                        )}
                                    </div>
                                    {a.owner_email && (
                                        <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[160px]">
                                            {a.owner_email}
                                        </span>
                                    )}
                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        {a.url && (
                                            <a
                                                href={a.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                                                title={a.url}
                                            >
                                                <IconExternalLink size={12} /> Open
                                            </a>
                                        )}
                                        {canToggleTasks && (
                                            <button
                                                type="button"
                                                onClick={() => openLinkEditor("asset", a)}
                                                className="text-gray-300 hover:text-purple-600 transition-colors"
                                                title={a.url ? "Edit link" : "Add a link"}
                                            >
                                                <IconLink size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Linked Epics */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-700">
                            Linked Epics ({epics.length})
                        </h2>
                        {canManage && (
                            <button
                                onClick={openLinkModal}
                                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
                            >
                                <IconLink size={14} />
                                Link Epic
                            </button>
                        )}
                    </div>

                    {epics.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                            <p className="text-gray-400 text-sm">No epics linked to this launch yet.</p>
                        </div>
                    ) : (
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
                                        <th className="px-4 py-2 w-12">
                                            <span className="sr-only">Unlink</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {epics.map((epic) => (
                                        <tr
                                            key={epic.id}
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => router.push(`/epics/${epic.id}`)}
                                        >
                                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                                {epic.name}
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
                                                {formatDate(epic.target_launch_date ?? null)}
                                            </td>
                                            <td className="px-4 py-2">
                                                {canManage && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            unlinkEpic(epic.id);
                                                        }}
                                                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Unlink epic"
                                                    >
                                                        <IconX size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Link editor — checklist items store a links[] array, assets a single url */}
            <Modal
                opened={linkTarget !== null}
                onClose={() => setLinkTarget(null)}
                title={
                    linkTarget?.kind === "asset"
                        ? `Link for “${linkTarget.item.label}”`
                        : `Link for “${linkTarget?.item.criterion?.label ?? ""}”`
                }
                centered
            >
                <Stack gap="sm">
                    <TextInput
                        label="Web address"
                        placeholder="docs.google.com/document/d/..."
                        description="Where this artifact lives. Leave blank to remove the link."
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !savingLink) saveLink();
                        }}
                        data-autofocus
                    />
                    {linkTarget?.kind === "criterion" && (
                        <TextInput
                            label="Label (optional)"
                            placeholder="e.g. AGENT_Story-Brief_v0.1"
                            value={linkLabel}
                            onChange={(e) => setLinkLabel(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !savingLink) saveLink();
                            }}
                        />
                    )}
                    <Group justify="flex-end" gap="sm">
                        <Button variant="subtle" onClick={() => setLinkTarget(null)} disabled={savingLink}>
                            Cancel
                        </Button>
                        <Button onClick={saveLink} loading={savingLink}>
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* Link Epic Modal */}
            <Modal
                opened={linkModalOpen}
                onClose={() => { setLinkModalOpen(false); setEpicSearch(""); }}
                title="Link Epic to Launch"
                size="lg"
            >
                <Stack gap="sm">
                    <TextInput
                        placeholder="Search epics..."
                        leftSection={<IconSearch size={16} />}
                        value={epicSearch}
                        onChange={(e) => setEpicSearch(e.currentTarget.value)}
                    />
                    {loadingEpics ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
                            <PurpleLoader size="sm" />
                            <span className="text-sm">Loading epics...</span>
                        </div>
                    ) : filteredEpics.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                            {epicSearch ? "No matching epics found." : "All epics are already linked."}
                        </div>
                    ) : (
                        <ScrollArea h={360}>
                            <div className="divide-y divide-gray-100">
                                {filteredEpics.slice(0, 50).map((epic) => (
                                    <div
                                        key={epic.id}
                                        className="flex items-center justify-between py-2 px-1 hover:bg-gray-50 rounded transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-gray-900 truncate">
                                                {epic.name}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span
                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                        epic.tier === "TIER_1"
                                                            ? "bg-purple-100 text-purple-800"
                                                            : epic.tier === "TIER_2"
                                                              ? "bg-blue-100 text-blue-800"
                                                              : "bg-gray-100 text-gray-600"
                                                    }`}
                                                >
                                                    {epic.tier?.replace("_", " ") || "No tier"}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {epic.status?.replace(/_/g, " ")}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            size="xs"
                                            variant="light"
                                            onClick={() => linkEpic(epic.id)}
                                            loading={linkingEpicId === epic.id}
                                        >
                                            Link
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </Stack>
            </Modal>
        </main>
    );
}
