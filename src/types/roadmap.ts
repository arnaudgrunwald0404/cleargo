/** Types for Roadmap Snapshot / Rewind (ported from RRV; trimmed to what ClearGo uses). */

export interface RoadmapItem {
  id: string;
  created_at: string;
  rank?: number;
  aha_key: string;
  aha_name: string;
  aha_description: string;
  aha_start_date: string;
  aha_end_date: string;
  aha_status: string;
  aha_t_shirt_est: string;
  aha_primary_goal: string;
  aha_calculated_devs: string;
  aha_owner: string;
  aha_initial_est: string;
  aha_release: string;
  aha_release_date: string;
  aha_components: string;
  aha_cross_functional_deps: string;
  aha_pod: string;
  /** GTM Module from pivot; preferred over `aha_pod` for display when set. */
  gtm_module: string;
  /** GTM Name from pivot; preferred over `aha_name` for display when set. */
  gtm_name: string;
  jira_key: string;
  aha_csm_priority: string;
  /** % complete from Aha! (0-100). May be null/undefined when missing. */
  aha_progress?: number | null;
  /** Ingested for future use; not shown in UI yet. */
  aha_promoted_ideas_votes?: number | null;
}

export interface RoadmapComparison {
  latest: RoadmapItem;
  previous?: RoadmapItem;
  changes: {
    isNew: boolean;
    isRemoved: boolean;
    changedFields: string[];
  };
}

export interface RoadmapChangeEvent {
  id: string | null;
  ahaKey: string;
  ahaName: string;
  release: string | null;
  createdAt: string | null;
  previousCreatedAt: string | null;
  snapshotWeek: string | null;
  previousSnapshotWeek: string | null;
  isNew: boolean;
  timelineChanged: boolean;
  scopeChanged: boolean;
  operationalChange: boolean;
  statusChanged: boolean;
  ownerChanged: boolean;
  podChanged: boolean;
  releaseChanged: boolean;
  releaseDateChanged: boolean;
  startDateChanged: boolean;
  endDateChanged: boolean;
  tShirtChanged: boolean;
  goalChanged: boolean;
  capacityChanged: boolean;
  estimateChanged: boolean;
  descriptionChanged: boolean;
  hasUndefinedValues: boolean;
  previouslyUndefined: boolean;
  undefinedToDefined: boolean;
  definedToUndefined: boolean;
  delayEvent: boolean;
  delayDays: number;
  changeCount: number;
  changeTags: string[];
  hasAnyChange: boolean;
  materialChange: boolean;
  informationalChange: boolean;
  snapshotDate: string | null;
  periodStart: string | null;
  trackedChange: boolean;
}

export type RoadmapChangeHorizon = 'weekly' | 'quarterly' | 'ytd';

export interface RoadmapHorizonSummary {
  horizon: RoadmapChangeHorizon;
  snapshotDate: string | null;
  periodStart: string | null;
  events: RoadmapChangeEvent[];
}

export interface RoadmapDelayHistoryEntry {
  ahaKey: string;
  latestSnapshotAt: string | null;
  latestEndDate: string | null;
  totalDelayEvents: number;
  totalDelayDays: number;
  lastDelaySnapshot: string | null;
  ytdDelayEvents: number;
  ytdDelayDays: number;
}

export type RoadmapDelayHistoryMap = Record<string, RoadmapDelayHistoryEntry>;

export interface WeeklyMovement {
  weekStart: string;
  weekEnd: string;
  count: number;
  items: string[];
}

export interface RoadmapDataPayload {
  comparisons: RoadmapComparison[];
  maxCreatedAt: string | null;
  horizonChanges: Record<RoadmapChangeHorizon, RoadmapHorizonSummary>;
  delayHistory: RoadmapDelayHistoryMap;
  yearlyMovements: WeeklyMovement[];
  allReleases: { name: string; releaseDate: string | null }[];
}

export type RoadmapImpactLevel = 'high' | 'positive' | 'medium' | 'low';

export interface PeriodReleaseMovement {
  aha_key: string;
  aha_name: string;
  /** Raw GTM name from snapshot/RPC when present (display via `getDisplayName`). */
  gtm_name?: string | null;
  /** Raw GTM module from snapshot/RPC when present (display via `getDisplayPod`). */
  gtm_module?: string | null;
  from_release: string | null;
  to_release: string | null;
  week_start: string;
  aha_csm_priority?: string | null;
  impact_level?: RoadmapImpactLevel;
  calculated_impact_level?: RoadmapImpactLevel;
  is_overridden?: boolean;
}

export interface ImpactCategorizedMovement {
  week_start: string;
  week_end: string;
  aha_key: string;
  aha_name: string;
  gtm_name?: string | null;
  gtm_module?: string | null;
  aha_csm_priority: string | null;
  from_release: string | null;
  to_release: string | null;
  to_release_date: string | null;
  impact_level: RoadmapImpactLevel;
  calculated_impact_level?: RoadmapImpactLevel;
  is_overridden?: boolean;
  next_three_releases?: string[];
}

/** Plan vs Actual report (Analytics → Roadmap). */
export type PlanVsActualPeriodType =
  | 'quarter_baseline'
  | 'quarter_progress'
  | 'quarterly'
  /** @deprecated Legacy cache rows only; UI uses quarter_* + quarterly */
  | 'monthly';

export type PlanVsActualStatusCategory = 'green' | 'yellow' | 'red' | 'neutral';

export interface PlanVsActualItem {
  ahaKey: string;
  goal: string | null;
  /** GTM module from snapshot (`gtm_module` only; not pod). */
  productArea: string | null;
  /** Latest `epic_comment.movement_cause` for this epic, if any. */
  pmNoteCause: string | null;
  featureName: string;
  startSnapshotDate: string | null;
  endSnapshotDate: string | null;
  inStart: boolean;
  inEnd: boolean;
  startRelease: string | null;
  endRelease: string | null;
  /** Aha epic progress % at first snapshot of the period (not used for status chip — see `derivePlanVsActualStatus`). */
  startProgress: number | null;
  /** Aha epic progress % at last snapshot of the period. */
  endProgress: number | null;
  startStatus: string | null;
  endStatus: string | null;
  /** Earliest `aha_release` in the RPC scan window (same window as end snapshot pick); net-new train intent. */
  firstScanRelease: string | null;
  statusCategory: PlanVsActualStatusCategory;
  statusLabel: string;
}

export interface PlanVsActualReportPayload {
  periodType: PlanVsActualPeriodType;
  periodStart: string;
  periodEnd: string;
  startSnapshotDate: string | null;
  endSnapshotDate: string | null;
  items: PlanVsActualItem[];
  cachedAnalysis: PeriodShiftAnalysis | null;
  analysisGeneratedAt: string | null;
}

export interface PeriodShiftAnalysis {
  overview: string;
  themes: string[];
  itemInsights: Array<{
    ahaKey: string;
    summary: string;
    likelyReasons: string;
    /** Manual ARR / accounts impact until sourced programmatically. */
    arrImpact?: string;
  }>;
  modelVersion?: string;
}

export interface EpicMovementNoteForAnalysis {
  id: string;
  ahaKey: string;
  commentText: string;
  category: string | null;
  movementCause: string | null;
  fromRelease: string | null;
  toRelease: string | null;
  relatedSnapshotDate: string | null;
  createdAt: string;
}
