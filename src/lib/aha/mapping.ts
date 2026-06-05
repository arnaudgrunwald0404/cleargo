import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AhaConfig, AhaEpic } from './types';
import { getCustomFields } from './client';

let cachedConfig: AhaConfig | null = null;

// Cache for custom field definitions (field key -> options map)
let fieldDefinitionsCache: Map<string, Map<string, string>> | null = null;
let fieldDefinitionsCacheTime: number = 0;
const FIELD_DEFINITIONS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

export function loadAhaConfig(): AhaConfig {
    if (cachedConfig) return cachedConfig;

    const configPath = join(process.cwd(), 'config', 'aha-custom-fields.json');
    
    try {
        if (existsSync(configPath)) {
            const configData = readFileSync(configPath, 'utf-8');
            cachedConfig = JSON.parse(configData);
        } else {
            console.warn(`Config file not found at ${configPath}, using empty config`);
            cachedConfig = { workspace_ids: [], fields: {} };
        }
    } catch (error: any) {
        console.error('Error loading AHA config:', error);
        // Fallback to empty config instead of throwing
        cachedConfig = { workspace_ids: [], fields: {} };
    }
    
    return cachedConfig!;
}

export function clearAhaConfigCache(): void {
    cachedConfig = null;
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
 * Safely gets custom field key, returning null if not configured
 * Use this for optional fields that may not be configured in Aha!
 */
export function getCustomFieldKeySafe(fieldAlias: string): string | null {
    const config = loadAhaConfig();
    const field = config.fields[fieldAlias];
    if (!field || !field.key) {
        return null;
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

/**
 * Aha custom fields often return strings, but date fields may return objects
 * (e.g. `{ date: 'YYYY-MM-DD' }`); dropdowns use `{ name: '...' }`.
 */
function coerceAhaCustomFieldScalar(raw: unknown): string | number | boolean | null {
    if (raw == null) return null;
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
    if (Array.isArray(raw)) {
        return raw.length > 0 ? coerceAhaCustomFieldScalar(raw[0]) : null;
    }
    if (typeof raw === 'object') {
        const o = raw as Record<string, unknown>;
        if (typeof o.name === 'string') return o.name;
        if (typeof o.date === 'string') return o.date;
        if (typeof o.value === 'string') return o.value;
        if (raw instanceof Date && !isNaN((raw as Date).getTime())) {
            return (raw as Date).toISOString().split('T')[0];
        }
    }
    return null;
}

/** Find custom field entry; match exact key, then case-insensitive; for off-schedule, allow fuzzy key match. */
function findEpicCustomFieldEntry(epic: AhaEpic, key: string): { value?: unknown } | null {
    if (Array.isArray(epic.custom_fields)) {
        let field = epic.custom_fields.find((f: any) => f?.key === key);
        if (field) return field;
        const lower = key.toLowerCase();
        field = epic.custom_fields.find(
            (f: any) => typeof f?.key === 'string' && f.key.toLowerCase() === lower
        );
        if (field) return field;
        if (key === 'off_schedule_release_date') {
            field = epic.custom_fields.find(
                (f: any) =>
                    typeof f?.key === 'string' &&
                    /off_schedule|offschedule|schedule_release|release_date_off/i.test(f.key)
            );
            if (field) return field;
        }
        return null;
    }
    if (epic.custom_fields && typeof epic.custom_fields === 'object' && !Array.isArray(epic.custom_fields)) {
        const rec = epic.custom_fields as Record<string, unknown>;
        const pick = (v: unknown): { value?: unknown } | null => {
            if (v === undefined || v === null) return null;
            if (typeof v === 'object' && v !== null && 'value' in v) {
                return v as { value?: unknown };
            }
            return { value: v };
        };
        let wrapped = pick(rec[key]) ?? pick(rec[key.toLowerCase()]);
        if (wrapped) return wrapped;
        const lower = key.toLowerCase();
        for (const k of Object.keys(rec)) {
            if (k.toLowerCase() === lower) {
                wrapped = pick(rec[k]);
                if (wrapped) return wrapped;
            }
        }
        if (key === 'off_schedule_release_date') {
            for (const k of Object.keys(rec)) {
                if (/off_schedule|offschedule|schedule_release|release_date_off/i.test(k)) {
                    wrapped = pick(rec[k]);
                    if (wrapped) return wrapped;
                }
            }
        }
    }
    return null;
}

/** Get custom field value from epic by Aha API key (used when alias key may be missing in config). */
async function getCustomFieldValueByKey(epic: AhaEpic, key: string): Promise<any> {
    const field = findEpicCustomFieldEntry(epic, key);
    if (!field) return null;
    const value = field.value;
    if (value && typeof value === 'object' && !Array.isArray(value) && (value as { name?: string }).name) {
        return (value as { name: string }).name;
    }
    const coerced = coerceAhaCustomFieldScalar(value);
    if (typeof coerced === 'string' && coerced.trim()) {
        const optionsMap = await getFieldDefinitionOptions(key);
        if (optionsMap && optionsMap.has(coerced)) {
            return optionsMap.get(coerced);
        }
        return coerced;
    }
    if (typeof coerced === 'number' || typeof coerced === 'boolean') {
        return coerced;
    }
    return coerced ?? null;
}

export async function getCustomFieldValue(epic: AhaEpic, fieldAlias: string): Promise<any> {
    const key = getCustomFieldKey(fieldAlias);
    return getCustomFieldValueByKey(epic, key);
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

/** For UI Framework epics: Level (UI/UX Impact) maps to Tier — Level 1 → Tier 1, Level 2 → Tier 2, Level 3 → Tier 3. */
export function mapUiLevelToTier(uiuxImpactValue: any): string | null {
    if (uiuxImpactValue == null) return null;
    const s = typeof uiuxImpactValue === 'object' && uiuxImpactValue?.name != null
        ? String(uiuxImpactValue.name)
        : String(uiuxImpactValue);
    const lower = s.toLowerCase().trim();
    if (lower.includes('level 1') || lower === '1') return 'TIER_1';
    if (lower.includes('level 2') || lower === '2') return 'TIER_2';
    if (lower.includes('level 3') || lower === '3') return 'TIER_3';
    return null;
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
    // Log integrations field structure for debugging - MAKE IT OBVIOUS!
    if (epic.integrations !== null && epic.integrations !== undefined) {
        console.log('\n' + '='.repeat(80));
        console.log('🔗🔗🔗 INTEGRATIONS FIELD IN MAPPING 🔗🔗🔗');
        console.log('='.repeat(80));
        console.log(`📋 Epic ID: ${epic.reference_num || epic.id}`);
        console.log(`📦 Raw integrations value:`, epic.integrations);
        console.log(`🔤 Type: ${typeof epic.integrations}`);
        console.log(`📝 Stringified (first 500 chars):`, JSON.stringify(epic.integrations).substring(0, 500));
        console.log(`🎯 Full integrations object:`, JSON.stringify(epic.integrations, null, 2));
        console.log('='.repeat(80) + '\n');
    } else {
        console.log('\n' + '⚠️'.repeat(40));
        console.log('⚠️⚠️⚠️ WARNING: INTEGRATIONS FIELD IS NULL/UNDEFINED ⚠️⚠️⚠️');
        console.log('⚠️'.repeat(40));
        console.log(`📋 Epic ID: ${epic.reference_num || epic.id}`);
        console.log(`❌ integrations value: ${epic.integrations}`);
        console.log('⚠️'.repeat(40) + '\n');
    }
    
    const standardFields: Record<string, any> = {
        id: epic.id,
        reference_num: epic.reference_num || epic.id,
        name: epic.name,
        url: epic.url,
        description: epic.description || null,
        integrations: epic.integrations ?? null,
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
            const key = getCustomFieldKeySafe(fieldAlias);
            if (!key) continue;
            const value = await getCustomFieldValueByKey(epic, key);
            if (value !== null && value !== undefined) {
                customFields[fieldAlias] = value;
            }
        }
    }

    // ALWAYS extract and store cleargo_candidate for archiving logic
    // This is critical for the upsertEpicFromAha function to determine archived status
    if (Array.isArray(epic.custom_fields)) {
        const cleargoField = epic.custom_fields.find((f: any) => f?.key === 'cleargo_candidate');
        if (cleargoField) {
            // Store the actual value (usually "Yes" or null)
            const value = cleargoField.value;
            customFields.cleargo_candidate = typeof value === 'object' && value?.name 
                ? value.name 
                : value;
        }
    }

    // ALWAYS extract UI/UX Impact (Level 1-5) for UI Framework rollouts; different levels have different requirements
    if (Array.isArray(epic.custom_fields)) {
        const uiImpactField = epic.custom_fields.find((f: any) => f?.key === 'uiux_impact');
        if (uiImpactField) {
            const value = uiImpactField.value;
            customFields.uiux_impact = typeof value === 'object' && value?.name != null
                ? value.name
                : value;
        }
    }

    const normalizeReleaseValue = (value: any): string | null => {
        if (value === null || value === undefined) return null;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) {
            return value.length > 0 ? String(value[0]) : null;
        }
        const coerced = coerceAhaCustomFieldScalar(value);
        if (typeof coerced === 'string') return coerced;
        if (coerced == null) return null;
        return String(coerced);
    };

    const offScheduleReleaseDate = normalizeReleaseValue(await getCustomFieldValue(epic, 'off_schedule_release_date'));
    if (offScheduleReleaseDate) {
        customFields.off_schedule_release_date = offScheduleReleaseDate;
    }

    // ALWAYS extract rollout_process for Single GA vs Dual Cohort date display on Releases
    if (Array.isArray(epic.custom_fields)) {
        const rolloutField =
            epic.custom_fields.find((f: any) => f?.key === 'rollout_process') ??
            epic.custom_fields.find((f: any) =>
                typeof f?.key === 'string' && /rollout.?process/i.test(f.key)
            );
        if (rolloutField) {
            const value = rolloutField.value;
            customFields.rollout_process =
                typeof value === 'object' && value?.name != null ? value.name : value;
        }
    }

    // Store the full release name in standard fields (no parsing)
    const releaseName = epic.release?.name || null;
    if (releaseName) {
        standardFields.aha_release_name = releaseName;
    }

    // When fieldsToLoad is provided, only include standard fields that are in the selected list.
    // Always include aha_release_name so epics can be grouped by release (avoids "Ungrouped").
    const RELEASE_STANDARD_KEYS = ['aha_release_name', 'release'];
    const standardFieldsForOutput =
        fieldsToLoad && Array.isArray(fieldsToLoad)
            ? {
                  ...Object.fromEntries(
                      Object.entries(standardFields).filter(([key]) => fieldsToLoad.includes(key))
                  ),
                  ...Object.fromEntries(
                      Object.entries(standardFields).filter(([key]) => RELEASE_STANDARD_KEYS.includes(key))
                  ),
              }
            : standardFields;

    // Structure: { standard_fields: {...}, custom_fields: {...} }
    const ahaFields: Record<string, any> = {
        standard_fields: standardFieldsForOutput,
        custom_fields: customFields,
    };

    // For UI Framework epics, Tier = Level (Level 1 → Tier 1, Level 2 → Tier 2, Level 3 → Tier 3)
    const isUiFramework = customFields.cleargo_candidate === 'Yes - UI Framework';
    const tierFromUiLevel = isUiFramework ? mapUiLevelToTier(customFields.uiux_impact) : null;
    const tier = tierFromUiLevel ?? mapTierFromAha(await getCustomFieldValue(epic, 'launch_tier'));

    return {
        aha_id: epic.reference_num || epic.id,
        aha_url: epic.url,
        name: epic.name,
        tier,
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
    // Filter: only include epics where ClearGO Candidate = Yes
    let isClearGOCandidate = false;
    try {
        const fieldKey = 'cleargo_candidate';
        let fieldValue: any = null;

        if (Array.isArray(epic.custom_fields)) {
            const field = epic.custom_fields.find((f: any) => f?.key === fieldKey);
            if (field) {
                fieldValue = field.value;
                if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue) && fieldValue.name) {
                    fieldValue = fieldValue.name;
                }
            }
        }

        isClearGOCandidate = fieldValue === 'Yes' || fieldValue === 'Yes - UI Framework' || fieldValue === true;
    } catch (error) {
        console.debug('cleargo_candidate field not configured');
    }

    return isClearGOCandidate;
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

    // Readiness fields - skip if field key not configured
    if (data.readiness_status !== null) {
        const fieldKey = getCustomFieldKeySafe('launch_readiness_status');
        if (fieldKey) {
            payload[fieldKey] = data.readiness_status;
        } else {
            console.warn('Skipping launch_readiness_status write-back: field key not configured');
        }
    }

    if (data.readiness_score !== null) {
        const fieldKey = getCustomFieldKeySafe('launch_readiness_score_pct');
        if (fieldKey) {
            const scorePercent = Math.round(data.readiness_score * 100);
            payload[fieldKey] = scorePercent;
        } else {
            console.warn('Skipping launch_readiness_score_pct write-back: field key not configured');
        }
    }

    if (data.risk_level !== null) {
        const fieldKey = getCustomFieldKeySafe('launch_risk');
        if (fieldKey) {
            payload[fieldKey] = data.risk_level;
        } else {
            console.warn('Skipping launch_risk write-back: field key not configured');
        }
    }

    if (data.last_go_no_go_decision_date !== null) {
        const fieldKey = getCustomFieldKeySafe('launch_go_no_go_decision_date');
        if (fieldKey) {
            payload[fieldKey] = data.last_go_no_go_decision_date;
        } else {
            console.warn('Skipping launch_go_no_go_decision_date write-back: field key not configured');
        }
    }

    if (data.console_url !== null) {
        const fieldKey = getCustomFieldKeySafe('launch_console_url');
        if (fieldKey) {
            payload[fieldKey] = data.console_url;
        } else {
            console.warn('Skipping launch_console_url write-back: field key not configured');
        }
    }

    // Phase 1: Core epic fields
    if (data.tier !== undefined && data.tier !== null) {
        const fieldKey = getCustomFieldKeySafe('launch_tier');
        if (fieldKey) {
            payload[fieldKey] = mapTierToAha(data.tier);
        } else {
            console.warn('Skipping launch_tier write-back: field key not configured');
        }
    }

    if (data.target_launch_date !== undefined && data.target_launch_date !== null) {
        const fieldKey = getCustomFieldKeySafe('estimated_ga_release_pm_owned');
        if (fieldKey) {
            payload[fieldKey] = data.target_launch_date;
        } else {
            console.warn('Skipping estimated_ga_release_pm_owned write-back: field key not configured');
        }
    }

    return payload;
}
