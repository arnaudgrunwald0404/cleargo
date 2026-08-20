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
import { LaunchWorkbackTimeline } from "@/components/LaunchWorkbackTimeline";
import { DetailTabs, TabCount } from "@/components/DetailTabs";
import { LaunchChecklistTable } from "@/components/launch/LaunchChecklistTable";
import { UserDisplay } from "@/components/UserDisplay";
import { computeLaunchReadiness, VERDICT_CLASS, VERDICT_LABEL } from "@/lib/launch-readiness";

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
        // The column is boolean; the admin UI still round-trips 'hard'/'soft'
        // strings, so both shapes reach the client. Use isGating(), never ===.
        gate: boolean | string | null;
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
    schedule_id?: number | null;
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

/** Column-header styling shared with the epic criteria table. */
const TH_STYLE: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#6B7280",
};

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
    const [tab, setTab] = useState<"overview" | "checklist" | "assets" | "epics">("overview");

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

    // Releases this launch can anchor to. The workback counts back from the
    // release date, so re-anchoring reflows every derived due date server-side.
    const [releases, setReleases] = useState<Array<{ id: number; release_name: string; launch_date: string | null }>>([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/releases");
                if (res.ok) {
                    const rows = await res.json();
                    setReleases(Array.isArray(rows) ? rows : []);
                }
            } catch {
                // Without the list the date remains editable directly.
            }
        })();
    }, []);

    const releaseOptions = useMemo(
        () =>
            releases
                .filter((r) => r.launch_date)
                .map((r) => ({
                    value: String(r.id),
                    label: `${r.release_name} — ${formatDate(r.launch_date)}`,
                })),
        [releases]
    );

    // Assignable users. /api/users is reachable by PMM/PM/ENG/PRODUCT for exactly
    // this kind of delegate dropdown, so a launch owner can assign checklist work.
    const [users, setUsers] = useState<Array<{ email: string; first_name?: string | null; last_name?: string | null }>>([]);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/users", { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    setUsers((data.users || []).filter((u: { email?: string }) => !!u.email));
                }
            } catch {
                // A missing user list only costs the picker; the page still works.
            }
        })();
    }, []);

    const userOptions = useMemo(
        () =>
            users.map((u) => ({
                value: u.email,
                label: `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email,
            })),
        [users]
    );

    // Assignee editor for checklist rows. owner_email has always been on the row
    // and accepted by the PATCH endpoint; nothing ever rendered a control for it.
    const [assignTarget, setAssignTarget] = useState<CriterionStatus | null>(null);
    const [assignEmail, setAssignEmail] = useState<string | null>(null);
    const [savingAssign, setSavingAssign] = useState(false);

    const saveAssignee = async () => {
        if (!assignTarget) return;
        setSavingAssign(true);
        try {
            const res = await fetch(`/api/launch-criteria-status/${launchId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    criterion_id: assignTarget.criterion_id,
                    owner_email: assignEmail,
                }),
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchLaunch();
            setAssignTarget(null);
        } catch (err) {
            console.error("Failed to assign:", err);
            notifications.show({ color: "red", message: "Could not save that assignee." });
        } finally {
            setSavingAssign(false);
        }
    };

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

    // Memoised because it feeds three useMemo hooks: launch?.launch_criterion_status
    // returns a fresh array reference on every render, which would defeat all of them.
    const statuses = useMemo(
        () => launch?.launch_criterion_status || [],
        [launch?.launch_criterion_status]
    );
    const epics = (launch?.launch_epic || []).map((le) => le.epic).filter(Boolean) as EpicData[];
    const linkedEpicIds = new Set((launch?.launch_epic || []).map((le) => le.epic_id));

    const checklistDone = statuses.filter((s) => s.status === "DONE").length;

    const readiness = useMemo(
        () =>
            computeLaunchReadiness({
                items: statuses.map((s) => ({
                    id: s.criterion_id,
                    label: s.criterion?.label ?? "",
                    status: s.status,
                    due_date: s.due_date,
                    gate: s.criterion?.gate ?? null,
                    default_due_offset_days: s.criterion?.default_due_offset_days ?? null,
                    tier_offset_days: s.criterion?.tier_offset_days ?? null,
                })),
                targetLaunchDate: launch?.target_launch_date ?? null,
                tier: launch?.tier ?? null,
                launchCreatedAt: launch?.created_at ?? null,
            }),
        [statuses, launch?.target_launch_date, launch?.tier, launch?.created_at]
    );
    // Assets marked NOT_APPLICABLE are excluded from the denominator: an optional
    // asset that will not ship should not make the launch look incomplete.
    const assetsRequired = assets.filter((a) => a.status !== "NOT_APPLICABLE").length;
    const assetsDone = assets.filter((a) => a.status === "DONE").length;

    const phases = useMemo(() => {
        // A Map preserves INSERTION order, so the phase headings previously came
        // out in whatever order the API happened to return rows — which is
        // unordered. Sort first, then insert, so the groups themselves are
        // ordered and not just the items inside them.
        //
        // Phase names sort correctly as strings by design: 'Phase 00:' precedes
        // 'Phase 0:' because '0' < ':', which puts the commercialization gate
        // ahead of the artifact runway, and single-digit phases 1-6 follow.
        // "Uncategorized" is forced last rather than sorting under 'U'.
        const ordered = [...statuses].sort((a, b) => {
            const pa = a.criterion?.phase ?? "";
            const pb = b.criterion?.phase ?? "";
            if (pa !== pb) {
                if (!pa) return 1;
                if (!pb) return -1;
                // Deliberately codepoint order, NOT localeCompare: locale
                // collation de-prioritises punctuation and sorts
                // "Phase 0: Artifact Runway" BEFORE "Phase 00: Commercialization
                // Gate", which puts the runway ahead of the gate that blocks it.
                // Raw comparison keeps ':' (0x3A) after '0' (0x30) and orders
                // the gate first, which is the real sequence.
                return pa < pb ? -1 : 1;
            }
            return (a.criterion?.sort_order ?? 0) - (b.criterion?.sort_order ?? 0);
        });

        const map = new Map<string, CriterionStatus[]>();
        for (const s of ordered) {
            const phase = s.criterion?.phase || "Uncategorized";
            const list = map.get(phase) || [];
            list.push(s);
            map.set(phase, list);
        }
        return map;
    }, [statuses]);

    // Inline field save
    const patchLaunchFields = async (fields: Record<string, unknown>) => {
        try {
            const res = await fetch(`/api/launches/${launchId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(fields),
            });
            if (res.ok) {
                const updated = await res.json();
                setLaunch((prev) => prev ? { ...prev, ...updated } : prev);
                // A moved anchor or date reflows derived due dates server-side,
                // so the checklist has to be re-read rather than patched locally.
                if ("schedule_id" in fields || "target_launch_date" in fields || "tier" in fields) {
                    await fetchLaunch();
                }
                notifications.show({ message: "Updated", color: "teal", autoClose: 1500 });
            } else {
                notifications.show({ title: "Error", message: "Failed to save", color: "red" });
            }
        } catch {
            notifications.show({ title: "Error", message: "Failed to save", color: "red" });
        }
    };

    const patchLaunch = (field: string, value: unknown) => patchLaunchFields({ [field]: value });

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

                {/* Detail tabs — same strip epics use, via the shared DetailTabs */}
                <div className="mt-6">
                    <DetailTabs
                        ariaLabel="Launch detail tabs"
                        activeTab={tab}
                        onTabChange={(t) => setTab(t as typeof tab)}
                        tabs={[
                            { value: "overview", label: "Overview" },
                            {
                                value: "checklist",
                                label: "Checklist",
                                badge: <TabCount>{checklistDone}/{statuses.length}</TabCount>,
                            },
                            {
                                value: "assets",
                                label: "Assets",
                                badge: <TabCount>{assetsDone}/{assetsRequired}</TabCount>,
                            },
                            {
                                value: "epics",
                                label: "Epics",
                                badge: <TabCount>{epics.length}</TabCount>,
                            },
                        ]}
                    />
                </div>
                <div
                    className="rounded-b-lg rounded-tr-lg p-5 mb-8"
                    style={{
                        backgroundColor: "var(--color-tab-panel-bg)",
                        border: "1px solid var(--color-gray-900)",
                    }}
                    role="tabpanel"
                >
                {tab === "overview" && (<>
                {/* Readiness verdict — same vocabulary the epic model uses */}
                <div
                    className={`rounded-lg border px-4 py-3 mb-5 ${VERDICT_CLASS[readiness.verdict]}`}
                >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-baseline gap-3">
                            <span className="text-sm font-semibold">
                                {VERDICT_LABEL[readiness.verdict]}
                            </span>
                            <span className="text-xs opacity-80">
                                {readiness.readinessPct}% ready · {readiness.gatesDone}/
                                {readiness.gatesTotal} gates cleared
                            </span>
                        </div>
                        <span className="text-[11px] opacity-70">
                            Gates count triple; in-progress counts half.
                        </span>
                    </div>

                    {readiness.blockers.length > 0 && (
                        <div className="mt-2 text-xs">
                            <span className="font-medium">Blocking:</span>{" "}
                            {readiness.blockers.map((b) => b.label).join(" · ")}
                        </div>
                    )}
                    {readiness.blockers.length === 0 && readiness.atRisk.length > 0 && (
                        <div className="mt-2 text-xs">
                            <span className="font-medium">Needs attention now:</span>{" "}
                            {readiness.atRisk.map((a) => a.label).join(" · ")}
                        </div>
                    )}
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
                        <Select
                            label="Release"
                            placeholder="Anchor to a release"
                            data={releaseOptions}
                            value={launch.schedule_id ? String(launch.schedule_id) : null}
                            onChange={(val) => {
                                const rel = releases.find((r) => String(r.id) === val);
                                // Sent together: the reflow keys off the new target date,
                                // so splitting these would reflow twice off a stale one.
                                patchLaunchFields({
                                    schedule_id: val ? Number(val) : null,
                                    ...(rel?.launch_date ? { target_launch_date: rel.launch_date } : {}),
                                });
                            }}
                            searchable
                            clearable
                            disabled={!canManage}
                            size="sm"
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

                {/* Workback timeline — the artifact runway counted back from GA */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-700">Workback</h2>
                        {launch?.tier && (
                            <span className="text-xs text-gray-400">
                                {launch.tier === "TIER_1" ? "Tier 1 · ~8 week runway" : "Tier 2 · ~5 week runway"}
                            </span>
                        )}
                    </div>
                    <div className="border border-gray-200 rounded-lg p-4">
                        <LaunchWorkbackTimeline
                            items={statuses
                                .filter((s) => (s.criterion?.phase || "").startsWith("Phase 0"))
                                .map((s) => ({
                                    id: s.criterion_id,
                                    label: s.criterion?.label ?? "",
                                    status: s.status,
                                    due_date: s.due_date,
                                    phase: s.criterion?.phase ?? null,
                                    sort_order: s.criterion?.sort_order ?? 0,
                                    default_due_offset_days: s.criterion?.default_due_offset_days ?? null,
                                    tier_offset_days: s.criterion?.tier_offset_days ?? null,
                                }))}
                            targetLaunchDate={launch?.target_launch_date ?? null}
                            tier={launch?.tier ?? null}
                            launchCreatedAt={launch?.created_at ?? null}
                        />
                    </div>
                </div>

                </>)}

                {tab === "checklist" && (<>
                {/* Readiness checklist — same table shape epics use for criteria */}
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
                                            <span className="text-sm font-medium text-gray-900">{phase}</span>
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {phDone}/{items.length} done
                                        </span>
                                    </button>

                                    {!isCollapsed && (
                                        <div className="border-t border-gray-100">
                                            <LaunchChecklistTable
                                                rows={items}
                                                users={users}
                                                targetLaunchDate={launch?.target_launch_date ?? null}
                                                tier={launch?.tier ?? null}
                                                launchCreatedAt={launch?.created_at ?? null}
                                                canEdit={canToggleTasks}
                                                busyId={updating}
                                                onCycleStatus={(row) =>
                                                    handleToggleStatus(row.criterion_id, row.status)
                                                }
                                                onAssign={(row) => {
                                                    setAssignEmail(row.owner_email);
                                                    setAssignTarget(row as CriterionStatus);
                                                }}
                                                onEditLinks={(row) =>
                                                    openLinkEditor("criterion", row as CriterionStatus)
                                                }
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                </>)}

                {tab === "assets" && (<>
                {/* Supporting assets - Campaign Brief Part 6, same table shape */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-700">
                            Supporting Assets ({assetsDone}/{assetsRequired})
                        </h2>
                    </div>
                    {assets.length === 0 ? (
                        <p className="text-xs text-gray-400">
                            No assets tracked yet. They are created with the launch.
                        </p>
                    ) : (
                        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                            <table
                                className="min-w-full table-fixed w-full"
                                style={{ borderCollapse: "collapse", minWidth: "700px" }}
                            >
                                <thead style={{ backgroundColor: "#FFFFFF", borderBottom: "2px solid #E5E7EB" }}>
                                    <tr>
                                        <th className="px-4 py-3 text-left font-medium" style={TH_STYLE}>Asset</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH_STYLE, width: "90px" }}>Status</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH_STYLE, width: "170px" }}>Accountable</th>
                                        <th className="px-4 py-3 text-left font-medium" style={{ ...TH_STYLE, width: "160px" }}>Where to Find It</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {assets.map((a) => {
                                        const owner = users.find(
                                            (u) => (u.email || "").toLowerCase() === (a.owner_email || "").toLowerCase()
                                        );
                                        const struck = a.status === "DONE" || a.status === "NOT_APPLICABLE";
                                        return (
                                            <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={struck ? "text-sm text-gray-400 line-through" : "text-sm text-gray-900"}>
                                                            {a.label}
                                                        </span>
                                                        {a.optional && (
                                                            <span className="text-[10px] uppercase tracking-wider text-gray-400 flex-shrink-0">
                                                                Optional
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 align-middle" style={{ width: "90px" }}>
                                                    <button
                                                        type="button"
                                                        disabled={!canToggleTasks || updatingAsset === a.id}
                                                        onClick={() => cycleAssetStatus(a)}
                                                        className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-50"
                                                        title={a.status.replace(/_/g, " ") + " - click to cycle"}
                                                    >
                                                        {assetStatusIcon(a.status)}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 align-middle" style={{ width: "170px" }}>
                                                    {a.owner_email ? (
                                                        <UserDisplay
                                                            email={a.owner_email}
                                                            firstName={owner?.first_name}
                                                            lastName={owner?.last_name}
                                                            size="xs"
                                                        />
                                                    ) : (
                                                        <span className="text-sm text-gray-500">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-sm align-middle" style={{ width: "160px" }}>
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        {a.url && (
                                                            <a
                                                                href={a.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-xs text-purple-600 hover:underline flex items-center gap-1 truncate"
                                                                title={a.url}
                                                            >
                                                                <IconExternalLink size={12} className="flex-shrink-0" />
                                                                <span className="truncate">Open</span>
                                                            </a>
                                                        )}
                                                        {canToggleTasks && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openLinkEditor("asset", a)}
                                                                className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
                                                                title={a.url ? "Edit link" : "Add a link"}
                                                            >
                                                                <IconLink size={14} />
                                                            </button>
                                                        )}
                                                        {!canToggleTasks && !a.url && (
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
                    )}
                </div>

                </>)}

                {tab === "epics" && (<>
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
                </>)}
                </div>
            </div>

            {/* Assignee picker for checklist rows */}
            <Modal
                opened={assignTarget !== null}
                onClose={() => setAssignTarget(null)}
                title={`Assign “${assignTarget?.criterion?.label ?? ""}”`}
                centered
            >
                <Stack gap="sm">
                    <Select
                        label="Assignee"
                        placeholder="Search people..."
                        description="Leave empty to unassign."
                        data={userOptions}
                        value={assignEmail}
                        onChange={setAssignEmail}
                        searchable
                        clearable
                        nothingFoundMessage="No matching user"
                        comboboxProps={{ withinPortal: true }}
                        data-autofocus
                    />
                    <Group justify="flex-end" gap="sm">
                        <Button variant="subtle" onClick={() => setAssignTarget(null)} disabled={savingAssign}>
                            Cancel
                        </Button>
                        <Button onClick={saveAssignee} loading={savingAssign}>
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Modal>

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
