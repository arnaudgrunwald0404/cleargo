export type LaunchTier = 'TIER_1' | 'TIER_2' | 'TIER_3';
export type LaunchStatus = 'PLANNED' | 'PRE_LAUNCH' | 'LAUNCHING' | 'LAUNCHED' | 'POST_LAUNCH' | 'CANCELLED';
export type LaunchRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Launch {
    id: string;
    name: string;
    aha_id?: string;
    aha_url?: string;
    product_id?: string;
    tier: LaunchTier;
    target_launch_date?: string;
    status: LaunchStatus;
    readiness_score?: number;
    risk_level?: LaunchRisk;
    owner_id?: string;
    business_priority?: string;
    csm_priority?: string;
    tags?: string[];
    created_at: string;
    updated_at: string;
}

export interface CreateLaunchDTO {
    name: string;
    tier: LaunchTier;
    product_id?: string;
    owner_id?: string;
    target_launch_date?: string;
    aha_id?: string;
    aha_url?: string;
}
