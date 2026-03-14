"use client";

import React, { useState, useCallback } from "react";
import { IconPencil, IconTrash, IconPlus } from "@tabler/icons-react";
import { useSettings } from "@/contexts/SettingsContext";
import { addLaunchScheduleEntry, updateLaunchScheduleEntry, deleteLaunchScheduleEntry } from "@/lib/services/settingsService";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function LaunchScheduleSection() {
    const { launchSchedule, launchScheduleLoading, fetchLaunchSchedule } = useSettings();

    const [nameInput, setNameInput] = useState("");
    const [dateInput, setDateInput] = useState("");
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState("");
    const [editDate, setEditDate] = useState("");
    const [saving, setSaving] = useState(false);

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

    const handleDelete = useCallback(async (id: number) => {
        setSaving(true);
        try {
            await deleteLaunchScheduleEntry(id);
            await fetchLaunchSchedule();
        } catch (error: any) {
            console.error("Failed to delete launch schedule entry:", error);
        } finally {
            setSaving(false);
        }
    }, [fetchLaunchSchedule]);

    const startEdit = (entry: any) => {
        setEditingId(entry.id);
        setEditName(entry.release_name || "");
        setEditDate(entry.launch_date || "");
    };

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Launch Schedule</h2>
                        <p className="text-sm text-gray-500">Manage launch windows and target dates</p>
                    </div>
                </div>

                {/* Add new entry */}
                <div className="flex items-end gap-3 mb-6 pb-6 border-b border-gray-200">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input
                            type="text"
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            placeholder="e.g., Q2 Product Launch"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                    </div>
                    <div className="w-48">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Target Date</label>
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

                {/* List */}
                {launchScheduleLoading ? (
                    <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
                        <PurpleLoader size="sm" />
                        <span>Loading...</span>
                    </div>
                ) : launchSchedule.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500">No launch schedule entries yet.</p>
                    </div>
                ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 w-40">Target Date</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 w-24">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {launchSchedule.map((entry: any) => (
                                    <tr key={entry.id} className="hover:bg-gray-50">
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
                                                <td className="px-4 py-2 text-sm font-medium text-gray-900">{entry.release_name}</td>
                                                <td className="px-4 py-2 text-sm text-gray-500">
                                                    {entry.launch_date ? new Date(entry.launch_date + 'T00:00:00').toLocaleDateString() : "—"}
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
