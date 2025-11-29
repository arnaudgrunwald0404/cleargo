import { readFileSync } from 'fs';
import { join } from 'path';
import type { AhaConfig, AhaEpic } from './types';

let cachedConfig: AhaConfig | null = null;

export function loadAhaConfig(): AhaConfig {
    if (cachedConfig) return cachedConfig;

    const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
    const configData = readFileSync(configPath, 'utf-8');
    cachedConfig = JSON.parse(configData);
    return cachedConfig!;
}

export function getCustomFieldKey(fieldAlias: string): string {
    const config = loadAhaConfig();
    const field = config.fields[fieldAlias];
    if (!field) {
        throw new Error(`Unknown custom field alias: ${fieldAlias}`);
    }
    if (!field.key) {
        throw new Error(`Custom field key not configured for: ${fieldAlias} (${field.label})`);
    }
    return field.key;
}

export function getCustomFieldValue(epic: AhaEpic, fieldAlias: string): any {
    const key = getCustomFieldKey(fieldAlias);
    
    // AHA API returns custom_fields as an array, not an object
    // Handle both array and object formats for compatibility
    if (Array.isArray(epic.custom_fields)) {
        const field = epic.custom_fields.find((f: any) => f?.key === key);
        return field?.value ?? null;
    } else if (epic.custom_fields && typeof epic.custom_fields === 'object') {
        // Fallback for object format (if AHA changes their API)
        return epic.custom_fields[key]?.value ?? null;
    }
    
    return null;
}

export function mapTierFromAha(ahaValue: string | null): string {
    if (!ahaValue) return 'TIER_3'; // Default

    const normalized = ahaValue.toLowerCase().trim();
    if (normalized.includes('tier 1') || normalized === 't1') return 'TIER_1';
    if (normalized.includes('tier 2') || normalized === 't2') return 'TIER_2';
    if (normalized.includes('tier 3') || normalized === 't3') return 'TIER_3';

    return 'TIER_3'; // Default fallback
}

export function mapTierToAha(dbValue: string): string {
    switch (dbValue) {
        case 'TIER_1': return 'Tier 1';
        case 'TIER_2': return 'Tier 2';
        case 'TIER_3': return 'Tier 3';
        default: return 'Tier 3';
    }
}

export interface MappedLaunchData {
    aha_id: string;
    aha_url: string;
    name: string;
    tier: string;
    target_launch_date: string | null;
    scheduled_ga_dev_date: string | null;
    owner_email: string | null;
    product_component: string | null;
    pod: string | null;
    business_priority: string | null;
    csm_priority: string | null;
    tags: string[];
    modified_rice_score: any | null;
    wsjf_score: any | null;
    gtm_link: string | null;
    activation_process: string | null;
    new_org_setup: string | null;
    existing_org_setup: string | null;
    pricing_model: string | null;
    aha_release_name: string | null;
    aha_fields?: Record<string, any>; // Dynamic AHA fields (standard and custom) from configured list
}

