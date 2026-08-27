"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PurpleLoader } from "@/components/PurpleLoader";
import {
    Modal,
    TextInput,
    Select,
    Button,
    Stack,
    Group,
    SegmentedControl,
    Menu,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
    IconPlus,
    IconDotsVertical,
    IconArchive,
    IconArchiveOff,
    IconPencil,
    IconSearch,
} from "@tabler/icons-react";
import type { Launch } from "@/types/launches";
import { canRolesPerform } from "@/lib/permissions";

interface LaunchRow extends Launch {
    launch_epic?: Array<{
        id: string;
        epic_id: string;
        epic?: { id: string; name: string; tier: string; status: string };
    }>;
}

/** Clickable column header. Shows the arrow only on the active sort column. */
function SortableTh({
    label,
    sortKey,
    active,
    asc,
    onSort,
    width,
}: {
    label: string;
    sortKey: SortKey;
    active: SortKey;
    asc: boolean;
    onSort: (k: SortKey) => void;
    width?: string;
}) {
    const isActive = active === sortKey;
    return (
        <th
            className={`px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${width || ""}`}
        >
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-900 transition-colors"
            >
                {label}
                <span className={isActive ? "text-gray-900" : "text-transparent"} aria-hidden>
                    {asc ? "\u2191" : "\u2193"}
                </span>
            </button>
        </th>
    );
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

function tierBadge(tier: string | null) {
    if (tier === "TIER_1") {
        return (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Tier 1
            </span>
        );
    }
    if (tier === "TIER_2") {
        return (
            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Tier 2
            </span>
        );
    }
    return (
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            No Tier
        </span>
    );
}

function statusBadge(status: string) {
    const styles: Record<string, string> = {
        Planning: "bg-gray-100 text-gray-700",
        "In Progress": "bg-amber-100 text-amber-800",
        Launched: "bg-emerald-100 text-emerald-800",
        "Post-Launch": "bg-indigo-100 text-indigo-800",
    };
    const cls = styles[status] || "bg-gray-100 text-gray-700";
    return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
            {status}
        </span>
    );
}

function readinessBadge(pct: number) {
    let bg = "bg-gray-100";
    let text = "text-gray-700";
    if (pct >= 80) {
        bg = "bg-emerald-100";
        text = "text-emerald-800";
    } else if (pct >= 40) {
        bg = "bg-amber-100";
        text = "text-amber-800";
    } else if (pct > 0) {
        bg = "bg-red-100";
        text = "text-red-700";
    }
    return (
        <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : pct > 0 ? "bg-red-500" : "bg-gray-300"}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
                {pct}%
            </span>
        </div>
    );
}

/** Filter-control styling copied from the epics filter bar so the two match. */
const FILTER_INPUT_STYLES = {
    input: {
        borderRadius: 8,
        border: "1px solid var(--color-gray-300)",
        backgroundColor: "var(--color-gray-50)",
        fontFamily: "var(--font-body)",
    },
} as const;

type SortKey = "name" | "tier" | "status" | "target_launch_date" | "readiness_pct";

const EMPTY_FORM = {
    name: "",
    tier: "",
    target_launch_date: null as Date | null,
    owner_email: "",
    schedule_id: null as string | null,
};

interface ReleaseOption {
    id: number;
    release_name: string;
    launch_date: string | null;
}

