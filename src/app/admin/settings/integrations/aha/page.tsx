"use client";

import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import IntegrationsSection from "@/components/admin/settings/IntegrationsSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function AhaIntegrationPage() {
    const [draggedFieldAlias, setDraggedFieldAlias] = useState<string | null>(null);
    const {
        settings,
        setSettings,
        currentUserRoles,
        availableAhaFields,
        ahaFieldsLoading,
        ahaFieldsRefreshing,
        ahaFieldsSaving,
        syncing,
        syncResult,
        autoSaveAhaFields,
        refreshAhaFieldsList,
        handleSynchronizeFields,
    } = useSettings();

    if (!settings) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <PurpleLoader size="lg" />
            </div>
        );
    }

    return (
        <IntegrationsSection
            settings={settings}
            setSettings={setSettings}
            currentUserRoles={currentUserRoles}
            availableAhaFields={availableAhaFields}
            ahaFieldsLoading={ahaFieldsLoading}
            draggedFieldAlias={draggedFieldAlias}
            setDraggedFieldAlias={setDraggedFieldAlias}
            ahaFieldsSaving={ahaFieldsSaving}
            syncing={syncing}
            syncResult={syncResult}
            onAutoSaveFields={autoSaveAhaFields}
            onRefreshFieldList={refreshAhaFieldsList}
            onSynchronize={handleSynchronizeFields}
            ahaFieldsRefreshing={ahaFieldsRefreshing}
            activeSubSection="aha"
        />
    );
}
