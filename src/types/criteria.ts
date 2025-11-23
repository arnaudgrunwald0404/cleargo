export type CriterionCategory =
  | "PRODUCT_TECH"
  | "GTM"
  | "SUPPORT"
  | "DATA_ANALYTICS"
  | "LEGAL_SECURITY"
  | "OPS"
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
  decision_owner_role: DecisionOwnerRole;
  status_definition_go?: string;
  status_definition_conditional?: string;
  status_definition_no_go?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string; // ISO
  updated_at: string; // ISO
};
