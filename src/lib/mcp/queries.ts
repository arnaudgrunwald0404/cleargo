import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TeamMember,
  EpicSummary,
  Blocker,
  EscalationItem,
  OneOnOnePrepDoc,
  EpicDetail,
  Milestone,
  CriteriaSummary,
} from '../../../netlify/functions/_shared/types';

const MANAGER_EMAIL = 'agrunwald@clearcompany.com';

function deriveSeverity(status: string, isGate: boolean): Blocker['severity'] {
  if (status === 'NO_GO') return isGate ? 'critical' : 'high';
  return 'medium';
}

function daysBlocked(loggedAt: string): number {
  return Math.floor((Date.now() - new Date(loggedAt).getTime()) / 86400000);
}

export async function queryTeamMembers(supabase: SupabaseClient): Promise<TeamMember[]> {
  const { data: members, error: membersError } = await supabase
    .from('app_user')
    .select('id, name, email, role, slack_handle')
    .eq('manager_email', MANAGER_EMAIL)
    .eq('is_active', true);

  if (membersError) throw new Error('Failed to fetch members');
  if (!members || members.length === 0) return [];

  const memberIds = members.map((m) => m.id);

  const epicsResult = await supabase
    .from('epic')
    .select('owner_id')
    .in('owner_id', memberIds)
    .not('status', 'in', '("LAUNCHED","CANCELLED","ARCHIVED")');

  if (epicsResult.error) throw new Error('Failed to fetch epics');

  const epicCountByOwner: Record<string, number> = {};
  for (const epic of epicsResult.data ?? []) {
    epicCountByOwner[epic.owner_id] = (epicCountByOwner[epic.owner_id] ?? 0) + 1;
  }

  return members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    slack_handle: m.slack_handle,
    active_epics_count: epicCountByOwner[m.id] ?? 0,
    open_blockers_count: 0,
  }));
}

export async function queryOneOnOnePrep(
  supabase: SupabaseClient,
  personId: string
): Promise<OneOnOnePrepDoc> {
  const { data: person, error: personError } = await supabase
    .from('app_user')
    .select('id, name, email, role')
    .eq('id', personId)
    .single();

  if (personError || !person) throw new Error('Person not found');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [activeEpicsResult, completedResult] = await Promise.all([
    supabase
      .from('epic')
      .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, product:product_id(name)')
      .eq('owner_id', personId)
      .not('status', 'in', '("LAUNCHED","CANCELLED","ARCHIVED","COMPLETED")'),
    supabase
      .from('epic')
      .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, product:product_id(name)')
      .eq('owner_id', personId)
      .in('status', ['LAUNCHED', 'COMPLETED'])
      .gte('updated_at', sevenDaysAgo),
  ]);

  if (activeEpicsResult.error) throw new Error('Failed to fetch active epics');
  if (completedResult.error) throw new Error('Failed to fetch completed epics');

  const toEpicSummary = (row: Record<string, unknown>): EpicSummary => {
    const product = row.product as Record<string, unknown> | null;
    return {
      id: row.id as string,
      name: row.name as string,
      status: row.status as string,
      tier: row.tier as string,
      target_launch_date: (row.target_launch_date as string | null) ?? null,
      risk_level: (row.risk_level as string | null) ?? null,
      readiness_score: (row.readiness_score as number | null) ?? null,
      product_name: product ? (product.name as string) : null,
    };
  };

  const active_epics = (activeEpicsResult.data ?? []).map(toEpicSummary);
  const completed_this_week = (completedResult.data ?? []).map(toEpicSummary);

  const epicIds = active_epics.map((e) => e.id);
  const epicNameById: Record<string, string> = Object.fromEntries(
    active_epics.map((e) => [e.id, e.name])
  );

  let personBlockers: Blocker[] = [];

  if (epicIds.length > 0) {
    const { data: csData, error: csError } = await supabase
      .from('epic_criterion_status')
      .select('id, epic_id, status, current_status_notes, last_updated_at, criterion:criterion_id(label, gate)')
      .in('epic_id', epicIds)
      .in('status', ['NO_GO', 'CONDITIONAL']);

    if (csError) throw new Error('Failed to fetch criteria statuses');

    const now = Date.now();
    personBlockers = (csData ?? []).map((cs) => {
      const criterion = cs.criterion as { label?: string; gate?: boolean } | null;
      const severity = deriveSeverity(cs.status, criterion?.gate ?? false);
      const logged_at = cs.last_updated_at as string;
      const days = Math.floor((now - new Date(logged_at).getTime()) / 86400000);
      return {
        id: cs.id as string,
        epic_id: cs.epic_id as string,
        epic_name: epicNameById[cs.epic_id as string] ?? '',
        title: (criterion?.label as string) ?? 'Unknown criterion',
        description: (cs.current_status_notes as string | null) ?? null,
        severity,
        status: 'open' as const,
        days_blocked: days,
        needs_escalation: days >= 3 && (severity === 'high' || severity === 'critical'),
        logged_at,
      };
    });
  }

  const escalations_needed: EscalationItem[] = personBlockers
    .filter((b) => b.needs_escalation)
    .map((b) => ({
      blocker_id: b.id,
      epic_id: b.epic_id,
      epic_name: b.epic_name,
      blocker_title: b.title,
      severity: b.severity,
      days_blocked: b.days_blocked,
    }));

  const suggested_talking_points: string[] = [];

  for (const esc of escalations_needed) {
    suggested_talking_points.push(
      `[ESCALATE] ${esc.epic_name}: ${esc.blocker_title} — blocked ${esc.days_blocked} days (${esc.severity})`
    );
  }

  for (const epic of active_epics) {
    if (epic.risk_level === 'high' || epic.risk_level === 'critical') {
      suggested_talking_points.push(
        `Review risk on '${epic.name}' — currently ${epic.risk_level} risk`
      );
    }
  }

  if (completed_this_week.length > 0) {
    suggested_talking_points.push(
      `Celebrate wins: ${completed_this_week.map((e) => e.name).join(', ')} shipped this week`
    );
  }

  const lowReadiness = active_epics.find(
    (e) => e.readiness_score !== null && e.readiness_score < 50
  );
  if (lowReadiness) {
    suggested_talking_points.push(
      `Check readiness blockers on ${lowReadiness.name} (score: ${lowReadiness.readiness_score}%)`
    );
  }

  if (suggested_talking_points.length === 0) {
    suggested_talking_points.push(
      'No critical items — discuss roadmap priorities and upcoming milestones'
    );
  }

  return {
    person: { id: person.id, name: person.name, email: person.email, role: person.role },
    summary: {
      active_epics: active_epics.length,
      completed_this_week: completed_this_week.length,
      open_blockers: personBlockers.length,
      escalations_needed: escalations_needed.length,
    },
    active_epics,
    completed_this_week,
    escalations_needed,
    suggested_talking_points,
    generated_at: new Date().toISOString(),
  };
}

