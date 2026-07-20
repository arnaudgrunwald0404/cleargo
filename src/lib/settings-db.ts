"use server";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaults } from "./settings";
import { debugLog } from "./debug";
import { DEFAULT_RULES } from "./permissions";
import type { CapabilityId } from "./permissions";

export interface AppSettings {
    id: number;
    threshold_tier1: number;
    threshold_tier2: number;
    threshold_tier3: number;
    staleness_days: number;
    digest_schedule: string;
    timezone: string;
    allowlisted_domains: string[];
    fallback_user_email: string;
    aha_webhook_secret: string | null;
    aha_webhook_url?: string | null; // Custom webhook URL, if null uses computed URL
    aha_webhook_environment?: 'development' | 'production' | null; // Environment mode for webhook URL
    email_sender: string;
    pod_product_manager_mapping?: Record<string, string>; // pod_name -> email
    pod_order?: string[]; // Ordered list of pod names for consistent display
    aha_fields_to_load?: string[]; // List of AHA custom field aliases to load
    email_template_invite_subject?: string | null;
    email_template_invite_html?: string | null;
    email_template_remind_subject?: string | null;
    email_template_remind_html?: string | null;
    email_template_update_criteria_subject?: string | null;
    email_template_update_criteria_html?: string | null;
    check_in_keywords?: string[]; // Keywords to identify check-in meetings
    updated_at: string;
    // Capability-based permissions: capability id -> array of roles allowed
    permissions?: Record<string, string[]>;
    aha_tags?: string[]; // Tags that trigger inclusion in Launch Console
    enable_activity_feed?: boolean; // Whether to show activity feed on home page
    slack_nudge_1_week_before?: boolean;
    slack_nudge_on_due_date?: boolean;
    slack_nudge_daily_after_due?: boolean;
    slack_notification_test_email?: string; // For email notifications
    slack_notification_test_slack_handle?: string; // For Slack notifications (Slack user ID, e.g., U12345678)
    email_nudge_1_week_before?: boolean;
    email_nudge_on_due_date?: boolean;
    email_nudge_daily_after_due?: boolean;
    slack_notifications_enabled?: boolean; // System flag: Enable/disable all Slack notifications
    email_notifications_enabled?: boolean; // System flag: Enable/disable all email notifications
    // Slack notification type flags
    slack_criteria_assignment?: boolean;
    slack_criteria_nudge?: boolean;
    slack_retro_reminder?: boolean;
    slack_success_review_reminder?: boolean;
    slack_stale_criterion?: boolean;
    slack_launch_risk_alert?: boolean;
    slack_go_no_go_decision?: boolean;
    slack_weekly_digest?: boolean;
    slack_launch_status_change?: boolean;
    slack_criterion_update?: boolean;
    slack_launch_created?: boolean;
    slack_delegation?: boolean;
    slack_scorecard_alert?: boolean;
    slack_escalation_alert?: boolean;
    slack_criterion_comment_or_attachment?: boolean;
    slack_gtm_access_nudge?: boolean;
    // Email notification type flags
    email_criteria_assignment?: boolean;
    email_criteria_nudge?: boolean;
    email_retro_reminder?: boolean;
    email_success_review_reminder?: boolean;
    email_stale_criterion?: boolean;
    email_launch_risk_alert?: boolean;
    email_go_no_go_decision?: boolean;
    email_weekly_digest?: boolean;
    email_launch_status_change?: boolean;
    email_criterion_update?: boolean;
    email_launch_created?: boolean;
    email_delegation?: boolean;
    email_scorecard_alert?: boolean;
    email_escalation_alert?: boolean;
    email_criterion_comment_or_attachment?: boolean;
    email_gtm_access_nudge?: boolean;
    slack_theme?: import('./slack/theme').SlackThemeConfig; // Slack notification theme customization
    jira_domain?: string | null; // Jira domain (e.g., "clearco.atlassian.net")
    jira_api_token?: string | null; // Jira API token for authentication
    jira_email?: string | null; // Jira email associated with the API token (required for Basic Auth)
    jira_cloud_id?: string | null; // Jira Cloud ID (required for API calls, fetched automatically)
    rovo_access_token?: string | null; // ROVO MCP Server OAuth access token
    rovo_refresh_token?: string | null; // ROVO MCP Server OAuth refresh token
    rovo_token_expires_at?: string | null; // ROVO access token expiration timestamp
    rovo_redirect_url?: string | null; // Custom OAuth redirect URL for ROVO integration. If null, uses default computed URL.
  // Mapping of Pendo appId -> human-friendly application name
  pendo_app_names?: Record<string, string>;
  /** Optional URL to Pendo dashboard for HEART metrics drill-down */
  pendo_dashboard_url?: string | null;
  /** Enabled feature flag keys (e.g. ai_pruning, meetings, not_applicable). Used in Settings > Other Settings. */
  feature_flags?: string[];
  /** Emails pinged when a criterion's first comment has no @mention (I-5). The epic PM is added automatically. */
  orphan_comment_watcher_emails?: string[];
  /** Final Go/No-Go approver emails, notified once every department gate on an epic is signed off (I-9). */
  master_approver_emails?: string[];
}

