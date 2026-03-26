"use client";

import { useSettings } from "@/contexts/SettingsContext";
import IntegrationsSection from "@/components/admin/settings/IntegrationsSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function PendoIntegrationPage() {
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
        return <PurpleLoader size="lg" fullPage />;
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
            activeSubSection="pendo"
        />
    );
}
