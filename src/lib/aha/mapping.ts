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
    return epic.custom_fields?.[key]?.value ?? null;
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
    product_value: any | null;
    gtm_link: string | null;
    activation_process: string | null;
    new_org_setup: string | null;
    existing_org_setup: string | null;
    pricing_model: string | null;
}

export function mapEpicToLaunch(epic: AhaEpic): MappedLaunchData {
    return {
        aha_id: epic.reference_num || epic.id,
        aha_url: epic.url,
        name: epic.name,
        tier: mapTierFromAha(getCustomFieldValue(epic, 'launch_tier')),
        target_launch_date: getCustomFieldValue(epic, 'estimated_ga_release_pm_owned'),
        scheduled_ga_dev_date: getCustomFieldValue(epic, 'scheduled_ga_release_dev_only'),
        owner_email: epic.assigned_to_user?.email ?? null,
        product_component: getCustomFieldValue(epic, 'components'),
        pod: getCustomFieldValue(epic, 'dev_backlog_pod'),
        business_priority: getCustomFieldValue(epic, 'business_priority'),
        csm_priority: getCustomFieldValue(epic, 'csm_priority'),
        tags: epic.tags ?? [],
        modified_rice_score: getCustomFieldValue(epic, 'modified_rice'),
        wsjf_score: getCustomFieldValue(epic, 'wsjf'),
        product_value: getCustomFieldValue(epic, 'product_value'),
        gtm_link: getCustomFieldValue(epic, 'gtm_link'),
        activation_process: getCustomFieldValue(epic, 'activation_process'),
        new_org_setup: getCustomFieldValue(epic, 'new_org_setup'),
        existing_org_setup: getCustomFieldValue(epic, 'existing_org_setup'),
        pricing_model: getCustomFieldValue(epic, 'pricing_model'),
    };
}

export function shouldProcessEpic(epic: AhaEpic): boolean {
    // Filter: (Launch Candidate == true) OR (tags contains "LaunchConsole")
    const isLaunchCandidate = getCustomFieldValue(epic, 'launch_candidate') === true;
    const hasLaunchTag = epic.tags?.includes('LaunchConsole') ?? false;

    return isLaunchCandidate || hasLaunchTag;
}

export function buildWriteBackPayload(readinessData: {
    readiness_status: string | null;
    readiness_score: number | null;
    risk_level: string | null;
    last_go_no_go_decision_date: string | null;
    console_url: string | null;
}): Record<string, any> {
    const payload: Record<string, any> = {};

    if (readinessData.readiness_status !== null) {
        payload[getCustomFieldKey('launch_readiness_status')] = readinessData.readiness_status;
    }

    if (readinessData.readiness_score !== null) {
        const scorePercent = Math.round(readinessData.readiness_score * 100);
        payload[getCustomFieldKey('launch_readiness_score_pct')] = scorePercent;
    }

    if (readinessData.risk_level !== null) {
        payload[getCustomFieldKey('launch_risk')] = readinessData.risk_level;
    }

    if (readinessData.last_go_no_go_decision_date !== null) {
        payload[getCustomFieldKey('launch_go_no_go_decision_date')] = readinessData.last_go_no_go_decision_date;
    }

    if (readinessData.console_url !== null) {
        payload[getCustomFieldKey('launch_console_url')] = readinessData.console_url;
    }

    return payload;
}
