"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppSettings } from "@/lib/settings-db";
import { Drawer, TextInput, Select, Checkbox, Button, Group, Stack, MultiSelect, Menu, NumberInput, Modal } from "@mantine/core";
import { IconPencil, IconCheck, IconTrash, IconX, IconGripVertical, IconMail, IconMailOpened } from "@tabler/icons-react";
import { CriteriaManager } from "@/components/admin/CriteriaManager";
import { LaunchStagesChart } from "@/components/admin/LaunchStagesChart";
import { RichText } from "@/components/admin/RichText";

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

    // Release schedule state
    const [releases, setReleases] = useState<any[]>([]);
    const [releasesLoading, setReleasesLoading] = useState(false);
    const [releaseNameInput, setReleaseNameInput] = useState("");
    const [releaseDateInput, setReleaseDateInput] = useState("");
    const [editingReleaseId, setEditingReleaseId] = useState<number | string | null>(null);
    const [launchReleases, setLaunchReleases] = useState<Array<{releaseName: string; launchDate: string | null}>>([]);
    const [launchReleasesLoading, setLaunchReleasesLoading] = useState(false);

    // AHA fields state
    const [availableAhaFields, setAvailableAhaFields] = useState<Array<{alias: string; label: string; key: string | null; type?: string}>>([]);
    const [ahaFieldsLoading, setAhaFieldsLoading] = useState(false);
    const [draggedFieldAlias, setDraggedFieldAlias] = useState<string | null>(null);
    const [ahaFieldsSaving, setAhaFieldsSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{success: boolean; message: string; synced: number; failed: number; total: number; errors?: Array<{aha_id: string; name: string; error: string}>} | null>(null);

    // Launch stages state
    const [launchStages, setLaunchStages] = useState<Array<{id: number; name: string; sort_order: number; duration_days: number | null; details: string | null}>>([]);
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
    }, []);

    const fetchLaunchReleaseDates = async () => {
        setLaunchReleasesLoading(true);
        try {
            const res = await fetch("/api/launches/release-dates");
            if (!res.ok) throw new Error("Failed to fetch launch releases");
            const data = await res.json();
            setLaunchReleases(data.releases || []);
        } catch (error: any) {
            console.error("Failed to fetch launch releases:", error);
        } finally {
            setLaunchReleasesLoading(false);
        }
    };

    const fetchLaunchStages = async () => {
        setLaunchStagesLoading(true);
        try {
            const res = await fetch("/api/launch-stages");
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                console.error("Failed to fetch launch stages:", errorData);
                setError(errorData.error || "Failed to fetch launch stages");
                return;
            }
            const data = await res.json();
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
            const res = await fetch("/api/launch-stages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editingStageName,
                    sort_order: sortOrder,
                    duration_days: editingStageDuration ? parseInt(editingStageDuration) : null,
                    details: editingStageDetails || null,
                }),
            });
            if (!res.ok) throw new Error("Failed to add stage");
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
            const res = await fetch(`/api/launch-stages/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete stage");
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

        // Only update stages that actually changed position
        const updates = newStages
            .map((stage, index) => ({
                id: stage.id,
                newSortOrder: index + 1,
                oldSortOrder: stage.sort_order
            }))
            .filter(update => update.newSortOrder !== update.oldSortOrder)
            .map(({ id, newSortOrder }) => ({
                id,
                sort_order: newSortOrder
            }));

        // If nothing changed, return early
        if (updates.length === 0) return;

        // Optimistically update UI
        setLaunchStages(newStages.map((stage, index) => ({
            ...stage,
            sort_order: index + 1
        })));

        // Update affected stages
        try {
            const results = await Promise.all(updates.map(async (update) => {
                const res = await fetch("/api/launch-stages", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(update),
                });
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(errorData.error || `Failed to update stage ${update.id}: ${res.statusText}`);
                }
                return res.json();
            }));
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
            const res = await fetch("/api/launch-stages", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id,
                    name,
                    duration_days: durationDays,
                    details,
                }),
            });
            if (!res.ok) throw new Error("Failed to update stage");
            setEditingStageId(null);
            fetchLaunchStages();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const fetchAhaFields = async () => {
        setAhaFieldsLoading(true);
        try {
            const res = await fetch("/api/settings/aha-fields");
            if (!res.ok) throw new Error("Failed to fetch AHA fields");
            const data = await res.json();
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
            const res = await fetch("/api/settings/email-templates", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    email_template_invite_subject: emailTemplates.invite_subject || null,
                    email_template_invite_html: emailTemplates.invite_html || null,
                    email_template_remind_subject: emailTemplates.remind_subject || null,
                    email_template_remind_html: emailTemplates.remind_html || null,
                    email_template_update_criteria_subject: emailTemplates.update_criteria_subject || null,
                    email_template_update_criteria_html: emailTemplates.update_criteria_html || null,
                }),
            });
            if (!res.ok) throw new Error("Failed to save email templates");
        } catch (error: any) {
            console.error("Failed to auto-save email templates:", error);
            setError("Failed to save email templates. Please try again.");
        } finally {
            setEmailTemplatesSaving(false);
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
            const res = await fetch("/api/users");
            if (!res.ok) throw new Error("Failed to fetch users");
            const data = await res.json();
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
            const res = await fetch("/api/admin/pods");
            if (!res.ok) throw new Error("Failed to fetch pods");
            const data = await res.json();
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
            const res = await fetch("/api/releases");
            if (!res.ok) throw new Error("Failed to fetch releases");
            const data = await res.json();
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
            const res = await fetch("/api/releases", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    release_name: releaseNameInput,
                    launch_date: releaseDateInput,
                }),
            });
            if (!res.ok) throw new Error("Failed to add release");
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
            const res = await fetch(`/api/releases/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete release");
            fetchReleases();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleUpdateRelease = async (id: number, releaseName: string, launchDate: string) => {
        try {
            const res = await fetch(`/api/releases/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    release_name: releaseName,
                    launch_date: launchDate,
                }),
            });
            if (!res.ok) throw new Error("Failed to update release");
            setEditingReleaseId(null);
            fetchReleases();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch(`/api/settings?t=${Date.now()}`);
            if (!res.ok) throw new Error("Failed to fetch settings");
            const data = await res.json();
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
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });

            if (!res.ok) throw new Error("Failed to save settings");

            const updated = await res.json();
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
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...settings,
                    aha_fields_to_load: fieldsToLoad,
                }),
            });

            if (!res.ok) throw new Error("Failed to save fields");

            const updated = await res.json();
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
            const res = await fetch("/api/settings/aha-fields/sync", {
                method: "POST",
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to synchronize fields");
            }

            const result = await res.json();
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
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedSettings),
            });

            if (!res.ok) throw new Error("Failed to save settings");

            const saved = await res.json();
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
                                        ClearCo Criteria
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
                        {activeSection === "email-templates" && (
                            <div className="space-y-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                                            <IconMail className="w-6 h-6 text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-gray-900">Email Templates</h2>
                                            <p className="text-sm text-gray-500">Customize email templates for different notification types</p>
                                        </div>
                                    </div>

                                    {emailTemplatesLoading ? (
                                        <div className="text-center py-8 text-gray-500">Loading templates...</div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* Template Type Navigation */}
                                            <div className="border-b border-gray-200">
                                                <nav className="flex space-x-1" aria-label="Tabs">
                                                    <button
                                                        onClick={() => setActiveTemplateType("invite")}
                                                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                                            activeTemplateType === "invite"
                                                                ? "border-indigo-500 text-indigo-600"
                                                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                                        }`}
                                                    >
                                                        Invite
                                                    </button>
                                                    <button
                                                        onClick={() => setActiveTemplateType("remind")}
                                                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                                            activeTemplateType === "remind"
                                                                ? "border-indigo-500 text-indigo-600"
                                                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                                        }`}
                                                    >
                                                        Reminder
                                                    </button>
                                                    <button
                                                        onClick={() => setActiveTemplateType("update_criteria")}
                                                        className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                                            activeTemplateType === "update_criteria"
                                                                ? "border-indigo-500 text-indigo-600"
                                                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                                        }`}
                                                    >
                                                        Update Criteria
                                                    </button>
                                                </nav>
                                            </div>

                                            {/* Active Template Editor */}
                                            {activeTemplateType === "invite" && (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Subject Line
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={emailTemplates.invite_subject}
                                                            onChange={(e) => setEmailTemplates({ ...emailTemplates, invite_subject: e.target.value })}
                                                            placeholder="Welcome to ClearGO"
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">Leave empty to use default subject</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="block text-sm font-medium text-gray-700">
                                                                HTML Template
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setPreviewType("invite");
                                                                    setPreviewOpen(true);
                                                                }}
                                                                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                                            >
                                                                Preview
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            value={emailTemplates.invite_html}
                                                            onChange={(e) => setEmailTemplates({ ...emailTemplates, invite_html: e.target.value })}
                                                            placeholder="Leave empty to use default template"
                                                            rows={16}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Available placeholders: {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}greeting{"}"}{"}"}, {"{"}{"{"}inviteLink{"}"}{"}"}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {activeTemplateType === "remind" && (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Subject Line
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={emailTemplates.remind_subject}
                                                            onChange={(e) => setEmailTemplates({ ...emailTemplates, remind_subject: e.target.value })}
                                                            placeholder="Reminder: Join ClearGO"
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">Leave empty to use default subject</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="block text-sm font-medium text-gray-700">
                                                                HTML Template
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setPreviewType("remind");
                                                                    setPreviewOpen(true);
                                                                }}
                                                                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                                            >
                                                                Preview
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            value={emailTemplates.remind_html}
                                                            onChange={(e) => setEmailTemplates({ ...emailTemplates, remind_html: e.target.value })}
                                                            placeholder="Leave empty to use default template"
                                                            rows={16}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Available placeholders: {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}greeting{"}"}{"}"}, {"{"}{"{"}inviteLink{"}"}{"}"}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {activeTemplateType === "update_criteria" && (
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Subject Line
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={emailTemplates.update_criteria_subject}
                                                            onChange={(e) => setEmailTemplates({ ...emailTemplates, update_criteria_subject: e.target.value })}
                                                            placeholder="Action Required: Update Criteria in ClearGO"
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">Leave empty to use default subject</p>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <label className="block text-sm font-medium text-gray-700">
                                                                HTML Template
                                                            </label>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setPreviewType("update_criteria");
                                                                    setPreviewOpen(true);
                                                                }}
                                                                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                                                            >
                                                                Preview
                                                            </button>
                                                        </div>
                                                        <textarea
                                                            value={emailTemplates.update_criteria_html}
                                                            onChange={(e) => setEmailTemplates({ ...emailTemplates, update_criteria_html: e.target.value })}
                                                            placeholder="Leave empty to use default template"
                                                            rows={16}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                                                        />
                                                        <p className="mt-1 text-xs text-gray-500">
                                                            Available placeholders: {"{"}{"{"}firstName{"}"}{"}"}, {"{"}{"{"}greeting{"}"}{"}"}, {"{"}{"{"}actionLink{"}"}{"}"}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                                                {emailTemplatesSaving && (
                                                    <span className="text-sm text-gray-500 flex items-center gap-2">
                                                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                                        Saving...
                                                    </span>
                                                )}
                                                {!emailTemplatesSaving && emailTemplatesLoading === false && (
                                                    <span className="text-sm text-green-600">All changes saved</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Email Preview Modal */}
                        <Modal
                            opened={previewOpen}
                            onClose={() => setPreviewOpen(false)}
                            title={`Email Preview - ${
                                previewType === "invite" ? "Invite" 
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
                                {/* Readiness Thresholds */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-gray-900">Readiness Thresholds</h2>
                                            <p className="text-sm text-gray-500">Minimum readiness scores required per tier</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tier 1 Threshold</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="1"
                                                value={settings.threshold_tier1}
                                                onChange={(e) => setSettings({ ...settings, threshold_tier1: Number(e.target.value) })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">{(settings.threshold_tier1 * 100).toFixed(0)}%</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tier 2 Threshold</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="1"
                                                value={settings.threshold_tier2}
                                                onChange={(e) => setSettings({ ...settings, threshold_tier2: Number(e.target.value) })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">{(settings.threshold_tier2 * 100).toFixed(0)}%</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tier 3 Threshold</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="1"
                                                value={settings.threshold_tier3}
                                                onChange={(e) => setSettings({ ...settings, threshold_tier3: Number(e.target.value) })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                            <p className="text-xs text-gray-500 mt-1">{(settings.threshold_tier3 * 100).toFixed(0)}%</p>
                                        </div>
                                    </div>
                                </div>

                                {/* General Configuration */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-gray-900">General Configuration</h2>
                                            <p className="text-sm text-gray-500">Staleness, timezone, and digest settings</p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Staleness Window (Days)</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={settings.staleness_days}
                                                onChange={(e) => setSettings({ ...settings, staleness_days: Number(e.target.value) })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                                            <select
                                                value={settings.timezone}
                                                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            >
                                                <option value="America/New_York">America/New_York</option>
                                                <option value="America/Los_Angeles">America/Los_Angeles</option>
                                                <option value="Europe/London">Europe/London</option>
                                                <option value="UTC">UTC</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Digest Schedule</label>
                                        <input
                                            type="text"
                                            value={settings.digest_schedule}
                                            onChange={(e) => setSettings({ ...settings, digest_schedule: e.target.value })}
                                            placeholder="MON_09_00"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Format: DAY_HH_MM (e.g., MON_09_00)</p>
                                    </div>
                                </div>

                                {/* Integrations & Fallbacks */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-gray-900">Integrations & Fallbacks</h2>
                                            <p className="text-sm text-gray-500">Email, webhooks, and fallback user configuration</p>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Fallback Product Ops Email</label>
                                            <input
                                                type="email"
                                                value={settings.fallback_user_email}
                                                onChange={(e) => setSettings({ ...settings, fallback_user_email: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Sender</label>
                                            <input
                                                type="text"
                                                value={settings.email_sender}
                                                onChange={(e) => setSettings({ ...settings, email_sender: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Aha Webhook Secret</label>
                                            <input
                                                type="password"
                                                value={settings.aha_webhook_secret || ""}
                                                onChange={(e) => setSettings({ ...settings, aha_webhook_secret: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>

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
                            <div className="space-y-6">
                                {/* Launch Stages Table */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-semibold text-gray-900">Launch Stages</h2>
                                                <p className="text-sm text-gray-500">Configure launch stages and their durations</p>
                                            </div>
                                        </div>
                                        {!launchStagesLoading && launchStages.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    setEditingStageId(null);
                                                    setEditingStageName("");
                                                    setEditingStageDuration("");
                                                    setEditingStageDetails("");
                                                    setEditingStageDrawerOpen(true);
                                                }}
                                                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                                                title="Add New Stage"
                                            >
                                                +Add
                                            </button>
                                        )}
                                    </div>

                                    {launchStagesLoading ? (
                                        <div className="text-center py-8 text-gray-500">Loading...</div>
                                    ) : launchStages.length === 0 ? (
                                        <div className="text-center py-8">
                                            <p className="text-gray-500 mb-4">No launch stages found.</p>
                                            <p className="text-sm text-gray-400">The migration may not have inserted the initial data. Check the database or add stages manually.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                                                <table className="min-w-full divide-y divide-purple-200 table-fixed">
                                                    <colgroup>
                                                        <col className="w-12" />
                                                        <col className="w-16" />
                                                        <col className="w-auto" />
                                                        <col className="w-32" />
                                                        <col className="w-auto" />
                                                        <col className="w-32" />
                                                    </colgroup>
                                                    <thead className="bg-purple-100">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-12"></th>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-16">Rank</th>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Stage Name</th>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">Duration (days)</th>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Details</th>
                                                            <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-16">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-purple-200">
                                                        {launchStages.map((stage, index) => (
                                                            <tr 
                                                                key={stage.id} 
                                                                onDragOver={(e) => {
                                                                    e.preventDefault();
                                                                    e.dataTransfer.dropEffect = "move";
                                                                    if (draggedStageId !== stage.id) {
                                                                        e.currentTarget.classList.add("bg-purple-100");
                                                                    }
                                                                }}
                                                                onDragLeave={(e) => {
                                                                    e.currentTarget.classList.remove("bg-purple-100");
                                                                }}
                                                                onDrop={async (e) => {
                                                                    e.preventDefault();
                                                                    e.currentTarget.classList.remove("bg-purple-100");
                                                                    if (draggedStageId && draggedStageId !== stage.id) {
                                                                        await handleReorderStages(draggedStageId, stage.id, index);
                                                                    }
                                                                    setDraggedStageId(null);
                                                                }}
                                                                className={`hover:bg-purple-50 transition-colors ${draggedStageId === stage.id ? "opacity-50" : ""}`}
                                                            >
                                                                <td 
                                                                    className="px-2 py-3 whitespace-nowrap w-12 cursor-move"
                                                                    draggable
                                                                    onDragStart={(e) => {
                                                                        setDraggedStageId(stage.id);
                                                                        e.dataTransfer.effectAllowed = "move";
                                                                    }}
                                                                    onDragEnd={() => {
                                                                        setDraggedStageId(null);
                                                                    }}
                                                                >
                                                                    <div className="flex items-center justify-center text-gray-400">
                                                                        <IconGripVertical className="w-5 h-5" />
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap w-16">
                                                                    <span className="font-medium text-gray-900">{stage.sort_order}</span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <span className="font-medium text-gray-900">{stage.name}</span>
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap w-32">
                                                                    <span className="text-gray-700">
                                                                        {stage.duration_days !== null ? `${stage.duration_days} days` : "N/A"}
                                                                    </span>
                                                                </td>
                                                                <td 
                                                                    className="px-4 py-3"
                                                                    onDragStart={(e) => e.stopPropagation()}
                                                                >
                                                                    <RichText
                                                                        value={stage.details || ""}
                                                                        onChange={() => {}}
                                                                        readOnly={true}
                                                                    />
                                                                </td>
                                                                <td 
                                                                    className="px-4 py-3 whitespace-nowrap w-16"
                                                                    onDragStart={(e) => e.stopPropagation()}
                                                                >
                                                                    <div className="flex justify-end">
                                                                        <button
                                                                            onClick={() => {
                                                                                setEditingStageId(stage.id);
                                                                                setEditingStageName(stage.name);
                                                                                setEditingStageDuration(stage.duration_days?.toString() || "");
                                                                                setEditingStageDetails(stage.details || "");
                                                                                setEditingStageDrawerOpen(true);
                                                                            }}
                                                                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 transition-colors"
                                                                            title="Edit"
                                                                            onDragStart={(e) => e.stopPropagation()}
                                                                        >
                                                                            <IconPencil className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Chart */}
                                <LaunchStagesChart stages={launchStages} />
                            </div>
                        )}

                        {/* Edit Stage Drawer */}
                        <EditStageDrawer
                            opened={editingStageDrawerOpen}
                            onClose={() => {
                                setEditingStageDrawerOpen(false);
                                setEditingStageId(null);
                                setEditingStageName("");
                                setEditingStageDuration("");
                                setEditingStageDetails("");
                            }}
                            stageId={editingStageId}
                            stageName={editingStageName}
                            setStageName={setEditingStageName}
                            stageDuration={editingStageDuration}
                            setStageDuration={setEditingStageDuration}
                            stageDetails={editingStageDetails}
                            setStageDetails={setEditingStageDetails}
                            onSave={() => {
                                if (editingStageId !== null) {
                                    // Editing existing stage
                                    handleUpdateStage(
                                        editingStageId,
                                        editingStageName,
                                        editingStageDuration ? parseInt(editingStageDuration) : null,
                                        editingStageDetails || null
                                    );
                                    setEditingStageDrawerOpen(false);
                                    setEditingStageId(null);
                                    setEditingStageName("");
                                    setEditingStageDuration("");
                                    setEditingStageDetails("");
                                } else {
                                    // Adding new stage
                                    handleAddStage();
                                }
                            }}
                            onDelete={() => {
                                if (editingStageId !== null) {
                                    handleDeleteStage(editingStageId);
                                    setEditingStageDrawerOpen(false);
                                    setEditingStageId(null);
                                    setEditingStageName("");
                                    setEditingStageDuration("");
                                    setEditingStageDetails("");
                                }
                            }}
                        />

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
                            <div className="space-y-6">
                                {/* Aha! Epic fields */}
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h2 className="text-lg font-semibold text-gray-900">AHA Epic Fields</h2>
                                                <p className="text-sm text-gray-500">Configure which AHA fields (standard and custom) should be loaded with each launch</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSynchronizeFields}
                                            disabled={syncing}
                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {syncing ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Synchronizing...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    Synchronize
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    {syncResult && (
                                        <div className={`mb-6 p-4 rounded-lg border ${
                                            syncResult.failed > 0 
                                                ? 'bg-yellow-50 border-yellow-200 text-yellow-800' 
                                                : 'bg-green-50 border-green-200 text-green-800'
                                        }`}>
                                            <div className="flex items-start gap-2">
                                                {syncResult.failed > 0 ? (
                                                    <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                )}
                                                <div className="flex-1">
                                                    <p className="font-medium">{syncResult.message}</p>
                                                    <p className="text-sm mt-1">
                                                        {syncResult.synced} succeeded, {syncResult.failed} failed out of {syncResult.total} total launches.
                                                    </p>
                                                    {syncResult.errors && syncResult.errors.length > 0 && (
                                                        <details className="mt-2">
                                                            <summary className="text-sm cursor-pointer hover:underline">Show errors</summary>
                                                            <ul className="mt-2 text-sm list-disc list-inside space-y-1">
                                                                {syncResult.errors.map((err, idx) => (
                                                                    <li key={idx}>
                                                                        <strong>{err.name}</strong> ({err.aha_id}): {err.error}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </details>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {ahaFieldsLoading ? (
                                        <div className="text-center py-8 text-gray-500">Loading available fields...</div>
                                    ) : (
                                        <div className="space-y-6">
                                            {/* Description */}
                                            <p className="text-sm text-gray-600">
                                                Select the fields that should be loaded from AHA and stored with each launch. 
                                                Standard fields (like ID, Name, Release) are always available and cannot be deselected. Custom fields can be added or removed without schema changes.
                                            </p>

                                            {/* Standard Fields Section - Always Visible */}
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                                    Standard Fields (Always Loaded) ({availableAhaFields.filter(field => field.type === 'standard').length})
                                                </h3>
                                                <div className="border-2 border-blue-200 rounded-lg bg-blue-50 overflow-hidden">
                                                    <table className="min-w-full divide-y divide-blue-200 table-fixed">
                                                        <colgroup>
                                                            <col className="w-16" />
                                                            <col className="w-auto" />
                                                            <col className="w-auto" />
                                                            <col className="w-24" />
                                                        </colgroup>
                                                        <thead className="bg-blue-100">
                                                            <tr>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-blue-900 w-16"></th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-blue-900">Label</th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-blue-900">Alias</th>
                                                                <th className="px-4 py-2 text-left text-xs font-medium text-blue-900 w-24">Type</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-blue-200">
                                                            {availableAhaFields
                                                                .filter(field => field.type === 'standard')
                                                                .length > 0 ? (
                                                                availableAhaFields
                                                                    .filter(field => field.type === 'standard')
                                                                    .map((field) => (
                                                                        <tr key={field.alias} className="hover:bg-blue-50 transition-colors">
                                                                            <td className="px-4 py-3 whitespace-nowrap w-16"></td>
                                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                                <span className="font-medium text-gray-900">{field.label}</span>
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                                <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700">{field.alias}</code>
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap w-24">
                                                                                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">Standard</span>
                                                                            </td>
                                                                        </tr>
                                                                    ))
                                                            ) : (
                                                                <tr>
                                                                    <td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-500">
                                                                        {ahaFieldsLoading ? 'Loading standard fields...' : 'No standard fields available'}
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            {/* Selected Custom Fields Section */}
                                            <div>
                                                <div className="flex items-center justify-between mb-3">
                                                    <h3 className="text-sm font-semibold text-gray-900">
                                                        Selected Custom Fields {settings.aha_fields_to_load && settings.aha_fields_to_load.filter(alias => availableAhaFields.find(f => f.alias === alias)?.type !== 'standard').length > 0 && `(${settings.aha_fields_to_load.filter(alias => availableAhaFields.find(f => f.alias === alias)?.type !== 'standard').length})`}
                                                    </h3>
                                                    {ahaFieldsSaving && (
                                                        <span className="text-xs text-indigo-600 flex items-center gap-1">
                                                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            Saving...
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 mb-2">Drag and drop to reorder custom fields. Changes are saved automatically. This order will be used when displaying fields on Launch/Epic pages.</p>
                                                <div className="border-2 border-indigo-200 rounded-lg bg-indigo-50 min-h-[100px] overflow-hidden">
                                                    {settings.aha_fields_to_load && settings.aha_fields_to_load.filter(alias => {
                                                        const field = availableAhaFields.find(f => f.alias === alias);
                                                        return field && field.type !== 'standard';
                                                    }).length > 0 ? (
                                                        <table className="min-w-full divide-y divide-indigo-200 table-fixed">
                                                            <colgroup>
                                                                <col className="w-16" />
                                                                <col className="w-auto" />
                                                                <col className="w-auto" />
                                                                <col className="w-24" />
                                                            </colgroup>
                                                            <thead className="bg-indigo-100">
                                                                <tr>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900 w-16"></th>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Label</th>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Alias</th>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900 w-24">Type</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-indigo-200">
                                                                {settings.aha_fields_to_load
                                                                    .filter(alias => {
                                                                        const field = availableAhaFields.find(f => f.alias === alias);
                                                                        return field && field.type !== 'standard';
                                                                    })
                                                                    .map((alias, index) => {
                                                                        const field = availableAhaFields.find(f => f.alias === alias);
                                                                        if (!field) return null;
                                                                    return (
                                                                        <tr
                                                                            key={alias}
                                                                            draggable
                                                                            onDragStart={(e) => {
                                                                                setDraggedFieldAlias(alias);
                                                                                e.dataTransfer.effectAllowed = "move";
                                                                            }}
                                                                            onDragOver={(e) => {
                                                                                e.preventDefault();
                                                                                e.dataTransfer.dropEffect = "move";
                                                                                if (draggedFieldAlias !== alias) {
                                                                                    e.currentTarget.classList.add("bg-blue-100");
                                                                                }
                                                                            }}
                                                                            onDragLeave={(e) => {
                                                                                e.currentTarget.classList.remove("bg-blue-100");
                                                                            }}
                                                                            onDrop={(e) => {
                                                                                e.preventDefault();
                                                                                e.currentTarget.classList.remove("bg-blue-100");
                                                                                if (draggedFieldAlias && draggedFieldAlias !== alias) {
                                                                                    const currentFields = settings.aha_fields_to_load || [];
                                                                                    const draggedIndex = currentFields.indexOf(draggedFieldAlias);
                                                                                    const targetIndex = currentFields.indexOf(alias);
                                                                                    
                                                                                    if (draggedIndex !== -1 && targetIndex !== -1) {
                                                                                        const newFields = [...currentFields];
                                                                                        const [draggedItem] = newFields.splice(draggedIndex, 1);
                                                                                        newFields.splice(targetIndex, 0, draggedItem);
                                                                                        
                                                                                        setSettings({
                                                                                            ...settings,
                                                                                            aha_fields_to_load: newFields,
                                                                                        });
                                                                                        autoSaveAhaFields(newFields);
                                                                                    }
                                                                                }
                                                                                setDraggedFieldAlias(null);
                                                                            }}
                                                                            className={`cursor-move hover:bg-indigo-50 transition-colors ${draggedFieldAlias === alias ? "opacity-50" : ""}`}
                                                                        >
                                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                                <div className="flex items-center gap-2">
                                                                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                                                                    </svg>
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={true}
                                                                                        onChange={(e) => {
                                                                                            const currentFields = settings.aha_fields_to_load || [];
                                                                                            const newFields = currentFields.filter(f => f !== alias);
                                                                                            setSettings({
                                                                                                ...settings,
                                                                                                aha_fields_to_load: newFields,
                                                                                            });
                                                                                            autoSaveAhaFields(newFields);
                                                                                        }}
                                                                                        onClick={(e) => e.stopPropagation()}
                                                                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                                                                    />
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                                <span className="font-medium text-gray-900">{field.label}</span>
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                                <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700">{field.alias}</code>
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap w-24">
                                                                                {field.type === 'standard' ? (
                                                                                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">Standard</span>
                                                                                ) : (
                                                                                    <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">Custom</span>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <div className="text-sm text-gray-400 italic text-center py-4">
                                                            No fields selected. Select fields from the list below.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Unselected Custom Fields Section at Bottom */}
                                            <div>
                                                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                                    Available Custom Fields ({availableAhaFields.filter(f => f.type !== 'standard' && !settings.aha_fields_to_load?.includes(f.alias)).length})
                                                </h3>
                                                <div className="border-2 border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
                                                    {availableAhaFields.filter(f => f.type !== 'standard' && !settings.aha_fields_to_load?.includes(f.alias)).length > 0 ? (
                                                        <table className="min-w-full divide-y divide-gray-200 table-fixed">
                                                            <colgroup>
                                                                <col className="w-16" />
                                                                <col className="w-auto" />
                                                                <col className="w-auto" />
                                                                <col className="w-24" />
                                                            </colgroup>
                                                            <thead className="bg-gray-100">
                                                                <tr>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-16"></th>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Label</th>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Alias</th>
                                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-24">Type</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-200">
                                                                {availableAhaFields
                                                                    .filter(field => field.type !== 'standard' && !settings.aha_fields_to_load?.includes(field.alias))
                                                                    .map((field) => {
                                                                        return (
                                                                            <tr
                                                                                key={field.alias}
                                                                                className="hover:bg-gray-50 transition-colors"
                                                                            >
                                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={false}
                                                                                        onChange={(e) => {
                                                                                            const currentFields = settings.aha_fields_to_load || [];
                                                                                            const newFields = [...currentFields, field.alias];
                                                                                            setSettings({
                                                                                                ...settings,
                                                                                                aha_fields_to_load: newFields,
                                                                                            });
                                                                                            autoSaveAhaFields(newFields);
                                                                                        }}
                                                                                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 cursor-pointer"
                                                                                    />
                                                                                </td>
                                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                                    <span className="font-medium text-gray-900">{field.label}</span>
                                                                                </td>
                                                                                <td className="px-4 py-3 whitespace-nowrap">
                                                                                    <code className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700">{field.alias}</code>
                                                                                </td>
                                                                                <td className="px-4 py-3 whitespace-nowrap w-24">
                                                                                    {field.type === 'standard' ? (
                                                                                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">Standard</span>
                                                                                    ) : (
                                                                                        <span className="px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded">Custom</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <div className="text-sm text-gray-400 italic text-center py-4">
                                                            All fields are selected.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </main>
    );
}

const ROLES = [
    "CPO",
    "PRODUCT_LEAD",
    "PM",
    "PMM",
    "ENG_LEAD",
    "SUPPORT_LEAD",
    "SECURITY",
    "LEARNING",
    "PRODUCT_OPS",
    "OTHER",
];

function UserManagementSection({
    users,
    loading,
    onRefresh,
    editingUserId,
    setEditingUserId,
    selectedUserIds,
    setSelectedUserIds,
    showAddUser,
    setShowAddUser,
    bulkImportFile,
    setBulkImportFile,
    bulkImportLoading,
    setBulkImportLoading,
    settings,
    setSettings,
    updatePodMapping,
    handleSave,
    pods,
    podsLoading,
    saving,
    domainInput,
    setDomainInput,
    addDomain,
    removeDomain,
}: {
    users: any[];
    loading: boolean;
    onRefresh: () => void;
    editingUserId: string | null;
    setEditingUserId: (id: string | null) => void;
    selectedUserIds: Set<string>;
    setSelectedUserIds: (ids: Set<string>) => void;
    showAddUser: boolean;
    setShowAddUser: (show: boolean) => void;
    bulkImportFile: File | null;
    setBulkImportFile: (file: File | null) => void;
    bulkImportLoading: boolean;
    setBulkImportLoading: (loading: boolean) => void;
    settings: AppSettings;
    setSettings: (settings: AppSettings) => void;
    updatePodMapping: (pod: string, userEmail: string | null) => void;
    handleSave: (e: React.FormEvent) => Promise<void>;
    pods: string[];
    podsLoading: boolean;
    saving: boolean;
    domainInput: string;
    setDomainInput: (input: string) => void;
    addDomain: () => void;
    removeDomain: (domain: string) => void;
}) {
    const [newUser, setNewUser] = useState({
        email: "",
        first_name: "",
        last_name: "",
        roles: [] as string[],
        is_active: true,
    });

    const handleAddUser = async () => {
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...newUser,
                    roles: newUser.roles.length > 0 ? newUser.roles : ["OTHER"],
                }),
            });
            if (!res.ok) throw new Error("Failed to create user");
            setNewUser({ email: "", first_name: "", last_name: "", roles: [], is_active: true });
            setShowAddUser(false);
            onRefresh();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleBulkImport = async () => {
        if (!bulkImportFile) return;
        setBulkImportLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", bulkImportFile);
            const res = await fetch("/api/users/bulk", {
                method: "POST",
                body: formData,
            });
            if (!res.ok) throw new Error("Failed to import users");
            const data = await res.json();
            alert(`Successfully imported ${data.created} user(s)`);
            setBulkImportFile(null);
            onRefresh();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        } finally {
            setBulkImportLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedUserIds.size === 0) return;
        if (!confirm(`Delete ${selectedUserIds.size} user(s)?`)) return;
        try {
            const res = await fetch("/api/users/bulk-delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedUserIds) }),
            });
            if (!res.ok) throw new Error("Failed to delete users");
            setSelectedUserIds(new Set());
            onRefresh();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (!confirm("Delete this user?")) return;
        try {
            const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete user");
            onRefresh();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleInviteUser = async (id: string, type: "invite" | "remind" = "invite") => {
        try {
            const res = await fetch(`/api/users/${id}/invite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type }),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to send invitation");
            }
            const data = await res.json();
            alert(`Success: ${data.message}`);
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const handleBulkInvite = async (type: "invite" | "remind" = "invite") => {
        if (selectedUserIds.size === 0) {
            alert("Please select at least one user");
            return;
        }
        if (!confirm(`${type === "invite" ? "Invite" : "Remind"} ${selectedUserIds.size} user(s)?`)) return;
        try {
            const res = await fetch("/api/users/bulk-invite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userIds: Array.from(selectedUserIds),
                    type,
                }),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.error || "Failed to send invitations");
            }
            const data = await res.json();
            alert(`Success: ${data.sent} invitation(s) sent${data.failed > 0 ? `, ${data.failed} failed` : ""}`);
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const editingUser = users.find(u => u.id === editingUserId);

    return (
        <div className="space-y-6">
            {/* Allowlisted Domains */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Allowlisted Domains</h2>
                        <p className="text-sm text-gray-500">Email domains permitted to access the application</p>
                    </div>
                </div>
                <div>
                    <div className="flex gap-3 mb-4">
                        <input
                            type="text"
                            value={domainInput}
                            onChange={(e) => setDomainInput(e.target.value)}
                            placeholder="example.com"
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDomain(); } }}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                        <button
                            type="button"
                            onClick={addDomain}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                        >
                            Add Domain
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {settings.allowlisted_domains.map((domain) => (
                            <span key={domain} className="inline-flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                <span className="text-sm text-gray-700">{domain}</span>
                                <button
                                    type="button"
                                    onClick={() => removeDomain(domain)}
                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Pod → Product Manager Mapping */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Pod → Product Manager Mapping</h2>
                        <p className="text-sm text-gray-500">Map pod names to product managers for criteria resolution</p>
                    </div>
                </div>
                <div>
                    {podsLoading ? (
                        <div className="text-center py-8 text-gray-500">Loading pods...</div>
                    ) : pods.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No pods found. Pods will appear here once launches are synced from AHA.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pod</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Manager</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {pods.map((pod: string) => {
                                        const currentMapping = settings.pod_product_manager_mapping || {};
                                        const currentEmail = currentMapping[pod] || "";
                                        
                                        return (
                                            <tr key={pod} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm font-medium text-gray-900">{pod}</span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <select
                                                        value={currentEmail}
                                                        onChange={(e) => updatePodMapping(pod, e.target.value || null)}
                                                        className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm"
                                                    >
                                                        <option value="">— Select Product Manager —</option>
                                                        {users
                                                            .filter(u => u.is_active !== false)
                                                            .map((user) => {
                                                                const displayName = user.first_name || user.last_name
                                                                    ? `${user.first_name || ""} ${user.last_name || ""}`.trim()
                                                                    : user.email;
                                                                return (
                                                                    <option key={user.id} value={user.email}>
                                                                        {displayName} {user.email !== displayName ? `(${user.email})` : ""}
                                                                    </option>
                                                                );
                                                            })}
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* User Management */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
                            <p className="text-sm text-gray-500">Manage users, roles, and permissions</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setShowAddUser(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
                        >
                            Add User
                        </button>
                        <label className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors cursor-pointer">
                            Import Bulk
                            <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={(e) => setBulkImportFile(e.target.files?.[0] || null)}
                            />
                        </label>
                        {selectedUserIds.size > 0 && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => handleBulkInvite("invite")}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors flex items-center gap-2"
                                >
                                    <IconMail className="w-4 h-4" />
                                    Invite Selected ({selectedUserIds.size})
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBulkDelete}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                                >
                                    Delete Selected ({selectedUserIds.size})
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {bulkImportFile && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                        <span className="text-sm text-blue-700">{bulkImportFile.name}</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={handleBulkImport}
                                disabled={bulkImportLoading}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                            >
                                {bulkImportLoading ? "Importing..." : "Import"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setBulkImportFile(null)}
                                className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {showAddUser && (
                    <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <h3 className="font-medium text-gray-900 mb-4">Add New User</h3>
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="email"
                                    placeholder="Email *"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                    className="px-3 py-2 border border-gray-300 rounded-lg"
                                />
                                <MultiSelect
                                    data={ROLES}
                                    value={newUser.roles}
                                    onChange={(value) => setNewUser({ ...newUser, roles: value })}
                                    placeholder="Select roles"
                                    styles={{
                                        input: {
                                            minHeight: 'calc(2.5rem + 4px)',
                                            height: 'calc(2.5rem + 4px)',
                                            fontSize: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                        }
                                    }}
                                    classNames={{
                                        input: 'text-base'
                                    }}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input
                                    type="text"
                                    placeholder="First Name"
                                    value={newUser.first_name}
                                    onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                                    className="px-3 py-2 border border-gray-300 rounded-lg"
                                />
                                <input
                                    type="text"
                                    placeholder="Last Name"
                                    value={newUser.last_name}
                                    onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                                    className="px-3 py-2 border border-gray-300 rounded-lg"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleAddUser}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                >
                                    Add
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddUser(false)}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading users...</div>
                ) : (
                    <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                        <table className="min-w-full divide-y divide-purple-200 table-fixed">
                            <colgroup>
                                <col className="w-12" />
                                <col className="w-auto" />
                                <col className="w-auto" />
                                <col className="w-auto" />
                                <col className="w-auto" />
                                <col className="w-32" />
                                <col className="w-40" />
                            </colgroup>
                            <thead className="bg-purple-100">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-12">
                                        <input
                                            type="checkbox"
                                            checked={selectedUserIds.size === users.length && users.length > 0}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedUserIds(new Set(users.map(u => u.id)));
                                                } else {
                                                    setSelectedUserIds(new Set());
                                                }
                                            }}
                                        />
                                    </th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">First Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Last Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Email</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Roles</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900 w-32">Last Logged In</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-purple-900 w-40">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-purple-200">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-purple-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.has(user.id)}
                                                onChange={(e) => {
                                                    const newSet = new Set(selectedUserIds);
                                                    if (e.target.checked) {
                                                        newSet.add(user.id);
                                                    } else {
                                                        newSet.delete(user.id);
                                                    }
                                                    setSelectedUserIds(newSet);
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{user.first_name || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-900">{user.last_name || "—"}</td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{user.email}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <div className="flex flex-wrap gap-1">
                                                {(user.roles || [user.role || "OTHER"]).map((role: string) => (
                                                    <span key={role} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
                                                        {role}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap w-32">
                                            {user.last_logged_in
                                                ? new Date(user.last_logged_in).toLocaleDateString()
                                                : "Never"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap w-40">
                                            <div className="flex justify-end gap-1">
                                                {!user.last_logged_in && (
                                                    <button
                                                        onClick={() => handleInviteUser(user.id, "invite")}
                                                        className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                                                        title="Invite"
                                                    >
                                                        <IconMail className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => setEditingUserId(user.id)}
                                                    className="p-1.5 rounded hover:bg-gray-100 text-gray-600 transition-colors"
                                                    title="Edit"
                                                >
                                                    <IconPencil className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {editingUser && (
                <EditUserDrawer
                    user={editingUser}
                    opened={!!editingUserId}
                    onClose={() => setEditingUserId(null)}
                    onSave={async (patch) => {
                        const res = await fetch(`/api/users/${editingUser.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(patch),
                        });
                        if (!res.ok) throw new Error("Failed to update");
                        setEditingUserId(null);
                        onRefresh();
                    }}
                    onDelete={async () => {
                        await handleDeleteUser(editingUser.id);
                        setEditingUserId(null);
                    }}
                />
            )}
        </div>
    );
}

function ReleaseWithoutDateRow({
    launchRelease,
    formatDateForInput,
    handleMapReleaseName,
}: {
    launchRelease: {releaseName: string; launchDate: string | null};
    formatDateForInput: (date: string) => string;
    handleMapReleaseName: (releaseName: string, launchDate: string) => Promise<void>;
}) {
    const [dateInput, setDateInput] = useState(launchRelease.launchDate ? formatDateForInput(launchRelease.launchDate) : "");

    return (
        <tr className="hover:bg-purple-50 transition-colors">
            <td className="px-4 py-3 whitespace-nowrap">
                <span className="font-medium text-gray-900">{launchRelease.releaseName}</span>
            </td>
            <td className="px-4 py-3 whitespace-nowrap">
                <input
                    type="text"
                    placeholder="MM/DD/YYYY"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && dateInput.trim()) {
                            handleMapReleaseName(launchRelease.releaseName, dateInput);
                            setDateInput("");
                        }
                    }}
                    className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 text-sm"
                />
            </td>
            <td className="px-4 py-3 text-right">
                <button
                    onClick={() => {
                        if (dateInput.trim()) {
                            handleMapReleaseName(launchRelease.releaseName, dateInput);
                            setDateInput("");
                        } else {
                            alert("Please enter a launch date");
                        }
                    }}
                    className="text-purple-600 hover:text-purple-900 text-sm font-medium"
                >
                    Map
                </button>
            </td>
        </tr>
    );
}

function ReleaseDateInputRow({
    releaseDate,
    formatDateForInput,
    handleMapReleaseDate,
    releaseName,
}: {
    releaseDate: string;
    formatDateForInput: (date: string) => string;
    handleMapReleaseDate: (releaseDate: string) => Promise<void>;
    releaseName: string;
}) {
    const [inputValue, setInputValue] = useState(releaseDate ? formatDateForInput(releaseDate) : "");

    return (
        <div className="flex items-center gap-2">
            <input
                type="text"
                placeholder="MM/DD/YYYY (e.g. 10/08/2026)"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (inputValue.trim()) {
                            handleMapReleaseDate(inputValue);
                            setInputValue("");
                        }
                    }
                }}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm"
            />
            <button
                onClick={() => {
                    if (inputValue.trim()) {
                        handleMapReleaseDate(inputValue);
                        setInputValue("");
                    } else {
                        alert("Please enter a launch date");
                    }
                }}
                className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
            >
                Map
            </button>
        </div>
    );
}

function ReleaseScheduleSection({
    releases,
    loading,
    releaseNameInput,
    setReleaseNameInput,
    releaseDateInput,
    setReleaseDateInput,
    onAdd,
    onDelete,
    editingReleaseId,
    setEditingReleaseId,
    onUpdate,
    launchReleases,
    launchReleasesLoading,
    onRefresh,
    onRefreshReleases,
}: {
    releases: any[];
    loading: boolean;
    releaseNameInput: string;
    setReleaseNameInput: (input: string) => void;
    releaseDateInput: string;
    setReleaseDateInput: (input: string) => void;
    onAdd: () => void;
    onDelete: (id: number) => void;
    editingReleaseId: number | string | null;
    setEditingReleaseId: (id: number | string | null) => void;
    onUpdate: (id: number, releaseName: string, launchDate: string) => void;
    launchReleases: Array<{releaseName: string; launchDate: string | null}>;
    launchReleasesLoading: boolean;
    onRefresh: () => void;
    onRefreshReleases: () => Promise<void>;
}) {
    const formatDateForDisplay = (dateString: string) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const year = date.getFullYear();
        return `${month}/${day}/${year}`;
    };

    const formatDateForInput = (dateString: string) => {
        if (!dateString) return "";
        return formatDateForDisplay(dateString);
    };

    const handleMapReleaseName = async (releaseName: string, launchDate: string) => {
        if (!launchDate.trim()) {
            alert("Please enter a launch date");
            return;
        }
        try {
            const res = await fetch("/api/releases", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    release_name: releaseName.trim(),
                    launch_date: formatDateForInput(launchDate),
                }),
            });
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Failed to create release mapping");
            }
            // Refresh both the releases list and launch releases to show updated mappings
            await onRefreshReleases();
            await onRefresh();
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    // Create a map of release names to launch dates for quick lookup
    const releaseNameToDateMap = new Map<string, string>();
    releases.forEach((release) => {
        if (release.release_name && release.launch_date) {
            releaseNameToDateMap.set(release.release_name, release.launch_date);
        }
    });

    // Separate releases without dates from those with dates
    const releasesWithoutDates = launchReleases.filter((launchRelease) => {
        const existingLaunchDate = releaseNameToDateMap.get(launchRelease.releaseName);
        return !existingLaunchDate;
    });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Release Schedule</h2>
                    <p className="text-sm text-gray-500">Map release names to launch dates</p>
                </div>
            </div>

            {/* Releases without launch dates */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-md font-semibold text-gray-900">Releases Without Launch Dates</h3>
                    <button
                        onClick={onRefresh}
                        disabled={launchReleasesLoading}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Refresh
                    </button>
                </div>
                {launchReleasesLoading ? (
                    <div className="text-center py-4 text-gray-500 text-sm">Loading release names from launches...</div>
                ) : releasesWithoutDates.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">All releases have launch dates mapped</p>
                ) : (
                    <div className="border-2 border-purple-200 rounded-lg bg-purple-50 overflow-hidden">
                        <table className="min-w-full divide-y divide-purple-200 table-fixed">
                            <colgroup>
                                <col className="w-2/5" />
                                <col className="w-2/5" />
                                <col className="w-24" />
                            </colgroup>
                            <thead className="bg-purple-100">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Release Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-purple-900">Launch Date</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-purple-900">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-purple-200">
                                {releasesWithoutDates.map((launchRelease) => (
                                    <ReleaseWithoutDateRow
                                        key={launchRelease.releaseName}
                                        launchRelease={launchRelease}
                                        formatDateForInput={formatDateForInput}
                                        handleMapReleaseName={handleMapReleaseName}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Current mappings */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-md font-semibold text-gray-900">Current Mappings</h3>
                    <button
                        onClick={() => setEditingReleaseId("new")}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                        + Add Mapping
                    </button>
                </div>
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading releases...</div>
                ) : (
                    <div className="border-2 border-indigo-200 rounded-lg bg-indigo-50 overflow-hidden">
                        <table className="min-w-full divide-y divide-indigo-200 table-fixed">
                            <colgroup>
                                <col className="w-2/5" />
                                <col className="w-2/5" />
                                <col className="w-24" />
                            </colgroup>
                            <thead className="bg-indigo-100">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Release Name</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-indigo-900">Launch Date</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-indigo-900">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-indigo-200">
                                {editingReleaseId === "new" && (
                                    <tr className="hover:bg-indigo-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                placeholder="e.g. APP-R-304 Release 2025.10"
                                                id="release-name-new"
                                                className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </td>
                                        <td className="px-4 py-3">
                                            <input
                                                type="text"
                                                placeholder="MM/DD/YYYY"
                                                id="release-date-new"
                                                className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => {
                                                    const nameInput = document.getElementById("release-name-new") as HTMLInputElement;
                                                    const dateInput = document.getElementById("release-date-new") as HTMLInputElement;
                                                    if (nameInput && dateInput && nameInput.value && dateInput.value) {
                                                        setReleaseNameInput(nameInput.value);
                                                        setReleaseDateInput(dateInput.value);
                                                        onAdd();
                                                        setEditingReleaseId(null);
                                                    } else {
                                                        alert("Please fill in both release name and date");
                                                    }
                                                }}
                                                className="text-indigo-600 hover:text-indigo-900 mr-4"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => setEditingReleaseId(null)}
                                                className="text-gray-600 hover:text-gray-900"
                                            >
                                                Cancel
                                            </button>
                                        </td>
                                    </tr>
                                )}
                                {releases.map((release) => (
                                    <tr key={release.id} className="hover:bg-indigo-50 transition-colors">
                                        {editingReleaseId === release.id ? (
                                            <>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="text"
                                                        defaultValue={release.release_name}
                                                        id={`release-name-${release.id}`}
                                                        className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="text"
                                                        defaultValue={formatDateForDisplay(release.launch_date)}
                                                        id={`release-date-${release.id}`}
                                                        placeholder="MM/DD/YYYY"
                                                        className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => {
                                                            const nameInput = document.getElementById(`release-name-${release.id}`) as HTMLInputElement;
                                                            const dateInput = document.getElementById(`release-date-${release.id}`) as HTMLInputElement;
                                                            if (nameInput && dateInput) {
                                                                onUpdate(release.id, nameInput.value, dateInput.value);
                                                            }
                                                        }}
                                                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingReleaseId(null)}
                                                        className="text-gray-600 hover:text-gray-900"
                                                    >
                                                        Cancel
                                                    </button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-3">
                                                    <span className="font-medium text-gray-900">{release.release_name}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-gray-600">{formatDateForDisplay(release.launch_date)}</span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm font-medium">
                                                    <button
                                                        onClick={() => setEditingReleaseId(release.id)}
                                                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => onDelete(release.id)}
                                                        className="text-red-600 hover:text-red-900"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                                {releases.length === 0 && editingReleaseId !== "new" && (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-4 text-center text-sm text-gray-500">
                                            No release mappings configured. Click "+ Add Mapping" to create one.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function EditUserDrawer({
    user,
    opened,
    onClose,
    onSave,
    onDelete,
}: {
    user: any;
    opened: boolean;
    onClose: () => void;
    onSave: (patch: any) => Promise<void>;
    onDelete: () => Promise<void>;
}) {
    const [patch, setPatch] = useState({
        email: user.email || "",
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        roles: user.roles || [user.role || "OTHER"],
        is_active: user.is_active !== false,
    });

    return (
        <Drawer opened={opened} onClose={onClose} title="Edit User" position="right" size="xl" padding="lg">
            <Stack gap="md">
                <Group grow>
                    <TextInput label="Email" value={patch.email} onChange={(e) => setPatch({ ...patch, email: e.target.value })} required />
                    <MultiSelect
                        label="Roles"
                        data={ROLES}
                        value={patch.roles}
                        onChange={(value) => setPatch({ ...patch, roles: value })}
                        styles={{
                            input: {
                                minHeight: 'calc(2.5rem + 4px)',
                                height: 'calc(2.5rem + 4px)',
                                fontSize: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                            }
                        }}
                        classNames={{
                            input: 'text-base'
                        }}
                    />
                </Group>
                <Group grow>
                    <TextInput label="First Name" value={patch.first_name} onChange={(e) => setPatch({ ...patch, first_name: e.target.value })} />
                    <TextInput label="Last Name" value={patch.last_name} onChange={(e) => setPatch({ ...patch, last_name: e.target.value })} />
                </Group>
                <Checkbox
                    label="Active"
                    checked={patch.is_active}
                    onChange={(e) => setPatch({ ...patch, is_active: e.target.checked })}
                />
                <Group justify="space-between" mt="xl">
                    <Button 
                        variant="outline" 
                        color="red" 
                        leftSection={<IconTrash size={16} />}
                        onClick={async () => {
                            if (confirm("Are you sure you want to delete this user?")) {
                                await onDelete();
                            }
                        }}
                    >
                        Delete
                    </Button>
                    <Group>
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => onSave(patch)}>Save Changes</Button>
                    </Group>
                </Group>
            </Stack>
        </Drawer>
    );
}

function EditStageDrawer({
    opened,
    onClose,
    stageId,
    stageName,
    setStageName,
    stageDuration,
    setStageDuration,
    stageDetails,
    setStageDetails,
    onSave,
    onDelete,
}: {
    opened: boolean;
    onClose: () => void;
    stageId: number | null;
    stageName: string;
    setStageName: (name: string) => void;
    stageDuration: string;
    setStageDuration: (duration: string) => void;
    stageDetails: string;
    setStageDetails: (details: string) => void;
    onSave: () => void;
    onDelete: () => void;
}) {
    const isAdding = stageId === null;
    
    return (
        <Drawer opened={opened} onClose={onClose} title={isAdding ? "Add Launch Stage" : "Edit Launch Stage"} position="right" size="xl" padding="lg">
            <Stack gap="md">
                <TextInput
                    label="Stage Name"
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    required
                    placeholder="e.g., GTM Access"
                />
                <NumberInput
                    label="Duration (days)"
                    value={stageDuration ? parseInt(stageDuration) : undefined}
                    onChange={(value) => setStageDuration(value?.toString() || "")}
                    placeholder="Enter number of days"
                    allowDecimal={false}
                    min={0}
                />
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Details</label>
                    <RichText
                        value={stageDetails}
                        onChange={setStageDetails}
                        placeholder="Enter details..."
                        rows={10}
                    />
                </div>
                <Group justify="flex-end" mt="xl">
                    {!isAdding && (
                        <Button variant="outline" color="red" onClick={onDelete}>
                            Delete
                        </Button>
                    )}
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onSave}>
                        {isAdding ? "Add" : "Save"}
                    </Button>
                </Group>
            </Stack>
        </Drawer>
    );
}