const DEFAULT_PENDO_APP_NAMES: Record<string, string> = {
    "-323232": "ClearCompany",
    "6212546329378816": "ClearCompany Learning",
};

/** Effective permission rules: DEFAULT_RULES merged with DB overrides (DB wins). Use for server-side permission checks. */
export async function getEffectivePermissionRules(): Promise<Record<CapabilityId, string[]>> {
    const settings = await getSettings();
    const overrides = settings.permissions || {};
    return { ...DEFAULT_RULES, ...overrides } as Record<CapabilityId, string[]>;
}

export async function getSettings(client?: SupabaseClient): Promise<AppSettings> {
    const supabase = client ?? await createClient();

    // Try to get the single row (id=1)
    const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .single();

    debugLog({ location: 'settings-db.ts:getSettings', message: 'Fetched settings from DB', data: { hasData: !!data, ahaFieldsFromDB: data?.aha_fields_to_load, hasDuplicates: data?.aha_fields_to_load ? new Set(data.aha_fields_to_load).size !== data.aha_fields_to_load.length : false }, hypothesisId: 'C' });

    if (error || !data) {
        // If not found, return defaults (mapped to DB structure)
        // In a real scenario, we might want to insert the row if it's missing,
        // but for now we'll just return the default values.
        return {
            id: 1,
            threshold_tier1: defaults.thresholds.tier1,
            threshold_tier2: defaults.thresholds.tier2,
            threshold_tier3: defaults.thresholds.tier3,
            staleness_days: defaults.stalenessDays,
            digest_schedule: defaults.digestSchedule,
            timezone: defaults.timezone,
            allowlisted_domains: defaults.allowlistDomains,
            fallback_user_email: defaults.fallbackProductOpsEmail,
            aha_webhook_secret: process.env.AHA_WEBHOOK_SECRET || null,
            aha_webhook_url: "https://indiscerptible-gail-metalline.ngrok-free.dev/api/integrations/aha/webhook",
            email_sender: defaults.emailSender,
            aha_fields_to_load: [
                'dev_backlog_pod',
                'gtm_module',
                'gtm_name',
                'primary_goal',
                'modernization_effort',
                'csm_priority',
                'analytics_enablement',
                't_shirt_est',
                'progress',
                'reason_for_release_change',
                'release_target_after_pod_planning',
                'ux_needs',
                'cleargo_candidate',
                'uiux_impact'
            ],
            updated_at: new Date().toISOString(),
            permissions: {},
            aha_tags: [],
            enable_activity_feed: true,
            pendo_app_names: { ...DEFAULT_PENDO_APP_NAMES },
            feature_flags: [],
        };
    }

    // Ensure aha_fields_to_load has a default value if missing
    if (!data.aha_fields_to_load || (Array.isArray(data.aha_fields_to_load) && data.aha_fields_to_load.length === 0)) {
        data.aha_fields_to_load = [
            'dev_backlog_pod',
            'gtm_module',
            'gtm_name',
            'primary_goal',
            'modernization_effort',
            'csm_priority',
            'analytics_enablement',
            't_shirt_est',
            'progress',
            'reason_for_release_change',
            'release_target_after_pod_planning',
            'ux_needs',
            'cleargo_candidate',
            'uiux_impact'
        ];
    }

    // Ensure aha_tags exists (empty: inclusion is ClearGO Candidate = Yes only)
    if (!Array.isArray(data.aha_tags)) {
        data.aha_tags = [];
    }

    // Ensure Pendo app names mapping has sensible defaults if missing
    if (!data.pendo_app_names || Object.keys(data.pendo_app_names).length === 0) {
        data.pendo_app_names = { ...DEFAULT_PENDO_APP_NAMES };
    }

    if (!Array.isArray(data.feature_flags)) {
        data.feature_flags = [];
    }

    return data as AppSettings;
}

