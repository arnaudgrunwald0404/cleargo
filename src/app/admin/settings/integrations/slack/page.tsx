"use client";

import { useSettings } from "@/contexts/SettingsContext";
import IntegrationsSection from "@/components/admin/settings/IntegrationsSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function SlackIntegrationPage() {
    const {
        settings,
        setSettings,
        currentUserRoles,
        availableAhaFields,
        ahaFieldsLoading,
        ahaFieldsSaving,
        syncing,
        syncResult,
        autoSaveAhaFields,
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
            draggedFieldAlias={null}
            setDraggedFieldAlias={() => {}}
            ahaFieldsSaving={ahaFieldsSaving}
            syncing={syncing}
            syncResult={syncResult}
            onAutoSaveFields={autoSaveAhaFields}
            onSynchronize={handleSynchronizeFields}
            activeSubSection="slack"
        />
    );
}
