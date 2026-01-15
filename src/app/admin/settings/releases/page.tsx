"use client";

import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import ReleaseScheduleSection from "@/components/admin/settings/ReleaseScheduleSection";
import { addRelease, deleteRelease, updateRelease } from "@/lib/services/settingsService";

export default function ReleasesPage() {
    const {
        releases,
        releasesLoading,
        launchReleases,
        launchReleasesLoading,
        fetchReleases,
        fetchLaunchReleaseDates,
    } = useSettings();

    const [releaseNameInput, setReleaseNameInput] = useState("");
    const [releaseDateInput, setReleaseDateInput] = useState("");
    const [editingReleaseId, setEditingReleaseId] = useState<number | string | null>(null);

    const handleAddRelease = async () => {
        if (!releaseNameInput || !releaseDateInput) {
            alert("Please fill in both release name and date");
            return;
        }
        try {
            await addRelease({
                release_name: releaseNameInput,
                launch_date: releaseDateInput,
            });
            setReleaseNameInput("");
            setReleaseDateInput("");
            setEditingReleaseId(null);
            fetchReleases();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteRelease = async (id: number) => {
        if (!confirm("Delete this release mapping?")) return;
        try {
            await deleteRelease(id);
            fetchReleases();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleUpdateRelease = async (id: number, releaseName: string, launchDate: string) => {
        try {
            await updateRelease(id, { release_name: releaseName, launch_date: launchDate });
            setEditingReleaseId(null);
            fetchReleases();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    return (
        <ReleaseScheduleSection
            releases={releases}
            loading={releasesLoading}
            releaseNameInput={releaseNameInput}
            setReleaseNameInput={setReleaseNameInput}
            releaseDateInput={releaseDateInput}
            setReleaseDateInput={setReleaseDateInput}
            onAdd={handleAddRelease}
            onDelete={handleDeleteRelease}
            editingReleaseId={editingReleaseId}
            setEditingReleaseId={setEditingReleaseId}
            onUpdate={handleUpdateRelease}
            launchReleases={launchReleases}
            launchReleasesLoading={launchReleasesLoading}
            onRefresh={fetchLaunchReleaseDates}
            onRefreshReleases={fetchReleases}
        />
    );
}