export async function updateSettings(
    updates: Partial<Omit<AppSettings, "id" | "updated_at">>
): Promise<AppSettings> {
    const supabase = await createClient();
    debugLog({ location: 'settings-db.ts:updateSettings-START', message: 'updateSettings called', data: { updateKeys: Object.keys(updates), ahaFieldsInUpdate: updates.aha_fields_to_load, hasDuplicatesInUpdate: updates.aha_fields_to_load ? new Set(updates.aha_fields_to_load).size !== updates.aha_fields_to_load.length : false }, hypothesisId: 'A' });

    // Handle webhook URL separately if it's being updated (to bypass schema cache issues)
    const { aha_webhook_url, ...otherUpdates } = updates;
    let webhookUrlUpdatedViaRpc = false;

    // If updating webhook URL, try RPC function first to bypass schema cache
    if (aha_webhook_url !== undefined) {
        try {
            const { error: rpcError } = await supabase.rpc('update_webhook_url', {
                new_url: aha_webhook_url
            });
            
            if (!rpcError) {
                webhookUrlUpdatedViaRpc = true;
                console.log("Successfully updated webhook URL via RPC");
            } else {
                console.warn("RPC error updating webhook URL, will try regular update:", rpcError);
            }
        } catch (err) {
            console.warn("RPC function not available, will try regular update:", err);
        }
    }

    // Prepare update data - exclude webhook URL if it was updated via RPC
    const updateData: any = {
        ...otherUpdates,
        updated_at: new Date().toISOString()
    };
    
    // Log pendo_app_names specifically for debugging
    if ('pendo_app_names' in updateData) {
        console.log('[settings-db] Updating pendo_app_names:', JSON.stringify(updateData.pendo_app_names));
    }
    
    // Only include webhook URL in regular update if RPC didn't work
    if (aha_webhook_url !== undefined && !webhookUrlUpdatedViaRpc) {
        updateData.aha_webhook_url = aha_webhook_url;
    }

    // Only update other fields if there are any (excluding updated_at)
    const fieldsToUpdate = Object.keys(updateData).filter(k => k !== 'updated_at');
    if (fieldsToUpdate.length > 0) {
        debugLog({ location: 'settings-db.ts:updateSettings-MERGED', message: 'After merge with currentSettings', data: { mergedAhaFields: updateData.aha_fields_to_load, hasDuplicatesAfterMerge: updateData.aha_fields_to_load ? new Set(updateData.aha_fields_to_load).size !== updateData.aha_fields_to_load.length : false }, hypothesisId: 'A' });

        // Use update instead of upsert to avoid issues with required fields
        const { data, error } = await supabase
            .from("app_settings")
            .update(updateData)
            .eq("id", 1)
            .select()
            .single();
        debugLog({ location: 'settings-db.ts:updateSettings-RESPONSE', message: 'DB update response', data: { hasData: !!data, hasError: !!error, errorCode: error?.code, errorMessage: error?.message, errorDetails: error?.details }, hypothesisId: 'E' });

        if (error) {
            console.error("Supabase error updating settings:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            
            // If schema cache error and webhook URL was updated via RPC, continue
            if (error.message?.includes('schema cache') && webhookUrlUpdatedViaRpc) {
                console.warn("Schema cache error for other fields, but webhook URL was updated via RPC");
                // Continue to fetch updated settings
            } else if (error.message?.includes('schema cache')) {
                throw new Error(`Schema cache error: The database column may exist but PostgREST hasn't refreshed its cache. Please wait a few minutes or contact your Supabase admin to refresh the schema cache. Original error: ${error.message}`);
            } else {
                throw new Error(`Failed to update settings: ${error.message}`);
            }
        }

        if (data) {
            // Ensure pendo_app_names has defaults if missing
            if (!data.pendo_app_names || Object.keys(data.pendo_app_names).length === 0) {
                data.pendo_app_names = { ...DEFAULT_PENDO_APP_NAMES };
            }
            console.log('[settings-db] updateSettings returning data with pendo_app_names:', data.pendo_app_names);
            return data as AppSettings;
        }
    }

    // Fetch updated settings to return
    const { data: currentSettings, error: fetchError } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .single();

    if (fetchError) {
        console.error("Error fetching updated settings:", fetchError);
        throw new Error(`Failed to fetch updated settings: ${fetchError.message}`);
    }

    if (!currentSettings) {
        // If no row exists, insert it
        const insertData: any = {
            id: 1,
            ...updates,
            updated_at: new Date().toISOString()
        };
        const { data: inserted, error: insertError } = await supabase
            .from("app_settings")
            .insert(insertData)
            .select()
            .single();

        if (insertError) {
            console.error("Supabase error inserting settings:", {
                message: insertError.message,
                code: insertError.code,
                details: insertError.details,
                hint: insertError.hint
            });
            throw new Error(`Failed to insert settings: ${insertError.message}`);
        }

        // Ensure pendo_app_names has defaults if missing
        if (!inserted.pendo_app_names || Object.keys(inserted.pendo_app_names).length === 0) {
            inserted.pendo_app_names = { ...DEFAULT_PENDO_APP_NAMES };
        }
        return inserted as AppSettings;
    }

    // Ensure pendo_app_names has defaults if missing
    if (!currentSettings.pendo_app_names || Object.keys(currentSettings.pendo_app_names).length === 0) {
        currentSettings.pendo_app_names = { ...DEFAULT_PENDO_APP_NAMES };
    }
    console.log('[settings-db] updateSettings returning currentSettings with pendo_app_names:', currentSettings.pendo_app_names);
    return currentSettings as AppSettings;
}

export async function getFeatureFlags(): Promise<string[]> {
    const s = await getSettings();
    return Array.isArray(s.feature_flags) ? s.feature_flags : [];
}
