"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { AppSettings } from "@/lib/settings-db";
import { getPermissions, getUsers, getPods, getReleases, getSettings, patchSettings, getAhaFields, refreshAhaFieldsFromAha, syncAhaFields, patchEmailTemplates, getReleaseStages, getLaunchCriteria, getLaunchSchedule } from "@/lib/services/settingsService";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";

interface SettingsContextType {
    // Settings
    settings: AppSettings | null;
    loading: boolean;
    saving: boolean;
    error: string | null;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings | null>>;
    autoSaveSettings: (updatedSettings: AppSettings) => Promise<void>;
    
    // Users
    users: any[];
    usersLoading: boolean;
    fetchUsers: () => Promise<void>;
    
    // Pods
    pods: string[];
    podsLoading: boolean;
    fetchPods: () => Promise<void>;
    
    // Permissions
    permissionsLoading: boolean;
    permissionsSaving: boolean;
    rolesList: string[];
    capabilities: Array<{ id: string; label: string; description: string }>;
    rules: Record<string, string[]>;
    defaultRules: Record<string, string[]>;
    setRules: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
    autoSavePermissions: (mapping: Record<string, string[]>) => Promise<void>;
    
    // Releases
    releases: any[];
    releasesLoading: boolean;
    launchReleases: Array<{ releaseName: string; launchDate: string | null }>;
    launchReleasesLoading: boolean;
    fetchReleases: (includeArchived?: boolean) => Promise<void>;
    fetchLaunchReleaseDates: () => Promise<void>;
    
    // AHA Fields
    availableAhaFields: Array<{ alias: string; label: string; key: string | null; type?: string }>;
    ahaFieldsLoading: boolean;
    ahaFieldsRefreshing: boolean;
    ahaFieldsSaving: boolean;
    syncing: boolean;
    syncResult: { success: boolean; message: string; synced: number; failed: number; total: number; errors?: Array<{ aha_id: string; name: string; error: string }> } | null;
    fetchAhaFields: () => Promise<void>;
    refreshAhaFieldsList: () => Promise<void>;
    autoSaveAhaFields: (fieldsToLoad: string[]) => Promise<void>;
    handleSynchronizeFields: () => Promise<void>;
    
