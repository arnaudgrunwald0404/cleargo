export type EpicTier = 'TIER_1' | 'TIER_2' | 'TIER_3';
export type EpicStatus = 'PLANNED' | 'PRE_LAUNCH' | 'LAUNCHING' | 'LAUNCHED' | 'POST_LAUNCH' | 'CANCELLED';
export type EpicRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Epic {
    id: string;
    name: string;
    aha_id?: string;
    aha_url?: string;
    product_id?: string;
    tier: EpicTier;
    target_launch_date?: string;
    status: EpicStatus;
    readiness_score?: number;
    readiness_status?: string;
    risk_level?: EpicRisk;
    owner_id?: string;
    owner_email?: string;
    business_priority?: string;
    csm_priority?: string;
    tags?: string[];
    product_component?: string;
    pod?: string;
    console_url?: string;
    last_go_no_go_decision_date?: string;
    scheduled_ga_dev_date?: string;
    modified_rice_score?: any;
    wsjf_score?: any;
    gtm_link?: string;
    activation_process?: string;
    new_org_setup?: string;
    existing_org_setup?: string;
    pricing_model?: string;
    aha_fields?: Record<string, any> | null;
    archived?: boolean;
    product?: { name: string };
    owner?: { name?: string; email?: string };
    created_at: string;
    updated_at: string;
}

export interface CreateEpicDTO {
    name: string;
    tier: EpicTier;
    product_id?: string;
    owner_id?: string;
    target_launch_date?: string;
    aha_id?: string;
    aha_url?: string;
}











