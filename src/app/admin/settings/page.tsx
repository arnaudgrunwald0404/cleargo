"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppSettings } from "@/lib/settings-db";
import { Drawer, TextInput, Select, Checkbox, Button, Group, Stack, MultiSelect, Menu, NumberInput, Modal } from "@mantine/core";
import { IconPencil, IconCheck, IconTrash, IconX, IconGripVertical, IconMail, IconMailOpened } from "@tabler/icons-react";
import { CriteriaManager } from "@/components/admin/CriteriaManager";
import { LaunchStagesChart } from "@/components/admin/LaunchStagesChart";
import { RichText } from "@/components/admin/RichText";
import { DEFAULT_EMAIL_TEMPLATES } from "@/lib/constants/settings";
import { getPermissions, getUsers, getPods, getReleases, addRelease, deleteRelease, updateRelease, getSettings, patchSettings, getAhaFields, syncAhaFields, patchEmailTemplates, getLaunchStages, addLaunchStage, updateLaunchStage, deleteLaunchStage, reorderLaunchStages } from "@/lib/services/settingsService";
import EmailTemplatesSection from "@/components/admin/settings/EmailTemplatesSection";
import PermissionsSection from "@/components/admin/settings/PermissionsSection";
import GeneralSection from "@/components/admin/settings/GeneralSection";
import IntegrationsSection from "@/components/admin/settings/IntegrationsSection";
import AhaFieldsSection from "@/components/admin/settings/AhaFieldsSection";
import LaunchStagesSection from "@/components/admin/settings/LaunchStagesSection";
import ReleaseScheduleSection from "@/components/admin/settings/ReleaseScheduleSection";
import UserManagementSection from "@/components/admin/settings/UserManagementSection";

