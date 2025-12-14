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
    email_sender: string;
    pod_product_manager_mapping?: Record<string, string>; // pod_name -> email
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
}

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
                'release_target_after_pod_planning'
            ],
            updated_at: new Date().toISOString(),
            permissions: {},
            aha_tags: ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo'],
            enable_activity_feed: true,
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
            'release_target_after_pod_planning'
        ];
    }

    // Ensure aha_tags has a default value if missing
    if (!data.aha_tags || (Array.isArray(data.aha_tags) && data.aha_tags.length === 0)) {
        data.aha_tags = ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo'];
    }

    return data as AppSettings;
}

export async function updateSettings(
    updates: Partial<Omit<AppSettings, "id" | "updated_at">>
): Promise<AppSettings> {
    const supabase = await createClient();
    debugLog({ location: 'settings-db.ts:updateSettings-START', message: 'updateSettings called', data: { updateKeys: Object.keys(updates), ahaFieldsInUpdate: updates.aha_fields_to_load, hasDuplicatesInUpdate: updates.aha_fields_to_load ? new Set(updates.aha_fields_to_load).size !== updates.aha_fields_to_load.length : false }, hypothesisId: 'A' });

    // First, get current settings to ensure we have all required fields
    const currentSettings = await getSettings();

    // Merge updates with current settings, ensuring all required fields are present
    const mergedData = {
        ...currentSettings,
        ...updates,
        updated_at: new Date().toISOString()
    };

    // Remove id and updated_at from the object before update (id is used in .eq(), updated_at is set explicitly)
    const { id, updated_at, ...updateData } = mergedData;
    debugLog({ location: 'settings-db.ts:updateSettings-MERGED', message: 'After merge with currentSettings', data: { mergedAhaFields: updateData.aha_fields_to_load, hasDuplicatesAfterMerge: updateData.aha_fields_to_load ? new Set(updateData.aha_fields_to_load).size !== updateData.aha_fields_to_load.length : false }, hypothesisId: 'A' });

    // Use update instead of upsert to avoid issues with required fields
    const { data, error } = await supabase
        .from("app_settings")
        .update({ ...updateData, updated_at: new Date().toISOString() })
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
        throw new Error(`Failed to update settings: ${error.message}`);
    }

    if (!data) {
        // If no row exists, insert it
        const { data: inserted, error: insertError } = await supabase
            .from("app_settings")
            .insert({ id: 1, ...updateData, updated_at: new Date().toISOString() })
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

    return data as AppSettings;
}
