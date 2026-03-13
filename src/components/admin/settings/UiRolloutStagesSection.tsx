"use client";

import React, { useState } from "react";
import { Drawer, Button, Group, Stack, TextInput, NumberInput, Checkbox } from "@mantine/core";
import { IconGripVertical, IconPencil } from "@tabler/icons-react";
import { RichText } from "@/components/admin/RichText";
import { PurpleLoader } from "../../PurpleLoader";
import { LaunchStagesChart } from "@/components/admin/LaunchStagesChart";
import type { LaunchStage, LaunchStageLevelDurations } from "./LaunchStagesSection";
import { addLaunchStage, updateLaunchStage, deleteLaunchStage, reorderLaunchStages } from "@/lib/services/settingsService";

function getLevelDurationsDisplay(level_durations: LaunchStageLevelDurations | null | undefined): string {
  if (!level_durations || typeof level_durations !== "object") return "—";
  const parts: string[] = [];
  for (const level of ["1", "2", "3"]) {
    const d = level_durations[level];
    if (d && typeof d.min_days === "number" && typeof d.max_days === "number") {
      parts.push(`L${level}: ${d.min_days}-${d.max_days}d`);
    }
  }
  return parts.length ? parts.join("; ") : "—";
}

type Props = {
  stages: LaunchStage[];
  loading: boolean;
  fetchStages: () => Promise<void>;
};

