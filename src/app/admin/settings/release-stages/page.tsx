"use client";

import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import ReleaseStagesSection from "@/components/admin/settings/ReleaseStagesSection";
import { addReleaseStage, updateReleaseStage, deleteReleaseStage, reorderReleaseStages } from "@/lib/services/settingsService";

export default function ReleaseStagesPage() {
    const {
        releaseStages,
        releaseStagesLoading,
        setReleaseStages,
        fetchReleaseStages,
    } = useSettings();

    const [editingStageDrawerOpen, setEditingStageDrawerOpen] = useState(false);
    const [editingStageId, setEditingStageId] = useState<number | null>(null);
    const [editingStageName, setEditingStageName] = useState("");
    const [editingStageDuration, setEditingStageDuration] = useState("");
    const [editingStageDetails, setEditingStageDetails] = useState("");
    const [draggedStageId, setDraggedStageId] = useState<number | null>(null);

    const handleAddStage = async () => {
        if (!editingStageName) {
            alert("Please enter a stage name");
            return;
        }
        try {
            const sortOrder = releaseStages.length > 0
                ? Math.max(...releaseStages.map(s => s.sort_order)) + 1
                : 1;
            await addReleaseStage({
                name: editingStageName,
                sort_order: sortOrder,
                duration_days: editingStageDuration ? parseInt(editingStageDuration) : null,
                details: editingStageDetails || null,
            });
            setEditingStageDrawerOpen(false);
            setEditingStageId(null);
            setEditingStageName("");
            setEditingStageDuration("");
            setEditingStageDetails("");
            fetchReleaseStages();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteStage = async (id: number) => {
        if (!confirm("Delete this release stage?")) return;
        try {
            await deleteReleaseStage(id);
            fetchReleaseStages();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleReorderStages = async (draggedId: number, targetId: number, targetIndex: number) => {
        const draggedIndex = releaseStages.findIndex(s => s.id === draggedId);
        if (draggedIndex === -1 || draggedIndex === targetIndex) return;

        const newStages = [...releaseStages];
        const [draggedStage] = newStages.splice(draggedIndex, 1);
        newStages.splice(targetIndex, 0, draggedStage);

        const reorderedStages = newStages.map((stage, index) => ({
            ...stage,
            sort_order: index + 1
        }));

        setReleaseStages(reorderedStages);

        try {
            await reorderReleaseStages(reorderedStages);
            fetchReleaseStages();
        } catch (error: any) {
            console.error("Failed to reorder stages:", error);
            alert("Failed to reorder stages: " + (error.message || error));
            fetchReleaseStages();
        }
    };

    const handleUpdateStage = async (id: number, name: string, durationDays: number | null, details: string | null) => {
        try {
            await updateReleaseStage({ id, name, duration_days: durationDays, details });
            setEditingStageId(null);
            fetchReleaseStages();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    return (
        <ReleaseStagesSection
            stages={releaseStages}
            loading={releaseStagesLoading}
            draggedStageId={draggedStageId}
            setDraggedStageId={setDraggedStageId}
            onReorder={handleReorderStages}
            editingOpen={editingStageDrawerOpen}
            setEditingOpen={setEditingStageDrawerOpen}
            editingId={editingStageId}
            setEditingId={setEditingStageId}
            editingName={editingStageName}
            setEditingName={setEditingStageName}
            editingDuration={editingStageDuration}
            setEditingDuration={setEditingStageDuration}
            editingDetails={editingStageDetails}
            setEditingDetails={setEditingStageDetails}
            onSaveNew={handleAddStage}
            onUpdateExisting={handleUpdateStage}
            onDeleteExisting={handleDeleteStage}
        />
    );
}
