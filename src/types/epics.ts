export type EpicTier = 'TIER_1' | 'TIER_2' | 'TIER_3';
export type EpicStatus = 'Pre_Release' | 'Released_Cohort_1' | 'Released_GA' | 'Released_Retroed' | 'Cancelled';
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
    jira_epic_key?: string | null;
    launch_ref?: string | null;
    aha_record_not_found?: boolean;
    /** PM-entered actual/revised GTM org access date (YYYY-MM-DD). */
    actual_gtm_access_date?: string | null;
    /** Manual confirmation that GTM access has occurred. */
    gtm_access_confirmed?: boolean;
    /** PM-entered actual/revised Internal Readiness distributed date (YYYY-MM-DD). */
    actual_internal_readiness_date?: string | null;
    /** Manual confirmation that Internal Readiness has been distributed. */
    internal_readiness_confirmed?: boolean;
    /** PM marked Internal Readiness as not applicable for this epic. */
    internal_readiness_na?: boolean;
    /** Number of criteria with NO_GO (red flag) rating for this epic. */
    criteria_red_flag_count?: number;
    /** Names of criteria with NO_GO rating (same order as dots). */
    criteria_red_flag_names?: string[];
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











