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

export type TierApplicability = "ALL" | "TIER_1_ONLY" | "TIER_1_AND_2" | "TIER_2_ONLY" | "TIER_3_ONLY";

export type DecisionOwnerRole =
  | "CPO"
  | "CSM"
  | "ENG"
  | "IMPL"
  | "LEARNING"
  | "OTHER"
  | "PM"
  | "PMM"
  | "PRODUCT"
  | "PRODUCT_OPS"
  | "REV_OPS"
  | "SALES"
  | "SECURITY"
  | "SUPPORT";

export type DataSourceType = "aha_field" | "aha_description_part" | "url" | "jira_jql" | "success_metrics_defined";

export type DataSource = {
  type: DataSourceType;
  value: string;
  label?: string; // Optional label for URL sources (e.g., "Figma designs", "PRD")
};

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
  /** When true, this criterion only applies to epics with ClearGO Candidate = "Yes - UI Framework" in Aha. */
  ui_framework_only?: boolean;
  data_sources?: DataSource[] | null;
  created_at: string; // ISO
  updated_at: string; // ISO
};