export default function AdminSettingsPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Helper for array fields (allowlisted_domains)
    const [domainInput, setDomainInput] = useState("");

    // Pods state for mapping UI
    const [pods, setPods] = useState<string[]>([]);
    const [podsLoading, setPodsLoading] = useState(false);

    // User management state
    const [users, setUsers] = useState<any[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [showAddUser, setShowAddUser] = useState(false);
    const [bulkImportFile, setBulkImportFile] = useState<File | null>(null);
    const [bulkImportLoading, setBulkImportLoading] = useState(false);

    // Navigation state
    const [activeSection, setActiveSection] = useState<string>("users");

    // Permissions state
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const [permissionsSaving, setPermissionsSaving] = useState(false);
    const [rolesList, setRolesList] = useState<string[]>([]);
    const [capabilities, setCapabilities] = useState<Array<{ id: string; label: string; description: string }>>([]);
    const [rules, setRules] = useState<Record<string, string[]>>({});
    const [defaultRules, setDefaultRules] = useState<Record<string, string[]>>({});
    const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);

    // Release schedule state
    const [releases, setReleases] = useState<any[]>([]);
    const [releasesLoading, setReleasesLoading] = useState(false);
    const [releaseNameInput, setReleaseNameInput] = useState("");
    const [releaseDateInput, setReleaseDateInput] = useState("");
    const [editingReleaseId, setEditingReleaseId] = useState<number | string | null>(null);
    const [launchReleases, setLaunchReleases] = useState<Array<{ releaseName: string; launchDate: string | null }>>([]);
    const [launchReleasesLoading, setLaunchReleasesLoading] = useState(false);

    // AHA fields state
    const [availableAhaFields, setAvailableAhaFields] = useState<Array<{ alias: string; label: string; key: string | null; type?: string }>>([]);
    const [ahaFieldsLoading, setAhaFieldsLoading] = useState(false);
    const [draggedFieldAlias, setDraggedFieldAlias] = useState<string | null>(null);
    const [ahaFieldsSaving, setAhaFieldsSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; synced: number; failed: number; total: number; errors?: Array<{ aha_id: string; name: string; error: string }> } | null>(null);

    // Launch stages state
    const [launchStages, setLaunchStages] = useState<Array<{ id: number; name: string; sort_order: number; duration_days: number | null; details: string | null }>>([]);
    const [launchStagesLoading, setLaunchStagesLoading] = useState(false);
    const [editingStageDrawerOpen, setEditingStageDrawerOpen] = useState(false);
    const [editingStageId, setEditingStageId] = useState<number | null>(null);
    const [editingStageName, setEditingStageName] = useState("");
    const [editingStageDuration, setEditingStageDuration] = useState("");
    const [editingStageDetails, setEditingStageDetails] = useState("");
    const [draggedStageId, setDraggedStageId] = useState<number | null>(null);

    // Email templates state
    const [emailTemplates, setEmailTemplates] = useState({
        invite_subject: "",
        invite_html: "",
        remind_subject: "",
        remind_html: "",
        update_criteria_subject: "",
        update_criteria_html: "",
    });
    const [emailTemplatesLoading, setEmailTemplatesLoading] = useState(false);
    const [emailTemplatesSaving, setEmailTemplatesSaving] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewType, setPreviewType] = useState<"invite" | "remind" | "update_criteria">("invite");
    const [activeTemplateType, setActiveTemplateType] = useState<"invite" | "remind" | "update_criteria">("invite");

    useEffect(() => {
        fetchSettings();
        fetchUsers();
        fetchReleases();
        fetchPods();
        fetchAhaFields();
        fetchLaunchReleaseDates();
        fetchLaunchStages();
        fetchEmailTemplates();
        fetchPermissions();
        fetchCurrentUser();
    }, []);

    const fetchCurrentUser = async () => {
        try {
            const res = await fetch("/api/me");
            if (res.ok) {
                const data = await res.json();
                setCurrentUserRoles(data.user?.roles || []);
            }
        } catch (error) {
            console.error("Failed to fetch current user:", error);
        }
    };

    const fetchLaunchReleaseDates = async () => {
        setLaunchReleasesLoading(true);
        try {
            const res = await fetch("/api/epics/release-dates");
            if (!res.ok) throw new Error("Failed to fetch epic releases");
            const data = await res.json();
            setLaunchReleases(data.releases || []);
        } catch (error: any) {
            console.error("Failed to fetch epic releases:", error);
        } finally {
            setLaunchReleasesLoading(false);
        }
    };

    const fetchLaunchStages = async () => {
        setLaunchStagesLoading(true);
        try {
            const data = await getLaunchStages();
            console.log("Fetched launch stages:", data.stages?.length || 0, "stages");
            setLaunchStages(data.stages || []);
        } catch (error: any) {
            console.error("Failed to fetch launch stages:", error);
            setError(error.message || "Failed to fetch launch stages");
        } finally {
            setLaunchStagesLoading(false);
        }
    };

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

        // Create new array with reordered stages
        const newStages = [...launchStages];
        const [draggedStage] = newStages.splice(draggedIndex, 1);
        newStages.splice(targetIndex, 0, draggedStage);

        // Update sort_order for all stages
        const reorderedStages = newStages.map((stage, index) => ({
            ...stage,
            sort_order: index + 1
        }));

        // Optimistically update UI
        setLaunchStages(reorderedStages);

        // Update via API
        try {
            await reorderLaunchStages(reorderedStages);
            // Refresh to ensure consistency
            fetchLaunchStages();
        } catch (error: any) {
            console.error("Failed to reorder stages:", error);
            alert("Failed to reorder stages: " + (error.message || error));
            // Revert on error
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

    const fetchAhaFields = async () => {
        setAhaFieldsLoading(true);
        try {
            const data = await getAhaFields();
            console.log("Fetched AHA fields:", data.fields?.length, "total fields");
            console.log("Standard fields:", data.fields?.filter((f: any) => f.type === 'standard'));
            setAvailableAhaFields(data.fields || []);
        } catch (error: any) {
            console.error("Failed to fetch AHA fields:", error);
        } finally {
            setAhaFieldsLoading(false);
        }
    };

    const fetchEmailTemplates = async () => {
        setEmailTemplatesLoading(true);
        try {
            const res = await fetch("/api/settings/email-templates");
            if (!res.ok) throw new Error("Failed to fetch email templates");
            const data = await res.json();

            // Use shared defaults and return early to avoid in-file template literals
            setEmailTemplates({
                invite_subject: data.invite_subject || DEFAULT_EMAIL_TEMPLATES.invite_subject,
                invite_html: data.invite_html || DEFAULT_EMAIL_TEMPLATES.invite_html,
                remind_subject: data.remind_subject || DEFAULT_EMAIL_TEMPLATES.remind_subject,
                remind_html: data.remind_html || DEFAULT_EMAIL_TEMPLATES.remind_html,
                update_criteria_subject: data.update_criteria_subject || DEFAULT_EMAIL_TEMPLATES.update_criteria_subject,
                update_criteria_html: data.update_criteria_html || DEFAULT_EMAIL_TEMPLATES.update_criteria_html,
            });
            return;
            // Default templates
            const defaultInviteSubject = 'Welcome to ClearGO';
            const defaultInviteHtml = `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">{{greeting}}</h2>
    <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
        You've been invited to join ClearGO. Click the button below to get started.
    </p>
    <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
        <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Track and manage launch readiness across all your products and initiatives</li>
            <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
            <li>Get real-time visibility into launch status, risks, and readiness scores</li>
        </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{inviteLink}}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
            Accept Invitation
        </a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        This link expires in 30 minutes and can be used once. If you didn't request this invitation, you can safely ignore this email.
    </p>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{inviteLink}}" style="color: #4f46e5; word-break: break-all;">{{inviteLink}}</a>
    </p>
</div>`;

            const defaultRemindSubject = 'Reminder: Join ClearGO';
            const defaultRemindHtml = `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">{{greeting}}</h2>
    <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
        This is a reminder that you have an invitation to join ClearGO. Click the button below to accept your invitation.
    </p>
    <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
        <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Track and manage launch readiness across all your products and initiatives</li>
            <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
            <li>Get real-time visibility into launch status, risks, and readiness scores</li>
        </ul>
    </div>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{inviteLink}}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
            Accept Invitation
        </a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        This link expires in 30 minutes and can be used once. If you've already joined, you can safely ignore this email.
    </p>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{inviteLink}}" style="color: #4f46e5; word-break: break-all;">{{inviteLink}}</a>
    </p>
</div>`;

            const defaultUpdateCriteriaSubject = 'Action Required: Update Criteria in ClearGO';
            const defaultUpdateCriteriaHtml = `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">{{greeting}}</h2>
    <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
        You have criteria that require your attention in ClearGO. Please review and update as needed.
    </p>
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{actionLink}}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
            View Criteria
        </a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
        If the button doesn't work, copy and paste this link into your browser:<br>
        <a href="{{actionLink}}" style="color: #4f46e5; word-break: break-all;">{{actionLink}}</a>
    </p>
</div>`;

            setEmailTemplates({
                invite_subject: data.invite_subject || defaultInviteSubject,
                invite_html: data.invite_html || defaultInviteHtml,
                remind_subject: data.remind_subject || defaultRemindSubject,
                remind_html: data.remind_html || defaultRemindHtml,
                update_criteria_subject: data.update_criteria_subject || defaultUpdateCriteriaSubject,
                update_criteria_html: data.update_criteria_html || defaultUpdateCriteriaHtml,
            });
        } catch (error: any) {
            console.error("Failed to fetch email templates:", error);
        } finally {
            setEmailTemplatesLoading(false);
        }
    };

    const autoSaveEmailTemplates = async () => {
        setEmailTemplatesSaving(true);
        try {
            await patchEmailTemplates({
                email_template_invite_subject: emailTemplates.invite_subject || null,
                email_template_invite_html: emailTemplates.invite_html || null,
                email_template_remind_subject: emailTemplates.remind_subject || null,
                email_template_remind_html: emailTemplates.remind_html || null,
                email_template_update_criteria_subject: emailTemplates.update_criteria_subject || null,
                email_template_update_criteria_html: emailTemplates.update_criteria_html || null,
            });
        } catch (error: any) {
            console.error("Failed to auto-save email templates:", error);
            setError("Failed to save email templates. Please try again.");
        } finally {
            setEmailTemplatesSaving(false);
        }
    };

    // Permissions API
    const fetchPermissions = async () => {
        setPermissionsLoading(true);
        try {
            const data = await getPermissions();
            setRolesList(data.roles || []);
            setCapabilities(data.capabilities || []);
            setDefaultRules(data.rules || {});
            setRules(data.overrides && Object.keys(data.overrides).length > 0 ? data.overrides : (data.rules || {}));
        } catch (e) {
            console.error("Failed to fetch permissions", e);
        } finally {
            setPermissionsLoading(false);
        }
    };

    const autoSavePermissions = async (mapping: Record<string, string[]>) => {
        setPermissionsSaving(true);
        try {
            const { patchPermissions } = await import("@/lib/services/settingsService");
            await patchPermissions({ rules: mapping });
        } catch (e) {
            console.error("Failed to save permissions", e);
            setError("Failed to save permissions");
        } finally {
            setPermissionsSaving(false);
        }
    };

    // Auto-save email templates with debouncing (2 seconds after last change)
    useEffect(() => {
        if (emailTemplatesLoading) return; // Don't auto-save on initial load

        const timer = setTimeout(() => {
            autoSaveEmailTemplates();
        }, 2000); // Wait 2 seconds after last change

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [emailTemplates.invite_subject, emailTemplates.invite_html, emailTemplates.remind_subject, emailTemplates.remind_html, emailTemplates.update_criteria_subject, emailTemplates.update_criteria_html]);

    const fetchUsers = async () => {
        setUsersLoading(true);
        try {
            const data = await getUsers();
            setUsers(data.users || []);
        } catch (error: any) {
            console.error("Failed to fetch users:", error);
        } finally {
            setUsersLoading(false);
        }
    };

    const fetchPods = async () => {
        setPodsLoading(true);
        try {
            const data = await getPods();
            setPods(data.pods || []);
        } catch (error: any) {
            console.error("Failed to fetch pods:", error);
        } finally {
            setPodsLoading(false);
        }
    };

    const fetchReleases = async () => {
        setReleasesLoading(true);
        try {
            const data = await getReleases();
            setReleases(data || []);
        } catch (error: any) {
            console.error("Failed to fetch releases:", error);
        } finally {
            setReleasesLoading(false);
        }
    };

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

    const fetchSettings = async () => {
        try {
            const data = await getSettings();
            setSettings(data);
        } catch (error: any) {
            console.error(error);
            setError(error.message || "Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const updated = await patchSettings(settings);
            setSettings(updated);
            setSuccess("Settings saved successfully");
            setTimeout(() => setSuccess(null), 3000);
        } catch (error: any) {
            console.error(error);
            setError(error.message || "Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    const autoSaveAhaFields = async (fieldsToLoad: string[]) => {
        if (!settings) return;
        setAhaFieldsSaving(true);
        try {
            const updated = await patchSettings({
                ...settings,
                aha_fields_to_load: fieldsToLoad,
            });
            setSettings(updated);
        } catch (error: any) {
            console.error("Failed to auto-save AHA fields:", error);
            setError("Failed to save field changes. Please refresh and try again.");
        } finally {
            setAhaFieldsSaving(false);
        }
    };

    const handleSynchronizeFields = async () => {
        setSyncing(true);
        setSyncResult(null);
        setError(null);
        try {
            const result = await syncAhaFields();
            setSyncResult(result);
            if (result.errors && result.errors.length > 0) {
                setError(`Some launches failed to sync. ${result.synced} succeeded, ${result.failed} failed.`);
            }
        } catch (error: any) {
            console.error("Failed to synchronize fields:", error);
            setError(error.message || "Failed to synchronize fields. Please try again.");
        } finally {
            setSyncing(false);
        }
    };

    const autoSaveSettings = async (updatedSettings: AppSettings) => {
        setSaving(true);
        try {
            const saved = await patchSettings(updatedSettings);
            setSettings(saved);
        } catch (error: any) {
            console.error("Failed to auto-save settings:", error);
            setError("Failed to save changes. Please refresh and try again.");
        } finally {
            setSaving(false);
        }
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

    const updatePodMapping = async (pod: string, userEmail: string | null) => {
        if (!settings) return;
        const mapping = settings.pod_product_manager_mapping || {};

        let updatedSettings: AppSettings;
        if (userEmail) {
            updatedSettings = {
                ...settings,
                pod_product_manager_mapping: {
                    ...mapping,
                    [pod]: userEmail,
                },
            };
        } else {
            // Remove mapping if empty/null
            const { [pod]: removed, ...rest } = mapping;
            updatedSettings = {
                ...settings,
                pod_product_manager_mapping: rest,
            };
        }
        setSettings(updatedSettings);
        await autoSaveSettings(updatedSettings);
    };

    if (loading) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="inline-block w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-600">Loading settings...</p>
                </div>
            </main>
        );
    }

    if (!settings) {
        return (
            <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center">
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
                    Failed to load settings.
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                        {error}
                    </div>
                )}

                <div className="flex gap-6">
                    {/* Sidebar Navigation */}
                    <div className="w-64 flex-shrink-0">
                        <nav className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-24">
                            <ul className="space-y-1">
                                <li>
                                    <button
                                        onClick={() => setActiveSection("users")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "users"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        User Management
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => setActiveSection("permissions")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "permissions"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        Permissions
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => setActiveSection("aha-fields")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "aha-fields"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        AHA Epic Fields
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => setActiveSection("releases")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "releases"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        Release Schedule
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => setActiveSection("launch-stages")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "launch-stages"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        Launch Stages
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => setActiveSection("criteria")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "criteria"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        ClearGO Criteria
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => setActiveSection("email-templates")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "email-templates"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        Email Templates
                                    </button>
                                </li>
                                <li>
                                    <button
                                        onClick={() => setActiveSection("general")}
                                        className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${activeSection === "general"
                                            ? "bg-indigo-50 text-indigo-700 font-medium"
                                            : "text-gray-700 hover:bg-gray-50"
                                            }`}
                                    >
                                        Other Settings
                                    </button>
                                </li>
                            </ul>
                        </nav>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                        {activeSection === "general" && (
                            <GeneralSection
                                settings={settings}
                                setSettings={setSettings}
                                currentUserRoles={currentUserRoles}
                            />
                        )}
                        {activeSection === "email-templates" && (
                            <EmailTemplatesSection
                                emailTemplates={emailTemplates}
                                setEmailTemplates={setEmailTemplates}
                                loading={emailTemplatesLoading}
                                saving={emailTemplatesSaving}
                                activeTemplateType={activeTemplateType}
                                setActiveTemplateType={setActiveTemplateType}
                                previewOpen={previewOpen}
                                setPreviewOpen={setPreviewOpen}
                                previewType={previewType}
                                setPreviewType={setPreviewType}
                            />
                        )}

                        {/* Permissions Section */}
                        {activeSection === "permissions" && (
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
                        )}

                        {/* Email Preview Modal */}
                        <Modal
                            opened={previewOpen}
                            onClose={() => setPreviewOpen(false)}
                            title={`Email Preview - ${previewType === "invite" ? "Invite"
                                : previewType === "remind" ? "Reminder"
                                    : "Update Criteria"
                                }`}
                            size="xl"
                        >
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Subject Line
                                    </label>
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                                        {previewType === "invite"
                                            ? (emailTemplates.invite_subject || "Welcome to ClearGO")
                                            : previewType === "remind"
                                                ? (emailTemplates.remind_subject || "Reminder: Join ClearGO")
                                                : (emailTemplates.update_criteria_subject || "Action Required: Update Criteria in ClearGO")
                                        }
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Email Preview
                                    </label>
                                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                                        <div
                                            className="bg-white p-4"
                                            dangerouslySetInnerHTML={{
                                                __html: (() => {
                                                    const html = previewType === "invite"
                                                        ? emailTemplates.invite_html
                                                        : previewType === "remind"
                                                            ? emailTemplates.remind_html
                                                            : emailTemplates.update_criteria_html;

                                                    if (!html) {
                                                        return previewType === "invite"
                                                            ? `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                                                <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                                                                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                                                    You've been invited to join ClearGO. Click the button below to get started.
                                                                </p>
                                                                <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
                                                                    <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
                                                                    <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
                                                                        <li>Track and manage launch readiness across all your products and initiatives</li>
                                                                        <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
                                                                        <li>Get real-time visibility into launch status, risks, and readiness scores</li>
                                                                    </ul>
                                                                </div>
                                                                <div style="text-align: center; margin: 30px 0;">
                                                                    <a href="https://example.com/invite-link" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                                                                        Accept Invitation
                                                                    </a>
                                                                </div>
                                                                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                                                                    This link expires in 30 minutes and can be used once. If you didn't request this invitation, you can safely ignore this email.
                                                                </p>
                                                                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
                                                                    If the button doesn't work, copy and paste this link into your browser:<br>
                                                                    <a href="https://example.com/invite-link" style="color: #4f46e5; word-break: break-all;">https://example.com/invite-link</a>
                                                                </p>
                                                            </div>`
                                                            : previewType === "remind"
                                                                ? `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                                                <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                                                                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                                                    This is a reminder that you have an invitation to join ClearGO. Click the button below to accept your invitation.
                                                                </p>
                                                                <div style="background-color: #f9fafb; border-left: 4px solid #4f46e5; padding: 16px; margin: 24px 0; border-radius: 4px;">
                                                                    <p style="color: #374151; font-weight: 600; margin-bottom: 12px; font-size: 15px;">What is ClearGO?</p>
                                                                    <ul style="color: #4b5563; line-height: 1.8; margin: 0; padding-left: 20px;">
                                                                        <li>Track and manage launch readiness across all your products and initiatives</li>
                                                                        <li>Collaborate with your team to ensure successful launches with clear criteria and decision gates</li>
                                                                        <li>Get real-time visibility into launch status, risks, and readiness scores</li>
                                                                    </ul>
                                                                </div>
                                                                <div style="text-align: center; margin: 30px 0;">
                                                                    <a href="https://example.com/invite-link" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                                                                        Accept Invitation
                                                                    </a>
                                                                </div>
                                                                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                                                                    This link expires in 30 minutes and can be used once. If you've already joined, you can safely ignore this email.
                                                                </p>
                                                                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 10px;">
                                                                    If the button doesn't work, copy and paste this link into your browser:<br>
                                                                    <a href="https://example.com/invite-link" style="color: #4f46e5; word-break: break-all;">https://example.com/invite-link</a>
                                                                </p>
                                                            </div>`
                                                                : `<div style="font-family: 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                                                                <h2 style="font-family: 'Atkinson Hyperlegible', sans-serif; color: #1f2937; margin-bottom: 20px;">Hi John,</h2>
                                                                <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px;">
                                                                    You have criteria that require your attention in ClearGO. Please review and update as needed.
                                                                </p>
                                                                <div style="text-align: center; margin: 30px 0;">
                                                                    <a href="https://example.com/action-link" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background-color 0.2s;">
                                                                        View Criteria
                                                                    </a>
                                                                </div>
                                                                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 30px;">
                                                                    If the button doesn't work, copy and paste this link into your browser:<br>
                                                                    <a href="https://example.com/action-link" style="color: #4f46e5; word-break: break-all;">https://example.com/action-link</a>
                                                                </p>
                                                            </div>`;
                                                    }

                                                    // Replace placeholders with sample data
                                                    return html
                                                        .replace(/\{\{firstName\}\}/g, "John")
                                                        .replace(/\{\{greeting\}\}/g, "Hi John,")
                                                        .replace(/\{\{inviteLink\}\}/g, "https://example.com/invite-link")
                                                        .replace(/\{\{actionLink\}\}/g, "https://example.com/action-link");
                                                })()
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                                    <strong>Note:</strong> This preview uses sample data (firstName: "John", inviteLink: "https://example.com/invite-link"). Actual emails will use real recipient data.
                                </div>
                            </div>
                        </Modal>

                        {activeSection === "general" && (
                            <form onSubmit={handleSave} className="space-y-6">
                                <IntegrationsSection settings={settings} setSettings={setSettings} />

                                {/* Save Button */}
                                <div className="flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 font-medium transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {saving ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Saving...
                                            </span>
                                        ) : (
                                            "Save Changes"
                                        )}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeSection === "releases" && (
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
                        )}

                        {activeSection === "launch-stages" && (
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
                        )}

                        {/* Edit Stage Drawer moved into LaunchStagesSection */}
                        {/* EditStageDrawer moved into LaunchStagesSection */}

                        {activeSection === "users" && (
                            <UserManagementSection
                                users={users}
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
                                handleSave={handleSave}
                                pods={pods}
                                podsLoading={podsLoading}
                                saving={saving}
                                domainInput={domainInput}
                                setDomainInput={setDomainInput}
                                addDomain={addDomain}
                                removeDomain={removeDomain}
                            />
                        )}

                        {activeSection === "criteria" && (
                            <CriteriaManager />
                        )}

                        {activeSection === "aha-fields" && (
                            <AhaFieldsSection
                                settings={settings}
                                setSettings={setSettings}
                                availableAhaFields={availableAhaFields}
                                loading={ahaFieldsLoading}
                                draggedFieldAlias={draggedFieldAlias}
                                setDraggedFieldAlias={setDraggedFieldAlias}
                                saving={ahaFieldsSaving}
                                syncing={syncing}
                                syncResult={syncResult}
                                onAutoSaveFields={autoSaveAhaFields}
                                onSynchronize={handleSynchronizeFields}
                            />
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}