    // Release Stages (Release Schedule scope)
    releaseStages: Array<{ id: number; name: string; sort_order: number; duration_days: number | null; details: string | null; scope?: string; level_durations?: unknown; is_gate?: boolean; stage_type?: 'phase' | 'milestone' }>;
    releaseStagesLoading: boolean;
    setReleaseStages: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string; sort_order: number; duration_days: number | null; details: string | null; scope?: string; level_durations?: unknown; is_gate?: boolean; stage_type?: 'phase' | 'milestone' }>>>;
    fetchReleaseStages: () => Promise<void>;
    // UI Rollout Stages
    uiRolloutStages: Array<{ id: number; name: string; sort_order: number; duration_days: number | null; details: string | null; scope?: string; level_durations?: unknown; is_gate?: boolean; stage_type?: 'phase' | 'milestone' }>;
    uiRolloutStagesLoading: boolean;
    setUiRolloutStages: React.Dispatch<React.SetStateAction<Array<{ id: number; name: string; sort_order: number; duration_days: number | null; details: string | null; scope?: string; level_durations?: unknown; is_gate?: boolean; stage_type?: 'phase' | 'milestone' }>>>;
    fetchUiRolloutStages: () => Promise<void>;
    
    // Email Templates
    emailTemplates: {
        invite_subject: string;
        invite_html: string;
        remind_subject: string;
        remind_html: string;
        update_criteria_subject: string;
        update_criteria_html: string;
    };
    emailTemplatesLoading: boolean;
    emailTemplatesSaving: boolean;
    emailTemplatesInitialized: boolean;
    setEmailTemplates: React.Dispatch<React.SetStateAction<{
        invite_subject: string;
        invite_html: string;
        remind_subject: string;
        remind_html: string;
        update_criteria_subject: string;
        update_criteria_html: string;
    }>>;
    fetchEmailTemplates: () => Promise<void>;
    
    // Launch Criteria
    launchCriteria: any[];
    launchCriteriaLoading: boolean;
    fetchLaunchCriteria: () => Promise<void>;

    // Launch Schedule
    launchSchedule: any[];
    launchScheduleLoading: boolean;
    fetchLaunchSchedule: (includeArchived?: boolean) => Promise<void>;

    // Current User
    currentUserRoles: string[];
    isSuperAdmin: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [users, setUsers] = useState<any[]>([]);
    const [usersLoading, setUsersLoading] = useState(false);
    
    const [pods, setPods] = useState<string[]>([]);
    const [podsLoading, setPodsLoading] = useState(false);
    
    const [permissionsLoading, setPermissionsLoading] = useState(false);
    const [permissionsSaving, setPermissionsSaving] = useState(false);
    const [rolesList, setRolesList] = useState<string[]>([]);
    const [capabilities, setCapabilities] = useState<Array<{ id: string; label: string; description: string }>>([]);
    const [rules, setRules] = useState<Record<string, string[]>>({});
    const [defaultRules, setDefaultRules] = useState<Record<string, string[]>>({});
    
    const [releases, setReleases] = useState<any[]>([]);
    const [releasesLoading, setReleasesLoading] = useState(false);
    const [launchReleases, setLaunchReleases] = useState<Array<{ releaseName: string; launchDate: string | null }>>([]);
    const [launchReleasesLoading, setLaunchReleasesLoading] = useState(false);
    
    const [availableAhaFields, setAvailableAhaFields] = useState<Array<{ alias: string; label: string; key: string | null; type?: string }>>([]);
    const [ahaFieldsLoading, setAhaFieldsLoading] = useState(false);
    const [ahaFieldsRefreshing, setAhaFieldsRefreshing] = useState(false);
    const [ahaFieldsSaving, setAhaFieldsSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ success: boolean; message: string; synced: number; failed: number; total: number; errors?: Array<{ aha_id: string; name: string; error: string }> } | null>(null);
    
    const [releaseStages, setReleaseStages] = useState<Array<{ id: number; name: string; sort_order: number; duration_days: number | null; details: string | null; scope?: string; level_durations?: unknown; is_gate?: boolean; stage_type?: 'phase' | 'milestone' }>>([]);
    const [releaseStagesLoading, setReleaseStagesLoading] = useState(false);
    const [uiRolloutStages, setUiRolloutStages] = useState<Array<{ id: number; name: string; sort_order: number; duration_days: number | null; details: string | null; scope?: string; level_durations?: unknown; is_gate?: boolean; stage_type?: 'phase' | 'milestone' }>>([]);
    const [uiRolloutStagesLoading, setUiRolloutStagesLoading] = useState(false);

    const [launchCriteria, setLaunchCriteria] = useState<any[]>([]);
    const [launchCriteriaLoading, setLaunchCriteriaLoading] = useState(false);

    const [launchSchedule, setLaunchSchedule] = useState<any[]>([]);
    const [launchScheduleLoading, setLaunchScheduleLoading] = useState(false);

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
    const [emailTemplatesInitialized, setEmailTemplatesInitialized] = useState(false);
    
    const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    
    const fetchCurrentUser = async () => {
        try {
            const res = await fetchWithRateLimit("/api/me", {
                maxRetries: 1,
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentUserRoles(data.user?.roles || []);
                setIsSuperAdmin(!!data.isSuperAdmin);
            }
        } catch (error) {
            console.error("Failed to fetch current user:", error);
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
    
    const autoSaveSettings = useCallback(async (updatedSettings: AppSettings) => {
        setSaving(true);
        try {
            const saved = await patchSettings(updatedSettings);
            setSettings(saved);
            return saved; // Return saved settings so callers can use them
        } catch (error: any) {
            console.error("Failed to auto-save settings:", error);
            setError("Failed to save changes. Please refresh and try again.");
            throw error; // Re-throw so callers can handle errors
        } finally {
            setSaving(false);
        }
    }, []);
    
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
    
    const fetchPermissions = async () => {
        setPermissionsLoading(true);
        try {
            const data = await getPermissions();
            setRolesList(data.roles || []);
            setCapabilities(data.capabilities || []);
            setDefaultRules(data.rules || {});
            setRules({ ...(data.rules || {}), ...(data.overrides || {}) });
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
    
    const fetchReleases = async (includeArchived: boolean = true) => {
        setReleasesLoading(true);
        try {
            const data = await getReleases(includeArchived);
            setReleases(data || []);
        } catch (error: any) {
            console.error("Failed to fetch releases:", error);
        } finally {
            setReleasesLoading(false);
        }
    };
    
    const fetchLaunchReleaseDates = async () => {
        setLaunchReleasesLoading(true);
        try {
            const res = await fetchWithRateLimit("/api/epics/release-dates", {
                maxRetries: 2,
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}: ${res.statusText}` }));
                throw new Error(errorData.error || `Failed to fetch epic releases: ${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            setLaunchReleases(data.releases || []);
        } catch (error: any) {
            console.error("Failed to fetch epic releases:", error);
        } finally {
            setLaunchReleasesLoading(false);
        }
    };
    
    const fetchAhaFields = async () => {
        setAhaFieldsLoading(true);
        try {
            const data = await getAhaFields();
            setAvailableAhaFields(data.fields || []);
        } catch (error: any) {
            console.error("Failed to fetch AHA fields:", error);
        } finally {
            setAhaFieldsLoading(false);
        }
    };

    const refreshAhaFieldsList = async () => {
        setAhaFieldsRefreshing(true);
        try {
            const data = await refreshAhaFieldsFromAha();
            setAvailableAhaFields(data.fields || []);
        } catch (error: any) {
            console.error("Failed to refresh AHA field list:", error);
            setError(error.message || "Failed to refresh field list from Aha.");
        } finally {
            setAhaFieldsRefreshing(false);
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
    
    const fetchReleaseStages = async () => {
        setReleaseStagesLoading(true);
        try {
            const data = await getReleaseStages('release_schedule');
            setReleaseStages(data.stages || []);
        } catch (error: any) {
            console.error("Failed to fetch release stages:", error);
        } finally {
            setReleaseStagesLoading(false);
        }
    };

    const fetchUiRolloutStages = async () => {
        setUiRolloutStagesLoading(true);
        try {
            const data = await getReleaseStages('ui_rollout');
            setUiRolloutStages(data.stages || []);
        } catch (error: any) {
            console.error("Failed to fetch UI rollout stages:", error);
        } finally {
            setUiRolloutStagesLoading(false);
        }
    };
    
    const fetchLaunchCriteria = async () => {
        setLaunchCriteriaLoading(true);
        try {
            const data = await getLaunchCriteria();
            setLaunchCriteria(data.criteria || []);
        } catch (error: any) {
            console.error("Failed to fetch launch criteria:", error);
        } finally {
            setLaunchCriteriaLoading(false);
        }
    };

    const fetchLaunchSchedule = async (includeArchived: boolean = false) => {
        setLaunchScheduleLoading(true);
        try {
            const data = await getLaunchSchedule(includeArchived);
            setLaunchSchedule(data.schedules || []);
        } catch (error: any) {
            console.error("Failed to fetch launch schedule:", error);
        } finally {
            setLaunchScheduleLoading(false);
        }
    };

    const fetchEmailTemplates = async () => {
        setEmailTemplatesLoading(true);
        try {
            const res = await fetchWithRateLimit("/api/settings/email-templates", {
                maxRetries: 1,
            });
            if (!res.ok) throw new Error("Failed to fetch email templates");
            const data = await res.json();
            const { DEFAULT_EMAIL_TEMPLATES } = await import("@/lib/constants/settings");
            setEmailTemplates({
                invite_subject: data.invite_subject || DEFAULT_EMAIL_TEMPLATES.invite_subject,
                invite_html: data.invite_html || DEFAULT_EMAIL_TEMPLATES.invite_html,
                remind_subject: data.remind_subject || DEFAULT_EMAIL_TEMPLATES.remind_subject,
                remind_html: data.remind_html || DEFAULT_EMAIL_TEMPLATES.remind_html,
                update_criteria_subject: data.update_criteria_subject || DEFAULT_EMAIL_TEMPLATES.update_criteria_subject,
                update_criteria_html: data.update_criteria_html || DEFAULT_EMAIL_TEMPLATES.update_criteria_html,
            });
            setEmailTemplatesInitialized(true);
        } catch (error: any) {
            console.error("Failed to fetch email templates:", error);
        } finally {
            setEmailTemplatesLoading(false);
        }
    };
    
    useEffect(() => {
        fetchSettings();
        fetchCurrentUser();
        
        setTimeout(async () => {
            await fetchUsers();
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchPermissions();
        }, 500);
        
        setTimeout(async () => {
            await fetchReleases();
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchLaunchReleaseDates();
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchReleaseStages();
            await fetchUiRolloutStages();
        }, 1500);
        
        setTimeout(async () => {
            await fetchPods();
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchAhaFields();
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchEmailTemplates();
        }, 3000);

        setTimeout(async () => {
            await fetchLaunchCriteria();
            await new Promise(resolve => setTimeout(resolve, 300));
            await fetchLaunchSchedule();
        }, 4500);
    }, []);
    
    // Auto-save email templates with debouncing
    useEffect(() => {
        if (emailTemplatesLoading || !emailTemplatesInitialized) return;
        
        const timer = setTimeout(async () => {
            setEmailTemplatesSaving(true);
            try {
                await patchEmailTemplates({
                    email_template_invite_subject: emailTemplates.invite_subject?.trim() || null,
                    email_template_invite_html: emailTemplates.invite_html?.trim() || null,
                    email_template_remind_subject: emailTemplates.remind_subject?.trim() || null,
                    email_template_remind_html: emailTemplates.remind_html?.trim() || null,
                    email_template_update_criteria_subject: emailTemplates.update_criteria_subject?.trim() || null,
                    email_template_update_criteria_html: emailTemplates.update_criteria_html?.trim() || null,
                });
            } catch (error: any) {
                console.error("Failed to auto-save email templates:", error);
                setError("Failed to save email templates. Please try again.");
            } finally {
                setEmailTemplatesSaving(false);
            }
        }, 2000);
        
        return () => clearTimeout(timer);
    }, [emailTemplates.invite_subject, emailTemplates.invite_html, emailTemplates.remind_subject, emailTemplates.remind_html, emailTemplates.update_criteria_subject, emailTemplates.update_criteria_html, emailTemplatesLoading, emailTemplatesInitialized]);
    
    return (
        <SettingsContext.Provider
            value={{
                settings,
                loading,
                saving,
                error,
                setSettings,
                autoSaveSettings,
                users,
                usersLoading,
                fetchUsers,
                pods,
                podsLoading,
                fetchPods,
                permissionsLoading,
                permissionsSaving,
                rolesList,
                capabilities,
                rules,
                defaultRules,
                setRules,
                autoSavePermissions,
                releases,
                releasesLoading,
                launchReleases,
                launchReleasesLoading,
                fetchReleases,
                fetchLaunchReleaseDates,
                availableAhaFields,
                ahaFieldsLoading,
                ahaFieldsRefreshing,
                ahaFieldsSaving,
                syncing,
                syncResult,
                fetchAhaFields,
                refreshAhaFieldsList,
                autoSaveAhaFields,
                handleSynchronizeFields,
                releaseStages,
                releaseStagesLoading,
                setReleaseStages,
                fetchReleaseStages,
                uiRolloutStages,
                uiRolloutStagesLoading,
                setUiRolloutStages,
                fetchUiRolloutStages,
                launchCriteria,
                launchCriteriaLoading,
                fetchLaunchCriteria,
                launchSchedule,
                launchScheduleLoading,
                fetchLaunchSchedule,
                emailTemplates,
                emailTemplatesLoading,
                emailTemplatesSaving,
                emailTemplatesInitialized,
                setEmailTemplates,
                fetchEmailTemplates,
                currentUserRoles,
                isSuperAdmin,
            }}
        >
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error("useSettings must be used within a SettingsProvider");
    }
    return context;
}