export default function GTMLaunchesPage() {
    const router = useRouter();
    const [launches, setLaunches] = useState<LaunchRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("active");
    const [canManage, setCanManage] = useState(false);

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
                }
            } catch {
                // leave canManage false
            }
        })();
    }, []);

    // Create modal
    const [search, setSearch] = useState("");
    const [tierFilter, setTierFilter] = useState<string>("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [ownerFilter, setOwnerFilter] = useState<string>("ALL");
    const [sortKey, setSortKey] = useState<SortKey>("target_launch_date");
    const [sortAsc, setSortAsc] = useState(true);

    const toggleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortAsc((v) => !v);
        } else {
            setSortKey(key);
            // Dates read best oldest-first; everything else A-Z / low-first.
            setSortAsc(true);
        }
    };

    const [createOpen, setCreateOpen] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);

    const fetchLaunches = useCallback(async () => {
        try {
            const qs = filter === "all" || filter === "archived" ? "?include_archived=true" : "";
            const res = await fetch(`/api/launches${qs}`);
            if (res.ok) {
                const data = await res.json();
                setLaunches(data.launches || []);
            }
        } catch (err) {
            console.error("Failed to fetch launches:", err);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        setLoading(true);
        fetchLaunches();
    }, [fetchLaunches]);

    // A launch anchors to a release: the whole workback counts back from that
    // release date, so picking the release is what sets the schedule.
    const [releases, setReleases] = useState<ReleaseOption[]>([]);
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch("/api/releases");
                if (res.ok) {
                    const rows = await res.json();
                    setReleases(Array.isArray(rows) ? rows : []);
                }
            } catch {
                // Without the list the date can still be typed by hand.
            }
        })();
    }, []);

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
                // Without the list the owner can be set later on the detail page.
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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            notifications.show({ title: "Validation", message: "Name is required", color: "red" });
            return;
        }
        setCreating(true);
        try {
            const body: Record<string, any> = { name: formData.name.trim() };
            if (formData.tier) body.tier = formData.tier;
            if (formData.target_launch_date) {
                body.target_launch_date = formData.target_launch_date.toISOString().split("T")[0];
            }
            if (formData.owner_email) body.owner_email = formData.owner_email;
            if (formData.schedule_id) body.schedule_id = Number(formData.schedule_id);

            const res = await fetch("/api/launches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json();
                notifications.show({ title: "Error", message: err.error || "Failed to create launch", color: "red" });
                return;
            }

            const launch = await res.json();
            notifications.show({ title: "Created", message: `Launch "${launch.name}" created`, color: "teal" });
            setCreateOpen(false);
            setFormData(EMPTY_FORM);
            fetchLaunches();
        } catch {
            notifications.show({ title: "Error", message: "Failed to create launch", color: "red" });
        } finally {
            setCreating(false);
        }
    };

    const handleArchiveToggle = async (launch: LaunchRow) => {
        const newArchived = !launch.archived;
        try {
            const res = await fetch(`/api/launches/${launch.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ archived: newArchived }),
            });
            if (res.ok) {
                notifications.show({
                    title: newArchived ? "Archived" : "Restored",
                    message: `"${launch.name}" ${newArchived ? "archived" : "restored"}`,
                    color: "teal",
                });
                fetchLaunches();
            }
        } catch {
            notifications.show({ title: "Error", message: "Failed to update launch", color: "red" });
        }
    };

    const ownerOptions = useMemo(() => {
        const emails = Array.from(
            new Set(launches.map((l) => l.owner_email).filter((e): e is string => !!e))
        );
        return emails.map((email) => {
            const u = users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
            const name = u ? `${u.first_name || ""} ${u.last_name || ""}`.trim() : "";
            return { value: email, label: name || email };
        });
    }, [launches, users]);

    const displayedLaunches = useMemo(() => {
        const byArchived =
            filter === "archived"
                ? launches.filter((l) => l.archived)
                : filter === "active"
                  ? launches.filter((l) => !l.archived)
                  : launches;

        const filtered = byArchived.filter((l) => {
            if (search && !l.name.toLowerCase().includes(search.toLowerCase())) return false;
            if (tierFilter !== "ALL" && (l.tier ?? "") !== tierFilter) return false;
            if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
            if (ownerFilter !== "ALL" && (l.owner_email ?? "") !== ownerFilter) return false;
            return true;
        });

        const dir = sortAsc ? 1 : -1;
        return [...filtered].sort((a, b) => {
            if (sortKey === "readiness_pct") {
                return ((a.readiness_pct ?? 0) - (b.readiness_pct ?? 0)) * dir;
            }
            const av = a[sortKey];
            const bv = b[sortKey];
            // Missing values sort last regardless of direction, so an undated
            // launch never displaces a dated one at the top of the list.
            if (!av && !bv) return 0;
            if (!av) return 1;
            if (!bv) return -1;
            return String(av).localeCompare(String(bv)) * dir;
        });
    }, [launches, filter, search, tierFilter, statusFilter, ownerFilter, sortKey, sortAsc]);

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
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "var(--font-heading)" }}>
                            GTM Launches
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Manage launch readiness across your product portfolio
                        </p>
                    </div>
                    {canManage && (
                        <button
                            onClick={() => setCreateOpen(true)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                            <IconPlus size={16} />
                            New Launch
                        </button>
                    )}
                </div>

                {/* Filters — same controls and styling as the epics filter bar */}
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <SegmentedControl
                        value={filter}
                        onChange={setFilter}
                        size="xs"
                        data={[
                            { label: "Active", value: "active" },
                            { label: "Archived", value: "archived" },
                            { label: "All", value: "all" },
                        ]}
                    />
                    <TextInput
                        placeholder="Search launches..."
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        leftSection={<IconSearch size={14} />}
                        style={{ minWidth: 220 }}
                        styles={FILTER_INPUT_STYLES}
                    />
                    <Select
                        placeholder="Tier"
                        value={tierFilter}
                        onChange={(v) => setTierFilter(v || "ALL")}
                        data={[
                            { value: "ALL", label: "All Tiers" },
                            { value: "TIER_1", label: "Tier 1" },
                            { value: "TIER_2", label: "Tier 2" },
                        ]}
                        style={{ minWidth: 130 }}
                        styles={FILTER_INPUT_STYLES}
                    />
                    <Select
                        placeholder="Status"
                        value={statusFilter}
                        onChange={(v) => setStatusFilter(v || "ALL")}
                        data={[
                            { value: "ALL", label: "All Statuses" },
                            { value: "Planning", label: "Planning" },
                            { value: "In Progress", label: "In Progress" },
                            { value: "Launched", label: "Launched" },
                            { value: "Post-Launch", label: "Post-Launch" },
                        ]}
                        style={{ minWidth: 150 }}
                        styles={FILTER_INPUT_STYLES}
                    />
                    <Select
                        placeholder="Owner"
                        value={ownerFilter}
                        onChange={(v) => setOwnerFilter(v || "ALL")}
                        data={[{ value: "ALL", label: "All Owners" }, ...ownerOptions]}
                        searchable
                        style={{ minWidth: 170 }}
                        styles={FILTER_INPUT_STYLES}
                    />
                    {(search || tierFilter !== "ALL" || statusFilter !== "ALL" || ownerFilter !== "ALL") && (
                        <Button
                            variant="subtle"
                            size="xs"
                            onClick={() => {
                                setSearch("");
                                setTierFilter("ALL");
                                setStatusFilter("ALL");
                                setOwnerFilter("ALL");
                            }}
                        >
                            Clear
                        </Button>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                        {displayedLaunches.length} of {launches.length}
                    </span>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-gray-500">
                        <PurpleLoader size="sm" />
                        <span>Loading launches...</span>
                    </div>
                ) : displayedLaunches.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                        <p className="text-gray-500">
                            {filter === "archived" ? "No archived launches." : "No active launches yet."}
                        </p>
                        {filter === "active" && (
                            <p className="text-sm text-gray-400 mt-1">
                                Click &ldquo;New Launch&rdquo; to create your first GTM launch.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <SortableTh label="Launch" sortKey="name" active={sortKey} asc={sortAsc} onSort={toggleSort} />
                                    <SortableTh label="Tier" sortKey="tier" active={sortKey} asc={sortAsc} onSort={toggleSort} width="w-24" />
                                    <SortableTh label="Status" sortKey="status" active={sortKey} asc={sortAsc} onSort={toggleSort} width="w-32" />
                                    <SortableTh label="Target Date" sortKey="target_launch_date" active={sortKey} asc={sortAsc} onSort={toggleSort} width="w-36" />
                                    <SortableTh label="Readiness" sortKey="readiness_pct" active={sortKey} asc={sortAsc} onSort={toggleSort} width="w-44" />
                                    <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                                        <span className="sr-only">Actions</span>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {displayedLaunches.map((l) => {
                                    const epicCount = l.launch_epic?.length ?? 0;
                                    return (
                                        <tr
                                            key={l.id}
                                            onClick={() => router.push(`/gtm-launches/${l.id}`)}
                                            className="hover:bg-indigo-50/40 cursor-pointer transition-colors"
                                        >
                                            <td className="px-5 py-3.5">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-gray-900">
                                                        {l.name}
                                                    </span>
                                                    <span className="text-xs text-gray-400 mt-0.5">
                                                        {epicCount} epic{epicCount !== 1 ? "s" : ""}
                                                        {l.owner_email && ` · ${l.owner_email}`}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {tierBadge(l.tier)}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {statusBadge(l.status)}
                                            </td>
                                            <td className="px-5 py-3.5 text-sm text-gray-600">
                                                {formatDate(l.target_launch_date)}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {readinessBadge(l.readiness_pct)}
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                {canManage && (
                                                    <Menu position="bottom-end" width={160} shadow="md">
                                                        <Menu.Target>
                                                            <button
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="p-1 rounded hover:bg-gray-100 transition-colors"
                                                            >
                                                                <IconDotsVertical size={16} className="text-gray-400" />
                                                            </button>
                                                        </Menu.Target>
                                                        <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                                                            <Menu.Item
                                                                leftSection={<IconPencil size={14} />}
                                                                onClick={() => router.push(`/gtm-launches/${l.id}`)}
                                                            >
                                                                Edit
                                                            </Menu.Item>
                                                            <Menu.Item
                                                                leftSection={l.archived ? <IconArchiveOff size={14} /> : <IconArchive size={14} />}
                                                                onClick={() => handleArchiveToggle(l)}
                                                            >
                                                                {l.archived ? "Restore" : "Archive"}
                                                            </Menu.Item>
                                                        </Menu.Dropdown>
                                                    </Menu>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create Launch Modal */}
            <Modal
                opened={createOpen}
                onClose={() => { setCreateOpen(false); setFormData(EMPTY_FORM); }}
                title="New GTM Launch"
                size="md"
            >
                <form onSubmit={handleCreate}>
                    <Stack gap="md">
                        <TextInput
                            label="Launch Name"
                            placeholder="e.g. Q3 2026 Platform Release"
                            required
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
                        />
                        <Select
                            label="Tier"
                            placeholder="Select tier"
                            data={[
                                { value: "TIER_1", label: "Tier 1 — Major launch" },
                                { value: "TIER_2", label: "Tier 2 — Standard launch" },
                            ]}
                            value={formData.tier || null}
                            onChange={(val) => setFormData({ ...formData, tier: val || "" })}
                            clearable
                        />
                        <Select
                            label="Release"
                            placeholder="Anchor this launch to a release"
                            description="Sets the target date, which the whole workback counts back from."
                            data={releaseOptions}
                            value={formData.schedule_id}
                            onChange={(val) => {
                                const rel = releases.find((r) => String(r.id) === val);
                                setFormData({
                                    ...formData,
                                    schedule_id: val,
                                    // Selecting a release fills the date in; clearing it
                                    // leaves whatever was there to be edited by hand.
                                    target_launch_date: rel?.launch_date
                                        ? new Date(`${rel.launch_date}T00:00:00`)
                                        : formData.target_launch_date,
                                });
                            }}
                            searchable
                            clearable
                        />
                        <DateInput
                            label="Target Launch Date"
                            placeholder="Pick a date"
                            description={
                                formData.schedule_id
                                    ? "Taken from the release above; override if this launch lands off-cycle."
                                    : undefined
                            }
                            value={formData.target_launch_date}
                            onChange={(val) => setFormData({ ...formData, target_launch_date: val as Date | null })}
                            clearable
                        />
                        <Select
                            label="Owner"
                            placeholder="Search people..."
                            description="PMM accountable for this launch. Every downstream artifact defaults to them."
                            data={userOptions}
                            value={formData.owner_email || null}
                            onChange={(val) => setFormData({ ...formData, owner_email: val || "" })}
                            searchable
                            clearable
                            nothingFoundMessage="No matching user"
                        />
                        <Group justify="flex-end" mt="sm">
                            <Button variant="default" onClick={() => { setCreateOpen(false); setFormData(EMPTY_FORM); }}>
                                Cancel
                            </Button>
                            <Button type="submit" loading={creating}>
                                Create Launch
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </main>
    );
}