export async function queryMemberEpics(
  supabase: SupabaseClient,
  memberId: string,
  status?: string
): Promise<{ member: { id: string; name: string; email: string }; data: EpicSummary[] }> {
  const { data: member, error: memberError } = await supabase
    .from('app_user')
    .select('id, name, email')
    .eq('id', memberId)
    .single();

  if (memberError) {
    if (memberError.code === 'PGRST116') throw new Error('Team member not found');
    throw new Error('Failed to fetch member');
  }

  let query = supabase
    .from('epic')
    .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, product:product_id(name)')
    .eq('owner_id', memberId);

  if (status) {
    query = query.eq('status', status);
  }

  const { data: epics, error: epicsError } = await query;
  if (epicsError) throw new Error('Failed to fetch epics');

  const data: EpicSummary[] = (epics ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    status: e.status,
    tier: e.tier,
    target_launch_date: e.target_launch_date,
    risk_level: e.risk_level,
    readiness_score: e.readiness_score,
    product_name: (e.product as { name?: string } | null)?.name ?? null,
  }));

  return { member: { id: member.id, name: member.name, email: member.email }, data };
}

export async function queryMemberBlockers(
  supabase: SupabaseClient,
  memberId: string
): Promise<{ member: { id: string; name: string; email: string }; data: Blocker[] }> {
  const { data: member, error: memberError } = await supabase
    .from('app_user')
    .select('id, name, email')
    .eq('id', memberId)
    .single();

  if (memberError) {
    if (memberError.code === 'PGRST116') throw new Error('Team member not found');
    throw new Error('Failed to fetch member');
  }

  const { data: epics, error: epicsError } = await supabase
    .from('epic')
    .select('id, name')
    .eq('owner_id', memberId)
    .not('status', 'in', '("LAUNCHED","CANCELLED","ARCHIVED","COMPLETED")');

  if (epicsError) throw new Error('Failed to fetch epics');

  if (!epics || epics.length === 0) {
    return { member: { id: member.id, name: member.name, email: member.email }, data: [] };
  }

  const epicIds = epics.map((e) => e.id);
  const epicNameById: Record<string, string> = Object.fromEntries(
    epics.map((e) => [e.id, e.name])
  );

  const { data: criteriaStatuses, error: csError } = await supabase
    .from('epic_criterion_status')
    .select('id, epic_id, criterion_id, status, current_status_notes, condition_due_date, last_updated_at, criterion:criterion_id(label, gate)')
    .in('epic_id', epicIds)
    .in('status', ['NO_GO', 'CONDITIONAL']);

  if (csError) throw new Error('Failed to fetch criteria statuses');

  const now = Date.now();

  const data: Blocker[] = (criteriaStatuses ?? []).map((cs) => {
    const criterion = cs.criterion as { label?: string; gate?: boolean } | null;
    const isGate = criterion?.gate ?? false;
    const label = criterion?.label ?? 'Unknown criterion';
    const severity = deriveSeverity(cs.status, isGate);
    const logged_at = cs.last_updated_at as string;
    const days = Math.floor((now - new Date(logged_at).getTime()) / 86400000);

    return {
      id: cs.id,
      epic_id: cs.epic_id,
      epic_name: epicNameById[cs.epic_id] ?? null,
      title: label,
      description: (cs.current_status_notes as string | null) ?? null,
      severity,
      status: 'open' as const,
      days_blocked: days,
      needs_escalation: days >= 3 && (severity === 'high' || severity === 'critical'),
      logged_at,
    };
  }) as Blocker[];

  return { member: { id: member.id, name: member.name, email: member.email }, data };
}

