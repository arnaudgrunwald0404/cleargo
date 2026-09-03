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
    Tooltip,
    Badge,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconChevronDown, IconChevronRight, IconCircle, IconExternalLink, IconLink, IconInfoCircle, IconLoader2, IconSearch, IconX } from "@tabler/icons-react";
import type { LaunchStatus, LaunchAsset, AssetStatus } from "@/types/launches";
import { LAUNCH_STATUSES } from "@/lib/launch-status";
import type { CapabilityId } from "@/lib/permissions";
import {
    findEpicDateConflicts,
    describeEpicDateConflicts,
} from "@/lib/launchEpicDateConflicts";
import { LaunchWorkbackTimeline } from "@/components/LaunchWorkbackTimeline";
import { DetailTabs, TabCount } from "@/components/DetailTabs";
import { LaunchChecklistTable, type LaunchCriterionDetailSection } from "@/components/launch/LaunchChecklistTable";
import { LaunchCriterionDetailModal, type LaunchCriterionPatch } from "@/components/launch/LaunchCriterionDetailModal";
import { LaunchArtifactsPanel } from "@/components/launch/LaunchArtifactsPanel";
import {
    anyLaunchChecklistFilterActive,
    filterLaunchChecklistRows,
    type LaunchChecklistFilters,
} from "@/lib/launchChecklistFilters";
import { UserDisplay } from "@/components/UserDisplay";
import { computeLaunchReadiness, VERDICT_CLASS, VERDICT_LABEL } from "@/lib/launch-readiness";

type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "DONE" | "NOT_APPLICABLE";

interface CriterionStatus {
    id: string;
    launch_id: string;
    criterion_id: string;
    status: TaskStatus;
    /** Set by the API when a gate's status comes from its items rather than a tick. */
    status_source?: "items" | "direct";
    /** Checklist items inside this gate, each owned by its own function. */
    items?: Array<{
        id: string;
        label: string;
        status: TaskStatus;
        owner_email: string | null;
        owner_role: string | null;
        description: string | null;
        optional: boolean;
        sort_order: number;
    }>;
    owner_email: string | null;
    due_date: string | null;
    notes: string | null;
    links: unknown;
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
    /** Effective status: the override when pinned, otherwise derived from dates. */
    status: LaunchStatus;
    /** null means the launch tracks its target date automatically. */
    status_override?: LaunchStatus | null;
    /** What the dates say, shown as the "Auto" option's current value. */
    computed_status?: LaunchStatus;
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

/**
 * Deciding that something does not apply is a scoping call, not a status tick, so
 * the extra NOT_APPLICABLE stop after DONE belongs to whoever holds
 * launch.markNotApplicable (PMM, plus SUPERADMIN implicitly) rather than to
 * whichever rows happen to be flagged `optional`.
 *
 * `optional` stays as a hint about which rows commonly do not apply — it is shown
 * as a badge — but it no longer decides who may say so.
 */
function nextAssetStatus(current: AssetStatus, canMarkNotApplicable: boolean): AssetStatus {
    if (current === "NOT_APPLICABLE") return "NOT_STARTED";
    if (current === "DONE" && canMarkNotApplicable) return "NOT_APPLICABLE";
    const i = ASSET_CYCLE.indexOf(current);
    return ASSET_CYCLE[(i + 1) % ASSET_CYCLE.length];
}

/**
 * Soonest due first, undated last. Only matters where a list is truncated: the
 * names that survive should be the ones with the least time left.
 */
function byDueDate<T extends { due_date: string | null }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return 0;
    });
}

/** Enough to see the shape of the problem without reading a paragraph. */
const MAX_NAMED_BLOCKERS = 3;

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
/** The chips, in the order the epic readiness tab lists them. */
const CHECKLIST_FILTERS: Array<{ key: keyof LaunchChecklistFilters; label: string }> = [
    { key: "myTasks", label: "My tasks" },
    { key: "overdue", label: "Overdue" },
    { key: "dueSoon", label: "Due soon" },
];

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

