"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { IconPencil, IconTrash, IconPlus, IconChevronDown, IconChevronRight, IconX, IconRocket } from "@tabler/icons-react";
import { useSettings } from "@/contexts/SettingsContext";
import { addLaunchScheduleEntry, updateLaunchScheduleEntry, deleteLaunchScheduleEntry } from "@/lib/services/settingsService";
import { PurpleLoader } from "@/components/PurpleLoader";
import type { Launch } from "@/types/launches";

interface EpicOption {
    id: string;
    name: string;
    tier: string;
    status: string;
    release_name?: string;
}

export default function LaunchScheduleSection() {
    const { launchSchedule, launchScheduleLoading, fetchLaunchSchedule } = useSettings();

    const [nameInput, setNameInput] = useState("");
    const [dateInput, setDateInput] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editDate, setEditDate] = useState("");
    const [saving, setSaving] = useState(false);

    // Launch management state
    const [launches, setLaunches] = useState<Launch[]>([]);
    const [launchesLoading, setLaunchesLoading] = useState(true);
    const [epics, setEpics] = useState<EpicOption[]>([]);
    const [expandedScheduleId, setExpandedScheduleId] = useState<number | null>(null);
    const [creatingLaunchForSchedule, setCreatingLaunchForSchedule] = useState<number | null>(null);
    const [newLaunchName, setNewLaunchName] = useState("");
    const [savingLaunch, setSavingLaunch] = useState(false);
    const [addingEpicToLaunch, setAddingEpicToLaunch] = useState<string | null>(null);
    const [epicSearchQuery, setEpicSearchQuery] = useState("");

    // Fetch launches and epics on mount
    useEffect(() => {
        fetchLaunches();
        fetchEpics();
    }, []);

    const fetchLaunches = async () => {
        setLaunchesLoading(true);
        try {
            const res = await fetch("/api/launches");
            if (res.ok) {
                const data = await res.json();
                setLaunches(data.launches || []);
            }
        } catch (err) {
            console.error("Failed to fetch launches:", err);
        } finally {
            setLaunchesLoading(false);
        }
    };

    const fetchEpics = async () => {
        try {
            const res = await fetch("/api/epics");
            if (res.ok) {
                const data = await res.json();
                setEpics(
                    (data || []).map((e: any) => ({
                        id: e.id,
                        name: e.name,
                        tier: e.tier,
                        status: e.status,
                        release_name: e.release_name,
                    }))
                );
            }
        } catch (err) {
            console.error("Failed to fetch epics:", err);
        }
    };

    // Build a map of epic_id -> launch for quick lookup
    const epicToLaunchMap = useMemo(() => {
        const map = new Map<string, { launchId: string; launchName: string }>();
        launches.forEach((launch) => {
            (launch.epics || []).forEach((le) => {
                map.set(le.epic_id, { launchId: launch.id, launchName: launch.name });
            });
        });
        return map;
    }, [launches]);

    // Get launches for a specific schedule entry
    const getLaunchesForSchedule = useCallback(
        (scheduleId: number) => {
            return launches.filter((l) => l.schedule_id === scheduleId && !l.archived);
        },
        [launches]
    );

    // Get unassigned launches (no schedule_id)
    const unassignedLaunches = useMemo(() => {
        return launches.filter((l) => !l.schedule_id && !l.archived);
    }, [launches]);

    // Filter epics for the add-epic dropdown
    const getAvailableEpics = useCallback(
        (launchId: string) => {
            const assignedEpicIds = new Set(
                launches
                    .find((l) => l.id === launchId)
                    ?.epics?.map((le) => le.epic_id) || []
            );
            return epics.filter(
                (e) =>
                    !assignedEpicIds.has(e.id) &&
                    e.name.toLowerCase().includes(epicSearchQuery.toLowerCase())
            );
        },
        [epics, launches, epicSearchQuery]
    );

    const handleAdd = useCallback(async () => {
        if (!nameInput.trim()) return;
        setSaving(true);
        try {
            await addLaunchScheduleEntry({
                release_name: nameInput.trim(),
                launch_date: dateInput || undefined,
            });
            setNameInput("");
            setDateInput("");
            await fetchLaunchSchedule();
        } catch (error: any) {
            console.error("Failed to add launch schedule entry:", error);
        } finally {
            setSaving(false);
        }
    }, [nameInput, dateInput, fetchLaunchSchedule]);

    const handleUpdate = useCallback(async () => {
        if (!editingId || !editName.trim()) return;
        setSaving(true);
        try {
            await updateLaunchScheduleEntry(editingId, {
                release_name: editName.trim(),
                launch_date: editDate || null,
            });
            setEditingId(null);
            await fetchLaunchSchedule();
        } catch (error: any) {
            console.error("Failed to update launch schedule entry:", error);
        } finally {
            setSaving(false);
        }
    }, [editingId, editName, editDate, fetchLaunchSchedule]);

    const handleDelete = useCallback(
        async (id: number) => {
            setSaving(true);
            try {
                await deleteLaunchScheduleEntry(id);
                await fetchLaunchSchedule();
            } catch (error: any) {
                console.error("Failed to delete launch schedule entry:", error);
            } finally {
                setSaving(false);
            }
        },
        [fetchLaunchSchedule]
    );

    const startEdit = (entry: any) => {
        setEditingId(entry.id);
        setEditName(entry.release_name || "");
        setEditDate(entry.launch_date || "");
    };

    const handleCreateLaunch = async (scheduleId: number) => {
        if (!newLaunchName.trim()) return;
        setSavingLaunch(true);
        try {
            const res = await fetch("/api/launches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newLaunchName.trim(),
                    schedule_id: scheduleId,
                }),
            });
            if (!res.ok) throw new Error("Failed to create launch");
            setNewLaunchName("");
            setCreatingLaunchForSchedule(null);
            await fetchLaunches();
        } catch (err: any) {
            console.error("Failed to create launch:", err);
        } finally {
            setSavingLaunch(false);
        }
    };

    const handleDeleteLaunch = async (launchId: string) => {
        try {
            const res = await fetch(`/api/launches/${launchId}`, { method: "DELETE" });
            if (!res.ok) {
                // If no DELETE endpoint, archive instead
                await fetch(`/api/launches/${launchId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ archived: true }),
                });
            }
            await fetchLaunches();
        } catch (err: any) {
            console.error("Failed to delete launch:", err);
        }
    };

    const handleAddEpicToLaunch = async (launchId: string, epicId: string) => {
        try {
            // If epic is already in another launch, unassign first
            const current = epicToLaunchMap.get(epicId);
            if (current && current.launchId !== launchId) {
                await fetch(
                    `/api/launches/${current.launchId}/epics?epic_id=${epicId}`,
                    { method: "DELETE" }
                );
            }
            const res = await fetch(`/api/launches/${launchId}/epics`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ epic_id: epicId }),
            });
            if (!res.ok) throw new Error("Failed to add epic to launch");
            setAddingEpicToLaunch(null);
            setEpicSearchQuery("");
            await fetchLaunches();
        } catch (err: any) {
            console.error("Failed to add epic to launch:", err);
        }
    };

    const handleRemoveEpicFromLaunch = async (
        launchId: string,
        epicId: string
    ) => {
        try {
            const res = await fetch(
                `/api/launches/${launchId}/epics?epic_id=${epicId}`,
                { method: "DELETE" }
            );
            if (!res.ok) throw new Error("Failed to remove epic from launch");
            await fetchLaunches();
        } catch (err: any) {
            console.error("Failed to remove epic from launch:", err);
        }
    };

    const renderLaunchCard = (launch: Launch) => {
        const epicsList = launch.epics || [];
        const isAddingEpic = addingEpicToLaunch === launch.id;
        const availableEpics = getAvailableEpics(launch.id);

        return (
            <div
                key={launch.id}
                className="border border-gray-200 rounded-lg bg-gray-50 p-4 mb-3"
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <IconRocket className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-semibold text-gray-900">
                            {launch.name}
                        </span>
                        {launch.status && (
                            <span
                                className="px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                    backgroundColor:
                                        launch.status === "Launched"
                                            ? "#D1FAE5"
                                            : launch.status === "In Progress"
                                            ? "#FEF3C7"
                                            : "#F3F4F6",
                                    color:
                                        launch.status === "Launched"
                                            ? "#065F46"
                                            : launch.status === "In Progress"
                                            ? "#92400E"
                                            : "#374151",
                                }}
                            >
                                {launch.status}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={() => handleDeleteLaunch(launch.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                        title="Remove launch"
                    >
                        <IconTrash className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Epics in this launch */}
                {epicsList.length > 0 ? (
                    <div className="space-y-1.5 mb-3">
                        {epicsList.map((le) => (
                            <div
                                key={le.epic_id}
                                className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-1.5"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <span
                                        className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                                            le.epic?.tier === "TIER_1"
                                                ? "bg-purple-100 text-purple-800"
                                                : le.epic?.tier === "TIER_2"
                                                ? "bg-blue-100 text-blue-800"
                                                : "bg-gray-100 text-gray-800"
                                        }`}
                                    >
                                        {le.epic?.tier?.replace("_", " ") || "—"}
                                    </span>
                                    <span className="text-sm text-gray-900 truncate">
                                        {le.epic?.name || le.epic_id}
                                    </span>
                                </div>
                                <button
                                    onClick={() =>
                                        handleRemoveEpicFromLaunch(
                                            launch.id,
                                            le.epic_id
                                        )
                                    }
                                    className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 flex-shrink-0 ml-2"
                                    title="Remove from launch"
                                >
                                    <IconX className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-gray-400 mb-3">
                        No epics assigned yet.
                    </p>
                )}

                {/* Add epic */}
                {isAddingEpic ? (
                    <div className="relative">
                        <input
                            type="text"
                            value={epicSearchQuery}
                            onChange={(e) => setEpicSearchQuery(e.target.value)}
                            placeholder="Search epics to add..."
                            className="w-full px-3 py-1.5 border border-amber-300 rounded text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    setAddingEpicToLaunch(null);
                                    setEpicSearchQuery("");
                                }
                            }}
                        />
                        {availableEpics.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                {availableEpics.slice(0, 20).map((epic) => (
                                    <button
                                        key={epic.id}
                                        onClick={() =>
                                            handleAddEpicToLaunch(
                                                launch.id,
                                                epic.id
                                            )
                                        }
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center gap-2 border-b border-gray-100 last:border-b-0"
                                    >
                                        <span
                                            className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                                                epic.tier === "TIER_1"
                                                    ? "bg-purple-100 text-purple-800"
                                                    : epic.tier === "TIER_2"
                                                    ? "bg-blue-100 text-blue-800"
                                                    : "bg-gray-100 text-gray-800"
                                            }`}
                                        >
                                            {epic.tier?.replace("_", " ")}
                                        </span>
                                        <span className="truncate text-gray-900">
                                            {epic.name}
                                        </span>
                                        {epicToLaunchMap.has(epic.id) && (
                                            <span className="text-xs text-amber-600 flex-shrink-0">
                                                (in {epicToLaunchMap.get(epic.id)!.launchName})
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        {epicSearchQuery && availableEpics.length === 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm text-gray-500">
                                No matching epics found.
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        onClick={() => {
                            setAddingEpicToLaunch(launch.id);
                            setEpicSearchQuery("");
                        }}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                    >
                        <IconPlus className="w-3.5 h-3.5" />
                        Add epic
                    </button>
                )}
            </div>
        );
    };

    const renderScheduleRow = (entry: any) => {
        const isExpanded = expandedScheduleId === entry.id;
        const scheduleLaunches = getLaunchesForSchedule(entry.id);
        const isCreating = creatingLaunchForSchedule === entry.id;

        return (
            <React.Fragment key={entry.id}>
                <tr className="hover:bg-gray-50">
                    {editingId === entry.id ? (
                        <>
                            <td className="px-4 py-2">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                            </td>
                            <td className="px-4 py-2">
                                <input
                                    type="date"
                                    value={editDate}
                                    onChange={(e) => setEditDate(e.target.value)}
                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                />
                            </td>
                            <td className="px-4 py-2">
                                <span className="text-xs text-gray-400">—</span>
                            </td>
                            <td className="px-4 py-2 text-right">
                                <div className="flex justify-end gap-1">
                                    <button
                                        onClick={handleUpdate}
                                        disabled={saving}
                                        className="px-2 py-1 text-xs text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setEditingId(null)}
                                        className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </td>
                        </>
                    ) : (
                        <>
                            <td className="px-4 py-2">
                                <button
                                    onClick={() =>
                                        setExpandedScheduleId(
                                            isExpanded ? null : entry.id
                                        )
                                    }
                                    className="flex items-center gap-2 text-sm font-medium text-gray-900 hover:text-amber-700"
                                >
                                    {isExpanded ? (
                                        <IconChevronDown className="w-4 h-4 text-gray-400" />
                                    ) : (
                                        <IconChevronRight className="w-4 h-4 text-gray-400" />
                                    )}
                                    {entry.release_name}
                                </button>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-500">
                                {entry.launch_date
                                    ? new Date(
                                          entry.launch_date + "T00:00:00"
                                      ).toLocaleDateString()
                                    : "—"}
                            </td>
                            <td className="px-4 py-2">
                                {launchesLoading ? (
                                    <PurpleLoader size="sm" />
                                ) : scheduleLaunches.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {scheduleLaunches.map((l) => (
                                            <span
                                                key={l.id}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800"
                                            >
                                                <IconRocket className="w-3 h-3" />
                                                {l.name}
                                                <span className="text-amber-500">
                                                    ({l.epics?.length || 0})
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-xs text-gray-400">
                                        No launches
                                    </span>
                                )}
                            </td>
                            <td className="px-4 py-2 text-right">
                                <div className="flex justify-end gap-1">
                                    <button
                                        onClick={() => startEdit(entry)}
                                        className="p-1 rounded hover:bg-gray-100 text-gray-400"
                                        title="Edit"
                                    >
                                        <IconPencil className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(entry.id)}
                                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                                        title="Delete"
                                    >
                                        <IconTrash className="w-4 h-4" />
                                    </button>
                                </div>
                            </td>
                        </>
                    )}
                </tr>
                {/* Expanded row: launches & epics */}
                {isExpanded && editingId !== entry.id && (
                    <tr>
                        <td colSpan={4} className="px-4 py-3 bg-gray-50/50">
                            <div className="ml-6">
                                {scheduleLaunches.map(renderLaunchCard)}

                                {/* Create new launch */}
                                {isCreating ? (
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="text"
                                            value={newLaunchName}
                                            onChange={(e) =>
                                                setNewLaunchName(e.target.value)
                                            }
                                            placeholder="Launch name..."
                                            className="flex-1 px-3 py-1.5 border border-amber-300 rounded text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter")
                                                    handleCreateLaunch(entry.id);
                                                if (e.key === "Escape") {
                                                    setCreatingLaunchForSchedule(
                                                        null
                                                    );
                                                    setNewLaunchName("");
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={() =>
                                                handleCreateLaunch(entry.id)
                                            }
                                            disabled={
                                                !newLaunchName.trim() ||
                                                savingLaunch
                                            }
                                            className="px-3 py-1.5 text-xs text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50 font-medium"
                                        >
                                            {savingLaunch ? (
                                                <PurpleLoader size="sm" />
                                            ) : (
                                                "Create"
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setCreatingLaunchForSchedule(
                                                    null
                                                );
                                                setNewLaunchName("");
                                            }}
                                            className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() =>
                                            setCreatingLaunchForSchedule(
                                                entry.id
                                            )
                                        }
                                        className="mt-2 text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                                    >
                                        <IconPlus className="w-3.5 h-3.5" />
                                        Create launch
                                    </button>
                                )}
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                        <svg
                            className="w-6 h-6 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                            Launch Schedule
                        </h2>
                        <p className="text-sm text-gray-500">
                            Manage launch windows, create launches, and assign
                            epics to each launch
                        </p>
                    </div>
                </div>

                {/* Add new schedule entry */}
                <div className="flex items-end gap-3 mb-6 pb-6 border-b border-gray-200">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Name
                        </label>
                        <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="e.g., Q2 Product Launch"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                    </div>
                    <div className="w-48">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Target Date
                        </label>
                        <input
                            type="date"
                            value={dateInput}
                            onChange={(e) => setDateInput(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                    </div>
                    <button
                        onClick={handleAdd}
                        disabled={!nameInput.trim() || saving}
                        className="px-4 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 font-medium transition-colors flex items-center gap-1"
                    >
                        <IconPlus className="w-4 h-4" />
                        Add
                    </button>
                </div>

                {/* Schedule list with launches */}
                {launchScheduleLoading ? (
                    <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
                        <PurpleLoader size="sm" />
                        <span>Loading...</span>
                    </div>
                ) : launchSchedule.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500">
                            No launch schedule entries yet.
                        </p>
                    </div>
                ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                        Name
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-40">
                                        Target Date
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                                        Launches
                                    </th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 w-24">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {launchSchedule.map((entry: any) =>
                                    renderScheduleRow(entry)
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Unassigned launches */}
                {unassignedLaunches.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">
                            Unassigned Launches
                        </h3>
                        <p className="text-xs text-gray-500 mb-3">
                            These launches were created but not linked to a
                            schedule entry.
                        </p>
                        {unassignedLaunches.map(renderLaunchCard)}
                    </div>
                )}
            </div>
        </div>
    );
}
