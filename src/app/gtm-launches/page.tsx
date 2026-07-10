"use client";

import React, { useState, useEffect, useCallback } from "react";
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
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import {
    IconPlus,
    IconDotsVertical,
    IconArchive,
    IconArchiveOff,
    IconPencil,
} from "@tabler/icons-react";
import type { Launch } from "@/types/launches";

interface LaunchRow extends Launch {
    launch_epic?: Array<{
        id: string;
        epic_id: string;
        epic?: { id: string; name: string; tier: string; status: string };
    }>;
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

const EMPTY_FORM = { name: "", tier: "", target_launch_date: null as Date | null, owner_email: "" };

export default function GTMLaunchesPage() {
    const router = useRouter();
    const [launches, setLaunches] = useState<LaunchRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("active");

    // Create modal
    const [createOpen, setCreateOpen] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [creating, setCreating] = useState(false);

    // Row action menu
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

    const fetchLaunches = useCallback(async () => {
        try {
            const qs = filter === "all" ? "?include_archived=true" : "";
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
        setMenuOpenId(null);
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

    const displayedLaunches = filter === "archived"
        ? launches.filter((l) => l.archived)
        : filter === "active"
            ? launches.filter((l) => !l.archived)
            : launches;

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
                    <button
                        onClick={() => setCreateOpen(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <IconPlus size={16} />
                        New Launch
                    </button>
                </div>

                {/* Filter toggle */}
                <div className="mb-4">
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
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Launch
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                                        Tier
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                                        Status
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                                        Target Date
                                    </th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-44">
                                        Readiness
                                    </th>
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
                                                <div className="relative inline-block">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMenuOpenId(menuOpenId === l.id ? null : l.id);
                                                        }}
                                                        className="p-1 rounded hover:bg-gray-100 transition-colors"
                                                    >
                                                        <IconDotsVertical size={16} className="text-gray-400" />
                                                    </button>
                                                    {menuOpenId === l.id && (
                                                        <div
                                                            className="absolute right-0 top-8 z-20 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                onClick={() => {
                                                                    setMenuOpenId(null);
                                                                    router.push(`/gtm-launches/${l.id}`);
                                                                }}
                                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                            >
                                                                <IconPencil size={14} />
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleArchiveToggle(l)}
                                                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                                            >
                                                                {l.archived ? (
                                                                    <>
                                                                        <IconArchiveOff size={14} />
                                                                        Restore
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <IconArchive size={14} />
                                                                        Archive
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
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
                        <DateInput
                            label="Target Launch Date"
                            placeholder="Pick a date"
                            value={formData.target_launch_date}
                            onChange={(val) => setFormData({ ...formData, target_launch_date: val as Date | null })}
                            clearable
                        />
                        <TextInput
                            label="Owner Email"
                            placeholder="owner@clearcompany.com"
                            value={formData.owner_email}
                            onChange={(e) => setFormData({ ...formData, owner_email: e.currentTarget.value })}
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