export default function UiRolloutStagesSection({ stages, loading, fetchStages }: Props) {
  const [draggedStageId, setDraggedStageId] = useState<number | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDuration, setEditingDuration] = useState("");
  const [editingDetails, setEditingDetails] = useState("");
  const [editingIsGate, setEditingIsGate] = useState(false);
  const [editingLevelDurations, setEditingLevelDurations] = useState<LaunchStageLevelDurations>({});

  const handleAdd = async () => {
    if (!editingName) {
      alert("Please enter a stage name");
      return;
    }
    try {
      const sortOrder =
        stages.length > 0 ? Math.max(...stages.map((s) => s.sort_order)) + 1 : 1;
      await addLaunchStage({
        name: editingName,
        sort_order: sortOrder,
        duration_days: editingDuration ? parseInt(editingDuration) : null,
        details: editingDetails || null,
        scope: "ui_rollout",
        level_durations: Object.keys(editingLevelDurations).length ? editingLevelDurations : null,
        is_gate: editingIsGate,
      });
      setEditingOpen(false);
      resetEditing();
      await fetchStages();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    try {
      await updateLaunchStage({
        id: editingId,
        name: editingName,
        duration_days: editingDuration ? parseInt(editingDuration) : null,
        details: editingDetails || null,
        level_durations: Object.keys(editingLevelDurations).length ? editingLevelDurations : null,
        is_gate: editingIsGate,
      });
      setEditingOpen(false);
      resetEditing();
      await fetchStages();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this UI Rollout stage?")) return;
    try {
      await deleteLaunchStage(id);
      setEditingOpen(false);
      resetEditing();
      await fetchStages();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleReorder = async (draggedId: number, targetId: number, targetIndex: number) => {
    const draggedIndex = stages.findIndex((s) => s.id === draggedId);
    if (draggedIndex === -1 || draggedIndex === targetIndex) return;
    const newStages = [...stages];
    const [draggedStage] = newStages.splice(draggedIndex, 1);
    newStages.splice(targetIndex, 0, draggedStage);
    const reordered = newStages.map((stage, index) => ({
      ...stage,
      sort_order: index + 1,
    }));
    try {
      await reorderLaunchStages(reordered);
      await fetchStages();
    } catch (error: any) {
      console.error("Failed to reorder stages:", error);
      alert("Failed to reorder stages. " + (error?.message || error));
      await fetchStages();
    }
  };

  function resetEditing() {
    setEditingId(null);
    setEditingName("");
    setEditingDuration("");
    setEditingDetails("");
    setEditingIsGate(false);
    setEditingLevelDurations({});
  }

  function openEdit(stage: LaunchStage) {
    setEditingId(stage.id);
    setEditingName(stage.name);
    setEditingDuration(stage.duration_days?.toString() || "");
    setEditingDetails(stage.details || "");
    setEditingIsGate(stage.is_gate === true);
    setEditingLevelDurations(
      (stage.level_durations && typeof stage.level_durations === "object"
        ? { ...stage.level_durations }
        : {}) as LaunchStageLevelDurations
    );
    setEditingOpen(true);
  }

  function openAdd() {
    resetEditing();
    setEditingOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-lg flex items-center justify-center">
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
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">UI Rollout Stages</h2>
              <p className="text-sm text-gray-500">
                Stages for UI Framework epics (Level 1–3). Durations can vary by impact level.
              </p>
            </div>
          </div>
          {!loading && (
            <button
              onClick={openAdd}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              title="Add New Stage"
            >
              + Add
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 flex items-center justify-center gap-2">
            <PurpleLoader size="sm" />
            <span>Loading...</span>
          </div>
        ) : stages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No UI Rollout stages found.</p>
            <p className="text-sm text-gray-400">
              Add stages for the UI Framework rollout path (e.g. UX Preview, CS Prep, Cohort 1).
            </p>
          </div>
        ) : (
          <div className="border-2 border-indigo-200 rounded-lg bg-indigo-50 overflow-hidden">
            <table className="min-w-full divide-y divide-indigo-200 table-fixed">
              <colgroup>
                <col className="w-12" />
                <col className="w-16" />
                <col className="w-auto" />
                <col className="w-48" />
                <col className="w-24" />
                <col className="w-auto" />
                <col className="w-32" />
              </colgroup>
              <thead className="bg-indigo-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900 w-12" />
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900 w-16">
                    Rank
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">
                    Stage Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900 w-48">
                    Level durations
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900 w-24">
                    Gate
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">
                    Details
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-indigo-900 w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-indigo-200">
                {stages.map((stage, index) => (
                  <tr
                    key={stage.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (draggedStageId !== stage.id) e.currentTarget.classList.add("bg-indigo-100");
                    }}
                    onDragLeave={(e) => e.currentTarget.classList.remove("bg-indigo-100")}
                    onDrop={async (e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("bg-indigo-100");
                      if (draggedStageId && draggedStageId !== stage.id) {
                        await handleReorder(draggedStageId, stage.id, index);
                      }
                      setDraggedStageId(null);
                    }}
                    className={`hover:bg-indigo-50 transition-colors ${draggedStageId === stage.id ? "opacity-50" : ""}`}
                  >
                    <td
                      className="px-2 py-3 whitespace-nowrap w-12 cursor-move"
                      draggable
                      onDragStart={(e) => {
                        setDraggedStageId(stage.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDraggedStageId(null)}
                    >
                      <div className="flex items-center justify-center text-gray-400">
                        <IconGripVertical className="w-5 h-5" />
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap w-16">
                      <span className="font-medium text-gray-900">{stage.sort_order}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{stage.name}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 w-48">
                      {getLevelDurationsDisplay(stage.level_durations)}
                    </td>
                    <td className="px-4 py-3 w-24">
                      {stage.is_gate ? (
                        <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          Gate
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3" onDragStart={(e) => e.stopPropagation()}>
                      <RichText value={stage.details || ""} onChange={() => {}} readOnly={true} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap w-32" onDragStart={(e) => e.stopPropagation()}>
                      <div className="flex justify-end">
                        <button
                          onClick={() => openEdit(stage)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 transition-colors"
                          title="Edit"
                        >
                          <IconPencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LaunchStagesChart stages={stages} />

      <Drawer
        opened={editingOpen}
        onClose={() => {
          setEditingOpen(false);
          resetEditing();
        }}
        title={editingId === null ? "Add UI Rollout Stage" : "Edit UI Rollout Stage"}
        position="right"
        size="xl"
        padding="lg"
      >
        <Stack gap="md">
          <TextInput
            label="Stage Name"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            required
            placeholder="e.g., UX Preview"
          />
          <NumberInput
            label="Default duration (days)"
            value={editingDuration ? parseInt(editingDuration) : undefined}
            onChange={(value) => setEditingDuration(value?.toString() || "")}
            placeholder="Fallback when level_durations not set"
            allowDecimal={false}
            min={0}
          />
          <Checkbox
            label="Go/No-Go gate (show as gate checkpoint on timeline)"
            checked={editingIsGate}
            onChange={(e) => setEditingIsGate(e.currentTarget.checked)}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Level-specific duration ranges (days)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Optional. Min/max days per UI/UX Impact Level (1, 2, 3). Used for timeline and due dates.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {["1", "2", "3"].map((level) => (
                <div key={level} className="flex gap-2 items-center">
                  <span className="text-sm font-medium w-16">Level {level}</span>
                  <NumberInput
                    placeholder="Min"
                    value={
                      editingLevelDurations[level]?.min_days !== undefined
                        ? editingLevelDurations[level].min_days
                        : ""
                    }
                    onChange={(val) => {
                      const num = val === "" || val === undefined ? undefined : Number(val);
                      setEditingLevelDurations((prev) => ({
                        ...prev,
                        [level]: {
                          min_days: num ?? (prev[level]?.min_days ?? 0),
                          max_days: prev[level]?.max_days ?? 0,
                        },
                      }));
                    }}
                    min={0}
                    allowDecimal={false}
                    className="flex-1"
                  />
                  <NumberInput
                    placeholder="Max"
                    value={
                      editingLevelDurations[level]?.max_days !== undefined
                        ? editingLevelDurations[level].max_days
                        : ""
                    }
                    onChange={(val) => {
                      const num = val === "" || val === undefined ? undefined : Number(val);
                      setEditingLevelDurations((prev) => ({
                        ...prev,
                        [level]: {
                          min_days: prev[level]?.min_days ?? 0,
                          max_days: num ?? (prev[level]?.max_days ?? 0),
                        },
                      }));
                    }}
                    min={0}
                    allowDecimal={false}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Details</label>
            <RichText
              value={editingDetails}
              onChange={setEditingDetails}
              placeholder="Enter details..."
              rows={6}
            />
          </div>
          <Group justify="flex-end" mt="xl">
            {editingId !== null && (
              <Button variant="outline" color="red" onClick={() => handleDelete(editingId)}>
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => { setEditingOpen(false); resetEditing(); }}>
              Cancel
            </Button>
            <Button onClick={editingId === null ? handleAdd : handleUpdate}>
              {editingId === null ? "Add" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Drawer>
    </div>
  );
}
