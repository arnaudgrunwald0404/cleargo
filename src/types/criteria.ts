export type CriterionCategory =
  | "PRODUCT_TECH"
  | "PRODUCT_DOCUMENTATION"
  | "GTM"
  | "SUPPORT"
  | "DATA_ANALYTICS"
  | "ANALYTICS_AND_METRICS"
  | "LEGAL_SECURITY"
  | "OPS"
  | "STRATEGY"
  | "OTHER";

export type TierApplicability = "ALL" | "TIER_1_ONLY" | "TIER_1_AND_2";

export type DecisionOwnerRole =
  | "CPO"
  | "PRODUCT_LEAD"
  | "PM"
  | "PMM"
  | "ENG_LEAD"
  | "SUPPORT_LEAD"
  | "SECURITY"
  | "LEARNING"
  | "PRODUCT_OPS"
  | "OTHER";

export type Criterion = {
  id: string;
  label: string;
  description?: string;
  category: CriterionCategory;
  gate: boolean;
  tier_applicability: TierApplicability;
  decision_owner_email?: string | null; // Email or placeholder "[name of pod's product manager]"
  rating_timing?: number | null; // Foreign key to launch_stages table - the timing by which the criteria needs to be rated
  status_definition_go?: string;
  status_definition_conditional?: string;
  status_definition_no_go?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string; // ISO
  updated_at: string; // ISO
};
