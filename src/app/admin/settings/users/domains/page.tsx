"use client";

import { useState } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import UserManagementSection from "@/components/admin/settings/UserManagementSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function DomainsPage() {
    const {
        settings,
        setSettings,
        users,
        pendingUsers,
        usersLoading,
        fetchUsers,
        pods,
        podsLoading,
        saving,
        autoSaveSettings,
    } = useSettings();

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [showAddUser, setShowAddUser] = useState(false);
    const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
    const [bulkImportLoading, setBulkImportLoading] = useState(false);
    const [domainInput, setDomainInput] = useState("");
    const [draggedPodIndex, setDraggedPodIndex] = useState<number | null>(null);

    if (!settings) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <PurpleLoader size="lg" />
            </div>
        );
    }

    const updatePodMapping = async (pod: string, userEmail: string | null) => {
        if (!settings) return;
        const mapping = settings.pod_product_manager_mapping || {};

        let updatedSettings;
        if (userEmail) {
            updatedSettings = {
                ...settings,
                pod_product_manager_mapping: {
                    ...mapping,
                    [pod]: userEmail,
                },
            };
        } else {
            const { [pod]: removed, ...rest } = mapping;
            updatedSettings = {
                ...settings,
                pod_product_manager_mapping: rest,
            };
        }
        setSettings(updatedSettings);
        await autoSaveSettings(updatedSettings);
    };

    const updatePodOrder = async (newOrder: string[]) => {
        if (!settings) return;
        const updatedSettings = {
            ...settings,
            pod_order: newOrder,
        };
        setSettings(updatedSettings);
        await autoSaveSettings(updatedSettings);
    };

    const addDomain = async () => {
        if (!domainInput.trim() || !settings) return;
        if (settings.allowlisted_domains.includes(domainInput.trim())) return;

        const updatedSettings = {
            ...settings,
            allowlisted_domains: [...settings.allowlisted_domains, domainInput.trim()],
        };
        setSettings(updatedSettings);
        setDomainInput("");
        await autoSaveSettings(updatedSettings);
    };

    const removeDomain = async (domain: string) => {
        if (!settings) return;
        const updatedSettings = {
            ...settings,
            allowlisted_domains: settings.allowlisted_domains.filter((d) => d !== domain),
        };
        setSettings(updatedSettings);
        await autoSaveSettings(updatedSettings);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        await autoSaveSettings(settings);
    };

    return (
        <UserManagementSection
            users={users}
            pendingUsers={pendingUsers}
            loading={usersLoading}
            onRefresh={fetchUsers}
            editingUserId={editingUserId}
            setEditingUserId={setEditingUserId}
            selectedUserIds={selectedUserIds}
            setSelectedUserIds={setSelectedUserIds}
            showAddUser={showAddUser}
            setShowAddUser={setShowAddUser}
            bulkImportFile={bulkImportFile}
            setBulkImportFile={setBulkImportFile}
            bulkImportLoading={bulkImportLoading}
            setBulkImportLoading={setBulkImportLoading}
            settings={settings}
            setSettings={setSettings}
            updatePodMapping={updatePodMapping}
            updatePodOrder={updatePodOrder}
            handleSave={handleSave}
            pods={pods}
            podsLoading={podsLoading}
            saving={saving}
            domainInput={domainInput}
            setDomainInput={setDomainInput}
            addDomain={addDomain}
            removeDomain={removeDomain}
            activeSubSection="domains"
            draggedPodIndex={draggedPodIndex}
            setDraggedPodIndex={setDraggedPodIndex}
        />
    );
}
