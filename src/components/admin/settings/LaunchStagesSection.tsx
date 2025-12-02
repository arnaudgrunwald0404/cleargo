"use client";
import React from "react";
import { Drawer, Button, Group, Stack, TextInput, NumberInput } from "@mantine/core";
import { IconGripVertical, IconPencil } from "@tabler/icons-react";
import { RichText } from "@/components/admin/RichText";
import { LaunchStagesChart } from "@/components/admin/LaunchStagesChart";

export type LaunchStage = {
  id: number;
  name: string;
  sort_order: number;
  duration_days: number | null;
  details: string | null;
};

type Props = {
  stages: LaunchStage[];
  loading: boolean;
  draggedStageId: number | null;
  setDraggedStageId: (id: number | null) => void;
  onReorder: (draggedId: number, targetId: number, targetIndex: number) => Promise<void> | void;
  // editing state from parent
  editingOpen: boolean;
  setEditingOpen: (open: boolean) => void;
  editingId: number | null;
  setEditingId: (id: number | null) => void;
  editingName: string;
  setEditingName: (v: string) => void;
  editingDuration: string;
  setEditingDuration: (v: string) => void;
  editingDetails: string;
  setEditingDetails: (v: string) => void;
  onSaveNew: () => void; // called when no id (add)
  onUpdateExisting: (id: number, name: string, durationDays: number | null, details: string | null) => void;
  onDeleteExisting: (id: number) => void;
};

export default function LaunchStagesSection({
  stages,
  loading,
  draggedStageId,
  setDraggedStageId,
  onReorder,
  editingOpen,
  setEditingOpen,
  editingId,
  setEditingId,
  editingName,
  setEditingName,
  editingDuration,
  setEditingDuration,
  editingDetails,
  setEditingDetails,
  onSaveNew,
  onUpdateExisting,
  onDeleteExisting,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Launch Stages</h2>
              <p className="text-sm text-gray-500">Configure launch stages and their durations</p>
            </div>
          </div>
          {!loading && stages.length > 0 && (
            <button
              onClick={() => {
                setEditingId(null);
                setEditingName("");
                setEditingDuration("");
                setEditingDetails("");
                setEditingOpen(true);
              }}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              title="Add New Stage"
            >
              +Add
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : stages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No launch stages found.</p>
            <p className="text-sm text-gray-400">The migration may not have inserted the initial data. Check the database or add stages manually.</p>
          </div>
        ) : (
          <>
            <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
              <table className="min-w-full divide-y divide-purple-200 table-fixed">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-16" />
                  <col className="w-auto" />
                  <col className="w-32" />
                  <col className="w-auto" />
                  <col className="w-32" />
                </colgroup>
                <thead className="bg-purple-100">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-12"></th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-16">Rank</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Stage Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">Duration (days)</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Details</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-purple-200">
                  {stages.map((stage, index) => (
                    <tr
                      key={stage.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (draggedStageId !== stage.id) {
                          e.currentTarget.classList.add("bg-purple-100");
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove("bg-purple-100");
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("bg-purple-100");
                        if (draggedStageId && draggedStageId !== stage.id) {
                          await onReorder(draggedStageId, stage.id, index);
                        }
                        setDraggedStageId(null);
                      }}
                      className={`hover:bg-purple-50 transition-colors ${draggedStageId === stage.id ? "opacity-50" : ""}`}
                    >
                      <td
                        className="px-2 py-3 whitespace-nowrap w-12 cursor-move"
                        draggable
                        onDragStart={(e) => {
                          setDraggedStageId(stage.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDraggedStageId(null);
                        }}
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
                      <td className="px-4 py-3 whitespace-nowrap w-32">
                        <span className="text-gray-700">{stage.duration_days !== null ? `${stage.duration_days} days` : "N/A"}</span>
                      </td>
                      <td className="px-4 py-3" onDragStart={(e) => e.stopPropagation()}>
                        <RichText value={stage.details || ""} onChange={() => {}} readOnly={true} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap w-16" onDragStart={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              setEditingId(stage.id);
                              setEditingName(stage.name);
                              setEditingDuration(stage.duration_days?.toString() || "");
                              setEditingDetails(stage.details || "");
                              setEditingOpen(true);
                            }}
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
          </>
        )}
      </div>

      <LaunchStagesChart stages={stages} />

      <StageDrawer
        opened={editingOpen}
        onClose={() => {
          setEditingOpen(false);
          setEditingId(null);
          setEditingName("");
          setEditingDuration("");
          setEditingDetails("");
        }}
        stageId={editingId}
        stageName={editingName}
        setStageName={setEditingName}
        stageDuration={editingDuration}
        setStageDuration={setEditingDuration}
        stageDetails={editingDetails}
        setStageDetails={setEditingDetails}
        onSave={() => {
          if (editingId !== null) {
            onUpdateExisting(
              editingId,
              editingName,
              editingDuration ? parseInt(editingDuration) : null,
              editingDetails || null
            );
            setEditingOpen(false);
          } else {
            onSaveNew();
          }
        }}
        onDelete={() => {
          if (editingId !== null) {
            onDeleteExisting(editingId);
            setEditingOpen(false);
          }
        }}
      />
    </div>
  );
}

function StageDrawer({
  opened,
  onClose,
  stageId,
  stageName,
  setStageName,
  stageDuration,
  setStageDuration,
  stageDetails,
  setStageDetails,
  onSave,
  onDelete,
}: {
  opened: boolean;
  onClose: () => void;
  stageId: number | null;
  stageName: string;
  setStageName: (name: string) => void;
  stageDuration: string;
  setStageDuration: (duration: string) => void;
  stageDetails: string;
  setStageDetails: (details: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const isAdding = stageId === null;
  return (
    <Drawer opened={opened} onClose={onClose} title={isAdding ? "Add Launch Stage" : "Edit Launch Stage"} position="right" size="xl" padding="lg">
      <Stack gap="md">
        <TextInput label="Stage Name" value={stageName} onChange={(e) => setStageName(e.target.value)} required placeholder="e.g., GTM Access" />
        <NumberInput
          label="Duration (days)"
          value={stageDuration ? parseInt(stageDuration) : undefined}
          onChange={(value) => setStageDuration(value?.toString() || "")}
          placeholder="Enter number of days"
          allowDecimal={false}
          min={0}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Details</label>
          <RichText value={stageDetails} onChange={setStageDetails} placeholder="Enter details..." rows={10} />
        </div>
        <Group justify="flex-end" mt="xl">
          {!isAdding && (
            <Button variant="outline" color="red" onClick={onDelete}>
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSave}>{isAdding ? "Add" : "Save"}</Button>
        </Group>
      </Stack>
    </Drawer>
  );
}
