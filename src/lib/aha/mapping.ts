import { readFileSync } from 'fs';
import { join } from 'path';
import type { AhaConfig, AhaEpic } from './types';
import { getCustomFields } from './client';
import { getSettings } from '@/lib/settings-db';

let cachedConfig: AhaConfig | null = null;

// Cache for custom field definitions (field key -> options map)
let fieldDefinitionsCache: Map<string, Map<string, string>> | null = null;
let fieldDefinitionsCacheTime: number = 0;
const FIELD_DEFINITIONS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

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

/**
 * Fetches and caches custom field definitions to map option codes to labels
 */
async function getFieldDefinitionOptions(fieldKey: string): Promise<Map<string, string> | null> {
    const now = Date.now();

    // Return cached data if still valid
    if (fieldDefinitionsCache && (now - fieldDefinitionsCacheTime) < FIELD_DEFINITIONS_CACHE_TTL) {
        return fieldDefinitionsCache.get(fieldKey) || null;
    }

    try {
        // Fetch all custom field definitions
        const response = await getCustomFields();
        const definitions = response.custom_field_definitions || [];

        // Build cache: field key -> (option code -> option label)
        const newCache = new Map<string, Map<string, string>>();

        for (const def of definitions) {
            if (def.key && def.options && Array.isArray(def.options)) {
                const optionsMap = new Map<string, string>();
                for (const option of def.options) {
                    // Options can be objects with name/value or just strings
                    if (typeof option === 'object' && option.name && option.value) {
                        optionsMap.set(String(option.value), option.name);
                    } else if (typeof option === 'object' && option.name) {
                        optionsMap.set(String(option.name), option.name);
                    } else if (typeof option === 'string') {
                        optionsMap.set(option, option);
                    }
                }
                if (optionsMap.size > 0) {
                    newCache.set(def.key, optionsMap);
                }
            }
        }

        fieldDefinitionsCache = newCache;
        fieldDefinitionsCacheTime = now;

        return newCache.get(fieldKey) || null;
    } catch (error) {
        console.error(`Error fetching field definitions for ${fieldKey}:`, error);
        return null;
    }
}

export async function getCustomFieldValue(epic: AhaEpic, fieldAlias: string): Promise<any> {
    const key = getCustomFieldKey(fieldAlias);

    // AHA API returns custom_fields as an array, not an object
    // Handle both array and object formats for compatibility
    let field: any = null;
    if (Array.isArray(epic.custom_fields)) {
        field = epic.custom_fields.find((f: any) => f?.key === key);
    } else if (epic.custom_fields && typeof epic.custom_fields === 'object') {
        field = epic.custom_fields[key];
    }

    if (!field) return null;

    const value = field.value;

    // For select fields, Aha may return value as an object with name property (the option label)
    if (value && typeof value === 'object' && !Array.isArray(value) && value.name) {
        return value.name; // Return the option label
    }

    // If value is a string, it might be a code for a select field
    // Try to fetch the field definition to map code to label
    if (typeof value === 'string' && value.trim()) {
        const optionsMap = await getFieldDefinitionOptions(key);
        if (optionsMap && optionsMap.has(value)) {
            return optionsMap.get(value); // Return the mapped label
        }
    }

    // Return value as-is (could be number, boolean, string, etc.)
    return value ?? null;
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

export interface MappedEpicData {
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

export async function mapEpicToEpic(
    epic: AhaEpic,
    fieldsToLoad?: string[]
): Promise<MappedEpicData> {
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
                const value = await getCustomFieldValue(epic, fieldAlias);
                if (value !== null && value !== undefined) {
                    customFields[fieldAlias] = value;
                }
            } catch (error) {
                // Field alias not found in config, skip it
                console.warn(`Field alias "${fieldAlias}" not found in AHA config, skipping`);
            }
        }
    }

    // Store the full release name in standard fields (no parsing)
    const releaseName = epic.release?.name || null;
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
        tier: mapTierFromAha(await getCustomFieldValue(epic, 'launch_tier')),
        target_launch_date: normalizeReleaseValue(await getCustomFieldValue(epic, 'estimated_ga_release_pm_owned')),
        scheduled_ga_dev_date: normalizeReleaseValue(await getCustomFieldValue(epic, 'scheduled_ga_release_dev_only')),
        owner_email: epic.assigned_to_user?.email ?? null,
        product_component: await getCustomFieldValue(epic, 'components'),
        pod: await getCustomFieldValue(epic, 'dev_backlog_pod'),
        business_priority: await getCustomFieldValue(epic, 'business_priority'),
        csm_priority: await getCustomFieldValue(epic, 'csm_priority'),
        tags: epic.tags ?? [],
        modified_rice_score: await getCustomFieldValue(epic, 'modified_rice'),
        wsjf_score: await getCustomFieldValue(epic, 'wsjf'),
        gtm_link: await getCustomFieldValue(epic, 'gtm_link'),
        activation_process: await getCustomFieldValue(epic, 'activation_process'),
        new_org_setup: await getCustomFieldValue(epic, 'new_org_setup'),
        existing_org_setup: await getCustomFieldValue(epic, 'existing_org_setup'),
        pricing_model: await getCustomFieldValue(epic, 'pricing_model'),
        aha_release_name: releaseName,
        aha_fields: ahaFields,
    };
}



export async function shouldProcessEpic(epic: AhaEpic): Promise<boolean> {
    // Filter: (Launch Candidate == true) OR (tags contains any of the allowed tags from settings)
    const settings = await getSettings();
    const ALLOWED_TAGS = settings.aha_tags || ['LaunchConsole', 'cleargo', 'ClearGO', 'ClearGo'];

    // Check launch_candidate field if configured, otherwise skip this check
    let isLaunchCandidate = false;
    try {
        isLaunchCandidate = await getCustomFieldValue(epic, 'launch_candidate') === true;
    } catch {
        // launch_candidate field not configured - skip this check
    }
    
    const hasLaunchTag = epic.tags?.some(tag => ALLOWED_TAGS.includes(tag)) ?? false;

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
