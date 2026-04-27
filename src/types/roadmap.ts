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
  jira_key: string;
  aha_csm_priority: string;
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
  aha_csm_priority: string | null;
  from_release: string | null;
  to_release: string | null;
  to_release_date: string | null;
  impact_level: RoadmapImpactLevel;
  calculated_impact_level?: RoadmapImpactLevel;
  is_overridden?: boolean;
  next_three_releases?: string[];
}
