"use client";

import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import LaunchStagesSection from "@/components/admin/settings/LaunchStagesSection";
import { addLaunchStage, updateLaunchStage, deleteLaunchStage, reorderLaunchStages } from "@/lib/services/settingsService";

export default function LaunchStagesPage() {
    const {
        launchStages,
        launchStagesLoading,
        setLaunchStages,
        fetchLaunchStages,
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
            const sortOrder = launchStages.length > 0
                ? Math.max(...launchStages.map(s => s.sort_order)) + 1
                : 1;
            await addLaunchStage({
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
            fetchLaunchStages();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteStage = async (id: number) => {
        if (!confirm("Delete this launch stage?")) return;
        try {
            await deleteLaunchStage(id);
            fetchLaunchStages();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleReorderStages = async (draggedId: number, targetId: number, targetIndex: number) => {
        const draggedIndex = launchStages.findIndex(s => s.id === draggedId);
        if (draggedIndex === -1 || draggedIndex === targetIndex) return;

        const newStages = [...launchStages];
        const [draggedStage] = newStages.splice(draggedIndex, 1);
        newStages.splice(targetIndex, 0, draggedStage);

        const reorderedStages = newStages.map((stage, index) => ({
            ...stage,
            sort_order: index + 1
        }));

        setLaunchStages(reorderedStages);

        try {
            await reorderLaunchStages(reorderedStages);
            fetchLaunchStages();
        } catch (error: any) {
            console.error("Failed to reorder stages:", error);
            alert("Failed to reorder stages: " + (error.message || error));
            fetchLaunchStages();
        }
    };

    const handleUpdateStage = async (id: number, name: string, durationDays: number | null, details: string | null) => {
        try {
            await updateLaunchStage({ id, name, duration_days: durationDays, details });
            setEditingStageId(null);
            fetchLaunchStages();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    return (
        <LaunchStagesSection
            stages={launchStages}
            loading={launchStagesLoading}
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