export async function mapEpicToLaunch(
    epic: AhaEpic,
    fieldsToLoad?: string[]
): Promise<MappedLaunchData> {
    // Standard fields from AHA epic
    const standardFields: Record<string, any> = {
        id: epic.id,
        reference_num: epic.reference_num || epic.id,
        name: epic.name,
        url: epic.url,
        workflow_status: epic.workflow_status?.name || null,
        assigned_to_user: epic.assigned_to_user ? {
            id: epic.assigned_to_user.id,
            name: epic.assigned_to_user.name,
            email: epic.assigned_to_user.email,
        } : null,
        tags: epic.tags || [],
        release: epic.release ? {
            id: epic.release.id,
            reference_num: epic.release.reference_num,
            name: epic.release.name,
        } : null,
    };

    // Extract dynamic custom fields if fieldsToLoad is provided
    const customFields: Record<string, any> = {};
    if (fieldsToLoad && Array.isArray(fieldsToLoad)) {
        for (const fieldAlias of fieldsToLoad) {
            try {
                const value = getCustomFieldValue(epic, fieldAlias);
                if (value !== null && value !== undefined) {
                    customFields[fieldAlias] = value;
                }
            } catch (error) {
                // Field alias not found in config, skip it
                console.warn(`Field alias "${fieldAlias}" not found in AHA config, skipping`);
            }
        }
    }

    // Store the extracted release name in standard fields for easy access
    const releaseName = extractReleaseName(epic);
    if (releaseName) {
        standardFields.aha_release_name = releaseName;
    }

    // Structure: { standard_fields: {...}, custom_fields: {...} }
    const ahaFields: Record<string, any> = {
        standard_fields: standardFields,
        custom_fields: customFields,
    };

    // Helper function to normalize release values (can be string, array, or date)
    const normalizeReleaseValue = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
            // If array, join with comma or take first element
            return value.length > 0 ? String(value[0]) : null;
        }
        // For dates or other types, convert to string
        return String(value);
    };

    return {
        aha_id: epic.reference_num || epic.id,
        aha_url: epic.url,
        name: epic.name,
        tier: mapTierFromAha(getCustomFieldValue(epic, 'launch_tier')),
        target_launch_date: normalizeReleaseValue(getCustomFieldValue(epic, 'estimated_ga_release_pm_owned')),
        scheduled_ga_dev_date: normalizeReleaseValue(getCustomFieldValue(epic, 'scheduled_ga_release_dev_only')),
        owner_email: epic.assigned_to_user?.email ?? null,
        product_component: getCustomFieldValue(epic, 'components'),
        pod: getCustomFieldValue(epic, 'dev_backlog_pod'),
        business_priority: getCustomFieldValue(epic, 'business_priority'),
        csm_priority: getCustomFieldValue(epic, 'csm_priority'),
        tags: epic.tags ?? [],
        modified_rice_score: getCustomFieldValue(epic, 'modified_rice'),
        wsjf_score: getCustomFieldValue(epic, 'wsjf'),
        gtm_link: getCustomFieldValue(epic, 'gtm_link'),
        activation_process: getCustomFieldValue(epic, 'activation_process'),
        new_org_setup: getCustomFieldValue(epic, 'new_org_setup'),
        existing_org_setup: getCustomFieldValue(epic, 'existing_org_setup'),
        pricing_model: getCustomFieldValue(epic, 'pricing_model'),
        aha_release_name: releaseName,
        aha_fields: ahaFields,
    };
}

function extractReleaseName(epic: AhaEpic): string | null {
    if (!epic.release?.name) return null;
    // Extract YYYY.MM from release name (e.g. "Release 2025.11" -> "2025.11")
    const match = epic.release.name.match(/(\d{4}\.\d{2})/);
    return match ? match[1] : null;
}

export function shouldProcessEpic(epic: AhaEpic): boolean {
    // Filter: (Launch Candidate == true) OR (tags contains "LaunchConsole")
    const isLaunchCandidate = getCustomFieldValue(epic, 'launch_candidate') === true;
    const hasLaunchTag = epic.tags?.includes('LaunchConsole') ?? false;

    return isLaunchCandidate || hasLaunchTag;
}

export function buildWriteBackPayload(data: {
    readiness_status: string | null;
    readiness_score: number | null;
    risk_level: string | null;
    last_go_no_go_decision_date: string | null;
    console_url: string | null;
    tier?: string | null;
    target_launch_date?: string | null;
}): Record<string, any> {
    const payload: Record<string, any> = {};

    // Readiness fields
    if (data.readiness_status !== null) {
        payload[getCustomFieldKey('launch_readiness_status')] = data.readiness_status;
    }

    if (data.readiness_score !== null) {
        const scorePercent = Math.round(data.readiness_score * 100);
        payload[getCustomFieldKey('launch_readiness_score_pct')] = scorePercent;
    }

    if (data.risk_level !== null) {
        payload[getCustomFieldKey('launch_risk')] = data.risk_level;
    }

    if (data.last_go_no_go_decision_date !== null) {
        payload[getCustomFieldKey('launch_go_no_go_decision_date')] = data.last_go_no_go_decision_date;
    }

    if (data.console_url !== null) {
        payload[getCustomFieldKey('launch_console_url')] = data.console_url;
    }

    // Phase 1: Core launch fields
    if (data.tier !== undefined && data.tier !== null) {
        payload[getCustomFieldKey('launch_tier')] = mapTierToAha(data.tier);
    }

    if (data.target_launch_date !== undefined && data.target_launch_date !== null) {
        payload[getCustomFieldKey('estimated_ga_release_pm_owned')] = data.target_launch_date;
    }

    return payload;
}
