"use server";

import { createClient } from "@/lib/supabase/server";
import { defaults } from "./settings";
import { debugLog } from "./debug";

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
    slack_theme?: import('./slack/theme').SlackThemeConfig; // Slack notification theme customization
    jira_domain?: string | null; // Jira domain (e.g., "clearco.atlassian.net")
    jira_api_token?: string | null; // Jira API token for authentication
    jira_email?: string | null; // Jira email associated with the API token (required for Basic Auth)
    jira_cloud_id?: string | null; // Jira Cloud ID (required for API calls, fetched automatically)
  // Mapping of Pendo appId -> human-friendly application name
  pendo_app_names?: Record<string, string>;
}

const DEFAULT_PENDO_APP_NAMES: Record<string, string> = {
    "-323232": "ClearCompany",
    "6212546329378816": "ClearCompany Learning",
};

export async function getSettings(): Promise<AppSettings> {
    const supabase = await createClient();

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
                'primary_goal',
                'modernization_effort',
                'csm_priority',
                'analytics_enablement',
                't_shirt_est',
                'progress',
                'reason_for_release_change',
                'release_target_after_pod_planning',
                'ux_needs',
                'cleargo_candidate'
            ],
            updated_at: new Date().toISOString(),
            permissions: {},
            aha_tags: ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo'],
            enable_activity_feed: true,
            pendo_app_names: { ...DEFAULT_PENDO_APP_NAMES },
        };
    }

    // Ensure aha_fields_to_load has a default value if missing
    if (!data.aha_fields_to_load || (Array.isArray(data.aha_fields_to_load) && data.aha_fields_to_load.length === 0)) {
        data.aha_fields_to_load = [
            'dev_backlog_pod',
            'primary_goal',
            'modernization_effort',
            'csm_priority',
            'analytics_enablement',
            't_shirt_est',
            'progress',
            'reason_for_release_change',
            'release_target_after_pod_planning',
            'ux_needs',
            'cleargo_candidate'
        ];
    }

    // Ensure aha_tags has a default value if missing
    if (!data.aha_tags || (Array.isArray(data.aha_tags) && data.aha_tags.length === 0)) {
        data.aha_tags = ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo'];
    }

    // Ensure Pendo app names mapping has sensible defaults if missing
    if (!data.pendo_app_names || Object.keys(data.pendo_app_names).length === 0) {
        data.pendo_app_names = { ...DEFAULT_PENDO_APP_NAMES };
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

        return inserted as AppSettings;
    }

    return currentSettings as AppSettings;
}
