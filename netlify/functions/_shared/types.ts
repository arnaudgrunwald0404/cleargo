export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  slack_handle: string | null;
  active_epics_count: number;
  open_blockers_count: number;
}

export interface EpicSummary {
  id: string;
  name: string;
  status: string;
  tier: string;
  target_launch_date: string | null;
  risk_level: string | null;
  readiness_score: number | null;
  product_name: string | null;
}

export interface Blocker {
  id: string;
  epic_id: string;
  epic_name: string;
  title: string;
  description: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved' | 'dismissed';
  days_blocked: number;
  needs_escalation: boolean;
  logged_at: string;
}

export interface Milestone {
  id: string;
  name: string;
  due_date: string | null;
  completed_at: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'missed';
}

export interface EscalationItem {
  blocker_id: string;
  epic_id: string;
  epic_name: string;
  blocker_title: string;
  severity: string;
  days_blocked: number;
}

export interface CriteriaSummary {
  total: number;
  go: number;
  no_go: number;
  conditional: number;
  not_set: number;
}

export interface EpicDetail {
  id: string;
  name: string;
  status: string;
  tier: string;
  target_launch_date: string | null;
  risk_level: string | null;
  readiness_score: number | null;
  owner: { id: string; name: string; email: string } | null;
  product: { id: string; name: string; pillar: string; pod: string } | null;
  blockers: Blocker[];
  milestones: Milestone[];
  criteria_summary: CriteriaSummary;
}

export interface OneOnOnePrepDoc {
  person: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  summary: {
    active_epics: number;
    completed_this_week: number;
    open_blockers: number;
    escalations_needed: number;
  };
  active_epics: EpicSummary[];
  completed_this_week: EpicSummary[];
  escalations_needed: EscalationItem[];
  suggested_talking_points: string[];
  generated_at: string;
}
