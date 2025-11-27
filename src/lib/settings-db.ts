import { createClient } from "@/lib/supabase/server";
import { defaults, TierThresholds } from "./settings";

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
    updated_at: string;
}

export async function getSettings(): Promise<AppSettings> {
    const supabase = await createClient();

    // Try to get the single row (id=1)
    const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .eq("id", 1)
        .single();

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
            updated_at: new Date().toISOString(),
        };
    }

    return data as AppSettings;
}

export async function updateSettings(
    updates: Partial<Omit<AppSettings, "id" | "updated_at">>
): Promise<AppSettings> {
    const supabase = await createClient();

    // Upsert with id=1
    const { data, error } = await supabase
        .from("app_settings")
        .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to update settings: ${error.message}`);
    }

    return data as AppSettings;
}
