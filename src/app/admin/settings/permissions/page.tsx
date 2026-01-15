"use client";

import { useSettings } from "@/contexts/SettingsContext";
import PermissionsSection from "@/components/admin/settings/PermissionsSection";
import { PurpleLoader } from "@/components/PurpleLoader";

export default function PermissionsPage() {
    const {
        rolesList,
        capabilities,
        rules,
        defaultRules,
        setRules,
        permissionsLoading,
        permissionsSaving,
        autoSavePermissions,
    } = useSettings();

    return (
        <PermissionsSection
            rolesList={rolesList}
            capabilities={capabilities}
            rules={rules}
            defaultRules={defaultRules}
            setRules={setRules}
            loading={permissionsLoading}
            saving={permissionsSaving}
            autoSavePermissions={autoSavePermissions}
        />
    );
}