/**
 * NOT_APPLICABLE is never reached by clicking a gate. It arrives either because
 * every item inside the gate is N/A (the Beta gate on a capability that runs no
 * beta) or because the roll-up found no epics to reflect. Clicking from there
 * returns to the start of the cycle, the way an optional asset does.
 */
function nextCriterionStatus(current: TaskStatus): TaskStatus {
    if (current === "NOT_APPLICABLE") return "NOT_STARTED";
    return STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
}

export default function GTMLaunchDetailPage() {
    const params = useParams();
    const router = useRouter();
    const launchId = params.id as string;

    const [launch, setLaunch] = useState<LaunchData | null>(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());
    const [canManage, setCanManage] = useState(false);
    const [canSetStatus, setCanSetStatus] = useState(false);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    // Same three chips the epic readiness tab carries. With ~17 gates and ~39
    // items, "what is mine" was previously unanswerable without reading it all.
    const [filters, setFilters] = useState<LaunchChecklistFilters>({
        myTasks: false,
        overdue: false,
        dueSoon: false,
    });
    const [canToggleTasks, setCanToggleTasks] = useState(false);
    const [canMarkNA, setCanMarkNA] = useState(false);
    // Checklist leads: it is the work. The old default was an Overview tab whose
    // contents now live in the page header.
    const [tab, setTab] = useState<"checklist" | "assets" | "artifacts" | "epics">("checklist");
    // The launch timeline expands in the header rather than occupying a tab, the
    // way /epics hangs "Show Release Timeline" off its release heading. Open by
    // default: the runway is the first thing worth seeing on a launch, and the
    // toggle is there to get it out of the way.
    const [showTimeline, setShowTimeline] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/me", { credentials: "include" });
                if (res.ok) {
                    const data = await res.json();
                    // /api/me now returns the caller's EFFECTIVE capabilities.
                    // These used to be computed here with canRolesPerform,
                    // which reads the hardcoded DEFAULT_RULES while every API
                    // route enforces the admin overrides in
                    // app_settings.permissions -- so in production this page
                    // showed edit controls to PMMs that /api/launches rejects
                    // (launches.manage is overridden to CPO only), task toggles
                    // to five roles that cannot use them, and a status control
                    // to two roles when the override grants it to nobody.
                    const can = (c: CapabilityId) =>
                        Array.isArray(data.capabilities) && data.capabilities.includes(c);

                    setCanManage(can("launches.manage"));
                    // Pausing or cancelling a launch is open to the launch owner
                    // (launches.manage) and to Product Ops / CPO, who hold
                    // launch.status.update but not the rest of the record.
                    setCanSetStatus(can("launches.manage") || can("launch.status.update"));
                    setCurrentUserEmail(data.user?.email ?? null);
                    setCanToggleTasks(can("launchCriteria.status.update"));
                    setCanMarkNA(can("launch.markNotApplicable"));
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

    /**
     * One panel per checklist row, replacing the separate assignee, note and link
     * modals this page used to open from three different cells. owner_email,
     * notes and links have all been accepted by the PATCH endpoint since March
     * with nothing rendering them; they are now edited together, in one request.
     *
     * Epic criteria put threaded comments in the notes column. A launch criterion
     * has nowhere to store a thread, so this stays a single text field.
     */
    const [detailTarget, setDetailTarget] = useState<
        { row: CriterionStatus; section: LaunchCriterionDetailSection } | null
    >(null);
    const [savingDetail, setSavingDetail] = useState(false);

    const saveDetail = async (patch: LaunchCriterionPatch) => {
        if (!detailTarget) return;

        // Normalised here rather than in the modal so a bad address leaves the
        // panel open with the draft intact instead of closing over a lost edit.
        let links = patch.links;
        if (links && links.length > 0) {
            const url = normalizeUrl(links[0].url);
            if (!url) {
                notifications.show({
                    color: "red",
                    message: "That does not look like a valid web address.",
                });
                return;
            }
            links = [{ url, ...(links[0].label ? { label: links[0].label } : {}) }];
        }

        const body: Record<string, unknown> = { criterion_id: detailTarget.row.criterion_id };
        if ("owner_email" in patch) body.owner_email = patch.owner_email;
        if ("notes" in patch) body.notes = patch.notes;
        if (links !== undefined) body.links = links;

        // Nothing but the id: the Save button is disabled when clean, so this is
        // only reachable by a race. Close rather than PATCH a no-op.
        if (Object.keys(body).length === 1) {
            setDetailTarget(null);
            return;
        }

        setSavingDetail(true);
        try {
            const res = await fetch(`/api/launch-criteria-status/${launchId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            await fetchLaunch();
            setDetailTarget(null);
        } catch (err) {
            console.error("Failed to save checklist row:", err);
            notifications.show({ color: "red", message: "Could not save those changes." });
        } finally {
            setSavingDetail(false);
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
        const status = nextAssetStatus(asset.status, canMarkNA);
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


    /**
     * A launch scheduled before one of its own epics ships. Kept out of readiness
     * on purpose: readiness says whether the GTM work is done, this says whether
     * the date is possible at all, and a launch can be 100% ready and still
     * impossible.
     */
    const dateConflicts = useMemo(
        () =>
            findEpicDateConflicts({
                launchDate: launch?.target_launch_date ?? null,
                epics: epics.map((e) => ({
                    id: e.id,
                    name: e.name,
                    target_launch_date: e.target_launch_date ?? null,
                })),
            }),
        [launch?.target_launch_date, epics]
    );

    /**
     * Rows after the chips, and the source the phase groups are built from -- so
     * a filter empties a group's table and drops the group when nothing in it
     * matches, rather than leaving headings over empty tables.
     */
    const filteredStatuses = useMemo(
        () =>
            filterLaunchChecklistRows(statuses, filters, {
                targetLaunchDate: launch?.target_launch_date ?? null,
                tier: launch?.tier ?? null,
                launchCreatedAt: launch?.created_at ?? null,
                currentUserEmail,
            }),
        [
            statuses,
            filters,
            launch?.target_launch_date,
            launch?.tier,
            launch?.created_at,
            currentUserEmail,
        ]
    );

    const filtersActive = anyLaunchChecklistFilterActive(filters);

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
        const ordered = [...filteredStatuses].sort((a, b) => {
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
    }, [filteredStatuses]);

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
                if ("target_launch_date" in fields || "tier" in fields) {
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

    // Every status can be pinned, so the list is the whole vocabulary plus an
    // Auto entry that names the date-derived value -- otherwise "Auto" gives no
    // hint about what unpinning would show.
    const statusOptions = useMemo(() => {
        const computed = launch?.computed_status ?? launch?.status ?? "Planning";
        return [
            { value: "AUTO", label: `Auto — ${computed}` },
            ...LAUNCH_STATUSES.map((value) => ({ value, label: value })),
        ];
    }, [launch?.computed_status, launch?.status]);

    /**
     * Tick one checklist item inside a gate.
     *
     * The gate's own status is derived from its items, so this does not write a
     * gate status -- it refetches and lets the API recompute. Optional items get
     * the extra NOT_APPLICABLE stop, the same cycle supporting assets use, because
     * the Beta gate's items must be closeable on a capability that runs no beta.
     */
    const handleToggleItem = useCallback(
        async (item: { id: string; status: TaskStatus; optional: boolean }) => {
            if (!launch) return;
            const next = nextAssetStatus(item.status as AssetStatus, canMarkNA);

            setUpdating(item.id);
            // Optimistic: the gate above it will settle when the refetch lands.
            setLaunch((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    launch_criterion_status: (prev.launch_criterion_status || []).map((s) => ({
                        ...s,
                        items: (s.items || []).map((i) =>
                            i.id === item.id ? { ...i, status: next as TaskStatus } : i
                        ),
                    })),
                };
            });

            try {
                const res = await fetch(`/api/launches/${launch.id}/items`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_row_id: item.id, status: next }),
                });
                if (!res.ok) throw new Error(await res.text());
                // Refetch so the gate's derived status and readiness catch up.
                await fetchLaunch();
            } catch (err) {
                console.error("Failed to update gate item:", err);
                notifications.show({ color: "red", message: "Could not update that item." });
                await fetchLaunch();
            } finally {
                setUpdating(null);
            }
        },
        [launch, fetchLaunch, canMarkNA]
    );

    const handleToggleStatus = useCallback(
        async (criterionId: string, currentStatus: TaskStatus) => {
            if (!launch) return;
            const nextStatus = nextCriterionStatus(currentStatus);

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

    /**
     * Whole days from today to the target date; negative once the date has passed.
     * Compared date-only so a launch scheduled for today never reads as "1 day out"
     * because of the clock.
     */
    const daysToLaunch = useMemo(() => {
        if (!launch?.target_launch_date) return null;
        const target = new Date(launch.target_launch_date + "T00:00:00");
        if (Number.isNaN(target.getTime())) return null;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return Math.round((target.getTime() - today.getTime()) / 86_400_000);
    }, [launch?.target_launch_date]);

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
                {/* Back link */}
                <div className="mb-3">
                    <button
                        onClick={() => router.push("/gtm-launches")}
                        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <IconArrowLeft size={16} />
                        Back to GTM Launches
                    </button>
                </div>

                {/* Sits ABOVE the title because it outranks readiness: no amount of GTM
                    readiness fixes a launch that lands before its own feature. Same slot
                    the epic page gives its launch-hold banner. */}
                {dateConflicts.length > 0 && (
                    <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 mb-4">
                        <div className="flex items-start gap-2">
                            <IconAlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-red-800">
                                    Launch date is before an epic ships
                                </div>
                                <p className="text-xs text-red-700 mt-1">
                                    {describeEpicDateConflicts(dateConflicts)}
                                </p>
                                <ul className="mt-2 space-y-0.5">
                                    {dateConflicts.map((c) => (
                                        <li key={c.epicId} className="text-xs text-red-700">
                                            <span className="font-medium">{c.epicName}</span> ships{" "}
                                            {formatDate(c.epicDate)} — {c.daysEarly} day
                                            {c.daysEarly === 1 ? "" : "s"} after this launch
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* Title row — name plus the launch's own fields inline, the way the epic
                    header carries tier/status/owner. These used to be a card on an
                    Overview tab, which meant every visit started one click away from the
                    work. */}
                <div className="flex flex-wrap justify-between items-center gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                        <h1
                            className="text-2xl font-bold text-gray-900 mb-2"
                            style={{ fontFamily: "var(--font-heading)" }}
                        >
                            {launch.name}
                        </h1>
                        <div className="flex gap-3 items-center flex-wrap">
                            <Select
                                aria-label="Tier"
                                placeholder="Tier"
                                size="xs"
                                style={{ width: 120 }}
                                data={[
                                    { value: "TIER_1", label: "Tier 1" },
                                    { value: "TIER_2", label: "Tier 2" },
                                ]}
                                value={launch.tier || null}
                                onChange={(val) => patchLaunch("tier", val)}
                                clearable
                                disabled={!canManage}
                            />
                            <div className="flex items-center gap-1">
                                <Select
                                    aria-label="Status"
                                    size="xs"
                                    style={{ width: 180 }}
                                    data={statusOptions}
                                    // AUTO is a sentinel, not a status: picking it
                                    // clears the override so the launch follows its
                                    // target date again.
                                    value={launch.status_override ?? "AUTO"}
                                    onChange={(val) => {
                                        if (!val) return;
                                        patchLaunch("status", val === "AUTO" ? null : val);
                                    }}
                                    disabled={!canSetStatus}
                                />
                                <Tooltip
                                    withArrow
                                    multiline
                                    label={
                                        <div style={{ maxWidth: 300, fontSize: 12, lineHeight: 1.5 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 8 }}>
                                                How is status determined?
                                            </div>
                                            Status normally follows the target launch date, so nobody has to
                                            keep it current. Pick any value to pin it instead, or Auto to
                                            hand it back to the date.
                                            <br />
                                            <br />
                                            <strong>Planning:</strong> no target date, or the workback has not
                                            opened yet
                                            <br />
                                            <strong>In Progress:</strong> inside the workback window before
                                            launch day
                                            <br />
                                            <strong>Launched:</strong> on the target launch date
                                            <br />
                                            <strong>Post-Launch:</strong> the day after launch onward
                                            <br />
                                            <strong>On Hold / Cancelled:</strong> set manually only
                                        </div>
                                    }
                                >
                                    <IconInfoCircle
                                        size={14}
                                        style={{ color: "var(--color-gray-400)", cursor: "help" }}
                                    />
                                </Tooltip>
                            </div>
                            <DateInput
                                aria-label="Target launch date"
                                placeholder="Target launch date"
                                size="xs"
                                style={{ width: 170 }}
                                value={launch.target_launch_date}
                                onChange={(val) => patchLaunch("target_launch_date", val || null)}
                                clearable
                                disabled={!canManage}
                            />
                            <Select
                                aria-label="Owner"
                                size="xs"
                                style={{ width: 190 }}
                                placeholder="Owner"
                                data={userOptions}
                                value={launch.owner_email}
                                onChange={(val) => {
                                    if (val !== launch.owner_email) patchLaunch("owner_email", val);
                                }}
                                searchable
                                clearable
                                nothingFoundMessage="No matching user"
                                disabled={!canManage}
                            />
                        </div>
                    </div>

                    {/* Readiness gauge. Reads the computed verdict rather than the stored
                        readiness_pct column so the number and the label can never
                        disagree with the checklist they summarise. */}
                    <div className="bg-white rounded-lg border border-gray-200 px-5 py-3 text-center min-w-[150px] flex-shrink-0">
                        <div className="text-2xl font-bold text-gray-900">
                            {readiness.readinessPct}%
                        </div>
                        <div
                            className={`inline-block mt-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${VERDICT_CLASS[readiness.verdict]}`}
                        >
                            {VERDICT_LABEL[readiness.verdict]}
                        </div>
                        <div className="text-xs text-gray-500 mt-1.5">
                            {checklistDone}/{statuses.length} tasks done
                        </div>
                        <div className="mt-1.5 w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${readiness.readinessPct >= 80 ? "bg-emerald-500" : readiness.readinessPct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${readiness.readinessPct}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Summary row — the facts that are not already an editable control
                    above, dot-separated the way the epic header does it. */}
                <div
                    className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2"
                    style={{
                        fontFamily: "var(--font-body)",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--color-gray-600)",
                    }}
                >
                    <span>
                        <span style={{ color: "var(--color-gray-500)" }}>Launch </span>
                        <span style={{ fontWeight: 500, color: "var(--color-gray-900)" }}>
                            {formatDate(launch.target_launch_date)}
                        </span>
                        {daysToLaunch !== null && (
                            <span style={{ color: "var(--color-gray-500)" }}>
                                {daysToLaunch === 0
                                    ? " (today)"
                                    : daysToLaunch > 0
                                        ? ` (${daysToLaunch} day${daysToLaunch === 1 ? "" : "s"} out)`
                                        : ` (${Math.abs(daysToLaunch)} day${Math.abs(daysToLaunch) === 1 ? "" : "s"} ago)`}
                            </span>
                        )}
                    </span>
                    <span style={{ color: "var(--color-gray-300)" }} aria-hidden>·</span>
                    <span>
                        <span style={{ color: "var(--color-gray-500)" }}>Gates </span>
                        <span style={{ fontWeight: 500, color: "var(--color-gray-900)" }}>
                            {readiness.gatesDone}/{readiness.gatesTotal} cleared
                        </span>
                    </span>
                    <span style={{ color: "var(--color-gray-300)" }} aria-hidden>·</span>
                    <span>
                        <span style={{ color: "var(--color-gray-500)" }}>Epics </span>
                        <span style={{ fontWeight: 500, color: "var(--color-gray-900)" }}>
                            {epics.length}
                        </span>
                    </span>
                    <span style={{ color: "var(--color-gray-300)" }} aria-hidden>·</span>
                    <button
                        type="button"
                        onClick={() => setShowTimeline((v) => !v)}
                        aria-expanded={showTimeline}
                        style={{
                            fontSize: "inherit",
                            fontFamily: "inherit",
                            color: "#2196F3",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#1976D2";
                            e.currentTarget.style.textDecoration = "underline";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = "#2196F3";
                            e.currentTarget.style.textDecoration = "none";
                        }}
                    >
                        {showTimeline ? "Hide Launch Timeline" : "Show Launch Timeline"}
                    </button>
                </div>

                {/* Expands in place above the tabs, matching where /epics drops its
                    release timeline relative to the table. */}
                {showTimeline && (
                    <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-end mb-3">
                            {launch?.tier && (
                                <span className="text-xs text-gray-400">
                                    {launch.tier === "TIER_1"
                                        ? "Tier 1 · ~15 week runway"
                                        : "Tier 2 · ~11 week runway"}
                                </span>
                            )}
                        </div>
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
                )}

                {/* Naming every item turned this into a paragraph -- with 14 gates the
                    at-risk list ran to six labels. A blocker is what stops GO, so name
                    the soonest few; at-risk is a count that jumps to the checklist,
                    which is where the work actually gets done. */}
                {(readiness.blockers.length > 0 || readiness.atRisk.length > 0) && (
                    <div
                        className={`mt-3 rounded-lg border px-4 py-2 text-xs ${VERDICT_CLASS[readiness.verdict]}`}
                    >
                        {readiness.blockers.length > 0 ? (
                            <>
                                <span className="font-medium">Blocking:</span>{" "}
                                {byDueDate(readiness.blockers).slice(0, MAX_NAMED_BLOCKERS).map((b) => b.label).join(" · ")}
                                {readiness.blockers.length > MAX_NAMED_BLOCKERS && (
                                    <>
                                        {" "}
                                        <button
                                            type="button"
                                            onClick={() => setTab("checklist")}
                                            className="underline underline-offset-2 hover:no-underline"
                                        >
                                            +{readiness.blockers.length - MAX_NAMED_BLOCKERS} more
                                        </button>
                                    </>
                                )}
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setTab("checklist")}
                                className="underline underline-offset-2 hover:no-underline"
                            >
                                {readiness.atRisk.length} item{readiness.atRisk.length === 1 ? "" : "s"} need
                                {readiness.atRisk.length === 1 ? "s" : ""} attention now
                            </button>
                        )}
                    </div>
                )}

                {/* Detail tabs — same strip epics use, via the shared DetailTabs.
                    Checklist leads for the same reason Readiness does on an epic: it is
                    the work, and it was previously one click behind an Overview tab. */}
                <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
                    <DetailTabs
                        ariaLabel="Launch detail tabs"
                        activeTab={tab}
                        onTabChange={(t) => setTab(t as typeof tab)}
                        tabs={[
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
                                value: "artifacts",
                                label: "Artifacts",
                            },
                            {
                                value: "epics",
                                label: "Epics",
                                badge: <TabCount>{epics.length}</TabCount>,
                            },
                        ]}
                    />

                    {/* The epic readiness tab's chips, same semantics. Rendered at
                        every width and allowed to wrap under the tabs, rather than
                        duplicated into a separate mobile block as on the epic page. */}
                    {tab === "checklist" && statuses.length > 0 && (
                        <Group gap="xs" align="center" className="pb-2">
                            <span className="text-sm font-medium text-gray-700">Filters</span>
                            {CHECKLIST_FILTERS.map(({ key, label }) => (
                                <Badge
                                    key={key}
                                    variant={filters[key] ? "filled" : "outline"}
                                    color="gray"
                                    style={{ cursor: "pointer" }}
                                    onClick={() =>
                                        setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
                                    }
                                >
                                    {label}
                                </Badge>
                            ))}
                        </Group>
                    )}
                </div>
                <div
                    className="rounded-b-lg rounded-tr-lg p-5 mb-8"
                    style={{
                        backgroundColor: "var(--color-tab-panel-bg)",
                        border: "1px solid var(--color-gray-900)",
                    }}
                    role="tabpanel"
                >
                {tab === "checklist" && (<>
                {/* Readiness checklist — same table shape epics use for criteria */}
                {statuses.length > 0 && (
                    <div className="space-y-4 mb-8">
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-sm font-semibold text-gray-700">Readiness Checklist</h2>
                            {/* Without this an active filter makes a launch look
                                finished rather than filtered. */}
                            {filtersActive && (
                                <span className="text-xs text-gray-400">
                                    {filteredStatuses.length} of {statuses.length} shown
                                </span>
                            )}
                        </div>

                        {filtersActive && filteredStatuses.length === 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center">
                                <p className="text-sm text-gray-500">
                                    No tasks match these filters.
                                </p>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setFilters({ myTasks: false, overdue: false, dueSoon: false })
                                    }
                                    className="mt-2 text-xs text-purple-600 underline underline-offset-2 hover:no-underline"
                                >
                                    Clear filters
                                </button>
                            </div>
                        )}

                        {[...phases.entries()].map(([phase, items]) => {
                            const isCollapsed = collapsedPhases.has(phase);
                            // NOT_APPLICABLE leaves the denominator rather than
                            // counting as done, so a phase whose remaining rows do
                            // not apply reads x/x instead of stalling below it.
                            // Same rule as groupProgress on the epic readiness table.
                            const phCounted = items.filter((i) => i.status !== "NOT_APPLICABLE");
                            const phDone = phCounted.filter((i) => i.status === "DONE").length;

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
                                            {phDone}/{phCounted.length} done
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
                                                onCycleItem={(_row, item) =>
                                                    handleToggleItem({
                                                        id: item.id,
                                                        status: item.status as TaskStatus,
                                                        optional: item.optional,
                                                    })
                                                }
                                                onCycleStatus={(row) => {
                                                    // A gate with items clears when its items clear,
                                                    // and a derived sign-off is answered on the epic.
                                                    // Silently doing nothing would read as a bug.
                                                    if (row.status_source === "items") {
                                                        notifications.show({
                                                            color: "gray",
                                                            message:
                                                                "This gate clears when its checklist items do — tick those instead.",
                                                        });
                                                        return;
                                                    }
                                                    handleToggleStatus(row.criterion_id, row.status);
                                                }}
                                                onOpenDetail={(row, section) =>
                                                    setDetailTarget({
                                                        row: row as CriterionStatus,
                                                        section,
                                                    })
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

                {/* Supporting assets - Marketing Brief Part 6, same table shape */}
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

                {tab === "artifacts" && (
                    <LaunchArtifactsPanel
                        launchId={launchId}
                        // Approving an artifact marks its runway criterion DONE,
                        // so readiness, the gate chain and the timeline all move.
                        onArtifactApproved={fetchLaunch}
                    />
                )}

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

            {/* One panel per checklist row, opened by the row chevron or by any of
                the inline cells, which each ask for their own field. */}
            <LaunchCriterionDetailModal
                row={detailTarget?.row ?? null}
                section={detailTarget?.section}
                userOptions={userOptions}
                canEdit={canToggleTasks}
                saving={savingDetail}
                onClose={() => setDetailTarget(null)}
                onSave={saveDetail}
            />

            {/* Link editor for the Assets tab: artifact rows store a links[] array, assets a single url. Checklist rows edit their link in the detail panel above. */}
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