export async function queryEpicDetail(
  supabase: SupabaseClient,
  epicId: string
): Promise<EpicDetail> {
  const { data: epic, error: epicError } = await supabase
    .from('epic')
    .select('id, name, status, tier, target_launch_date, risk_level, readiness_score, owner_id, product_id')
    .eq('id', epicId)
    .single();

  if (epicError || !epic) throw new Error('Epic not found');

  const [ownerResult, productResult] = await Promise.all([
    epic.owner_id
      ? supabase.from('app_user').select('id, name, email').eq('id', epic.owner_id).single()
      : Promise.resolve({ data: null, error: null }),
    epic.product_id
      ? supabase.from('product').select('id, name, pillar, pod').eq('id', epic.product_id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (ownerResult.error) throw new Error('Failed to fetch owner');
  if (productResult.error) throw new Error('Failed to fetch product');

  const [blockersResult, milestonesResult, criteriaResult] = await Promise.all([
    supabase
      .from('blocker')
      .select('id, epic_id, title, description, severity, status, logged_at')
      .eq('epic_id', epicId)
      .order('logged_at', { ascending: false }),
    supabase
      .from('epic_milestone')
      .select('id, name, due_date, completed_at, status')
      .eq('epic_id', epicId)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('epic_criterion_status')
      .select('status')
      .eq('epic_id', epicId),
  ]);

  if (blockersResult.error) throw new Error('Failed to fetch blockers');
  if (milestonesResult.error) throw new Error('Failed to fetch milestones');
  if (criteriaResult.error) throw new Error('Failed to fetch criteria');

  const blockers: Blocker[] = (blockersResult.data ?? []).map((b) => {
    const severity = b.severity as Blocker['severity'];
    const days = daysBlocked(b.logged_at as string);
    return {
      id: b.id as string,
      epic_id: b.epic_id as string,
      epic_name: epic.name as string,
      title: b.title as string,
      description: (b.description as string | null) ?? null,
      severity,
      status: b.status as Blocker['status'],
      days_blocked: days,
      needs_escalation:
        (b.status as string) === 'open' &&
        days >= 3 &&
        (severity === 'high' || severity === 'critical'),
      logged_at: b.logged_at as string,
    };
  });

  const milestones: Milestone[] = (milestonesResult.data ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    due_date: (m.due_date as string | null) ?? null,
    completed_at: (m.completed_at as string | null) ?? null,
    status: m.status as Milestone['status'],
  }));

  const criteriaRows = criteriaResult.data ?? [];
  const criteria_summary: CriteriaSummary = {
    total: criteriaRows.length,
    go: criteriaRows.filter((r) => r.status === 'GO').length,
    no_go: criteriaRows.filter((r) => r.status === 'NO_GO').length,
    conditional: criteriaRows.filter((r) => r.status === 'CONDITIONAL').length,
    not_set: criteriaRows.filter((r) => r.status === 'NOT_SET' || r.status === 'NOT_APPLICABLE').length,
  };

  const ownerData = ownerResult.data as { id: string; name: string; email: string } | null;
  const productData = productResult.data as { id: string; name: string; pillar: string; pod: string } | null;

  return {
    id: epic.id as string,
    name: epic.name as string,
    status: epic.status as string,
    tier: epic.tier as string,
    target_launch_date: (epic.target_launch_date as string | null) ?? null,
    risk_level: (epic.risk_level as string | null) ?? null,
    readiness_score: (epic.readiness_score as number | null) ?? null,
    owner: ownerData ? { id: ownerData.id, name: ownerData.name, email: ownerData.email } : null,
    product: productData
      ? { id: productData.id, name: productData.name, pillar: productData.pillar, pod: productData.pod }
      : null,
    blockers,
    milestones,
    criteria_summary,
  };
}
