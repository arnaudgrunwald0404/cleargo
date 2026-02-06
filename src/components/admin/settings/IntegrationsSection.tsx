"use client";
import React from "react";
import type { AppSettings } from "@/lib/settings-db";
import EmailIntegrationSection from "./EmailIntegrationSection";
import AhaIntegrationSection from "./AhaIntegrationSection";
import SlackIntegrationSection from "./SlackIntegrationSection";
import CalendarIntegrationSection from "./CalendarIntegrationSection";
import JiraIntegrationSection from "./JiraIntegrationSection";
import PendoIntegrationSection from "./PendoIntegrationSection";

type AhaField = { alias: string; label: string; key: string | null; type?: string };

type SyncResult = {
  success: boolean;
  message: string;
  synced: number;
  failed: number;
  total: number;
  errors?: Array<{ aha_id: string; name: string; error: string }>;
};

type Props = {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
  currentUserRoles: string[];
  availableAhaFields?: AhaField[];
  ahaFieldsLoading?: boolean;
  draggedFieldAlias?: string | null;
  setDraggedFieldAlias?: (alias: string | null) => void;
  ahaFieldsSaving?: boolean;
  syncing?: boolean;
  syncResult?: SyncResult | null;
  onAutoSaveFields?: (fields: string[]) => void;
  onAutoSaveSettings?: (updatedSettings: AppSettings) => Promise<void>;
  onRefreshFieldList?: () => void;
  onSynchronize?: () => void;
  ahaFieldsRefreshing?: boolean;
  activeSubSection?: string;
};

export default function IntegrationsSection({ 
  settings, 
  setSettings, 
  currentUserRoles,
  availableAhaFields,
  ahaFieldsLoading,
  draggedFieldAlias,
  setDraggedFieldAlias,
  ahaFieldsSaving,
  syncing,
  syncResult,
  onAutoSaveFields,
  onAutoSaveSettings,
  onRefreshFieldList,
  onSynchronize,
  ahaFieldsRefreshing = false,
  activeSubSection = "aha",
}: Props) {
  return (
    <div className="space-y-6">
      {activeSubSection === "email" && (
        <EmailIntegrationSection settings={settings} setSettings={setSettings} />
      )}

      {activeSubSection === "aha" && (
        <AhaIntegrationSection 
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
          onAutoSaveFields={onAutoSaveFields}
          onRefreshFieldList={onRefreshFieldList}
          onSynchronize={onSynchronize}
          refreshing={ahaFieldsRefreshing}
        />
      )}

      {activeSubSection === "slack" && (
        <SlackIntegrationSection
          settings={settings}
          setSettings={setSettings}
          onSave={onAutoSaveSettings}
        />
      )}

      {activeSubSection === "calendar" && (
        <CalendarIntegrationSection settings={settings} setSettings={setSettings} />
      )}

      {activeSubSection === "jira" && (
        <JiraIntegrationSection settings={settings} setSettings={setSettings} />
      )}

      {activeSubSection === "pendo" && (
        <PendoIntegrationSection />
      )}
    </div>
  );
}
