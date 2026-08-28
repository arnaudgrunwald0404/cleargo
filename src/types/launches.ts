import type { EpicTier } from './epics';

/**
 * Status lives with its computation (see src/lib/launch-status.ts), the same way
 * EpicReleaseStatus does. Re-exported here so the many existing
 * `from '@/types/launches'` imports keep resolving.
 */
export type {
  LaunchStatus,
  ComputedLaunchStatus,
  ManualOnlyLaunchStatus,
} from '@/lib/launch-status';
import type { LaunchStatus, ComputedLaunchStatus } from '@/lib/launch-status';

export type LaunchTier = 'TIER_1' | 'TIER_2';
/**
 * NOT_APPLICABLE exists because the Beta proof gate is "if applicable" (Kristin's
 * 00 Launch Gate Checklist, Gate 3). Without it, a capability that runs no beta
 * carries a gate that can never be closed once anything depends on it.
 * launch_asset had this fourth state from the start; the checklist did not.
 */
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'NOT_APPLICABLE';

export interface Launch {
  id: string;
  name: string;
  // Launch tier is independent of epic tier: several TIER_3 epics can bundle
  // into a TIER_1/TIER_2 marketing launch. Launches are only ever T1 or T2.
  tier: LaunchTier | null;
  target_launch_date: string | null;
  /** Effective status: the override when pinned, otherwise derived from dates. */
  status: LaunchStatus;
  /** The pinned value, or null when the launch tracks its dates automatically. */
  status_override: LaunchStatus | null;
  /** What the dates say, whether or not an override is currently hiding it. */
  computed_status: ComputedLaunchStatus;
  owner_id: string | null;
  owner_email: string | null;
  readiness_pct: number;
  schedule_id: number | null;
  brief_url: string | null;
  feg_url: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  epics?: LaunchEpic[];
  criteria_statuses?: LaunchCriterionStatus[];
}

export interface LaunchEpic {
  id: string;
  launch_id: string;
  epic_id: string;
  created_at: string;
  // Joined epic data
  epic?: {
    id: string;
    name: string;
    tier: EpicTier;
    readiness_score?: number;
    readiness_status?: string;
    status: string;
  };
}

export interface LaunchCriterion {
  id: string;
  label: string;
  description: string | null;
  phase: string | null;
  category: string;
  gate: boolean;
  tier_applicability: string;
  default_owner_email: string | null;
  default_due_offset_days: number | null;
  // Per-tier T-minus override, e.g. { TIER_1: 56, TIER_2: 35 }. Lead time scales
  // with tier in the GTM workback, so one scalar cannot serve T1 and T2.
  // Falls back to default_due_offset_days when the launch tier has no entry.
  tier_offset_days: Record<string, number> | null;
  // Predecessor in the artifact runway (Story -> Message -> Enablement -> ...).
  depends_on_criterion_id: string | null;
  sort_order: number;
  is_active: boolean;
  context: 'launch';
}

export interface LaunchCriterionStatus {
  id: string;
  launch_id: string;
  criterion_id: string;
  status: TaskStatus;
  owner_id: string | null;
  owner_email: string | null;
  due_date: string | null;
  notes: string | null;
  links: Array<{ url: string; label?: string }>;
  last_updated_at: string | null;
  last_updated_by: string | null;
  created_at: string;
  // Joined criterion data
  criterion?: LaunchCriterion;
}

/** Status of one supporting asset. NOT_APPLICABLE closes out an optional asset. */
export type AssetStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'NOT_APPLICABLE';

/**
 * One checklist item inside a gate. A gate in ClearGO used to be a single row
 * with a single owner; the process documents model it as a set of items each
 * owned by a different function, so the items are records in their own right and
 * the gate's status is derived from them (gateStatusFromItems).
 */
export interface CriterionItemTemplate {
  id: string;
  criterion_id: string;
  item_key: string;
  label: string;
  description: string | null;
  /** check = gates clearance; decision = a named answer; source = a named link. */
  kind: 'check' | 'decision' | 'source';
  /** DecisionOwnerRole; the function accountable for this item specifically. */
  owner_role: string | null;
  default_owner_email: string | null;
  optional: boolean;
  sort_order: number;
  is_active: boolean;
}

/** A gate item instantiated on one launch. */
export interface LaunchCriterionItem {
  id: string;
  launch_id: string;
  item_id: string;
  label: string;
  kind?: 'check' | 'decision' | 'source';
  status: TaskStatus;
  owner_email: string | null;
  notes: string | null;
  /** The checklist's SOURCE OF TRUTH links, same shape as a criterion's links. */
  links: unknown;
  optional: boolean;
  sort_order: number;
  last_updated_at: string | null;
  /** Joined from criterion_item; not stored on the instance. */
  owner_role?: string | null;
  description?: string | null;
  criterion_id?: string;
}

/**
 * One co-signature on a gate. The checklist ends every gate with two or three
 * named functions and a "Name: ___ Date: ___" line; a single decision owner per
 * criterion could never represent that.
 */
export interface LaunchCriterionSignoff {
  id: string;
  launch_id: string;
  criterion_id: string;
  role: string;
  signer_user_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signed_at: string;
  notes: string | null;
}

/** Curated default asset list, from Part 6 of the Marketing Brief template. */
export interface LaunchAssetTemplate {
  id: string;
  asset_key: string;
  label: string;
  description: string | null;
  tier_applicability: string;
  optional: boolean;
  default_owner_email: string | null;
  sort_order: number;
  is_active: boolean;
}

/** One supporting asset on one launch — the Collateral Index row. */
export interface LaunchAsset {
  id: string;
  launch_id: string;
  template_id: string | null;
  label: string;
  status: AssetStatus;
  owner_email: string | null;
  /** "Where to Find It". */
  url: string | null;
  notes: string | null;
  optional: boolean;
  sort_order: number;
  last_updated_at: string | null;
  last_updated_by: string | null;
  created_at: string;
}

export interface UpdateLaunchAssetDTO {
  label?: string;
  status?: AssetStatus;
  owner_email?: string | null;
  url?: string | null;
  notes?: string | null;
}

export interface CreateLaunchDTO {
  name: string;
  tier?: LaunchTier;
  target_launch_date?: string;
  owner_email?: string;
  schedule_id?: number;
}

export interface UpdateLaunchDTO {
  name?: string;
  tier?: LaunchTier | null;
  target_launch_date?: string | null;
  /** null clears the override and returns the launch to date-derived status. */
  status?: LaunchStatus | null;
  owner_email?: string | null;
  schedule_id?: number | null;
  brief_url?: string | null;
  feg_url?: string | null;
  archived?: boolean;
}
