import type { EpicTier } from './epics';

export type LaunchStatus = 'Planning' | 'In Progress' | 'Launched' | 'Post-Launch';
export type LaunchTier = 'TIER_1' | 'TIER_2';
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

export interface Launch {
  id: string;
  name: string;
  tier: EpicTier | null;
  target_launch_date: string | null;
  status: LaunchStatus;
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

export interface CreateLaunchDTO {
  name: string;
  tier?: EpicTier;
  target_launch_date?: string;
  owner_email?: string;
  schedule_id?: number;
}

export interface UpdateLaunchDTO {
  name?: string;
  tier?: EpicTier | null;
  target_launch_date?: string | null;
  status?: LaunchStatus;
  owner_email?: string | null;
  schedule_id?: number | null;
  brief_url?: string | null;
  feg_url?: string | null;
  archived?: boolean;
}
