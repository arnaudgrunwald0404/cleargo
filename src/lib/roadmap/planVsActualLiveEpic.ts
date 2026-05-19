import { getReleaseNameFromAhaFields } from '@/lib/criterion-due-date';
import { getPlanVsActualFeatureName } from '@/lib/roadmap/displayNames';
import type { RpcPlanVsActualRow } from '@/lib/services/planVsActualService';
import type { PlanVsActualPeriodType } from '@/types/roadmap';
import {
  releaseTrainMatchesReportingScope,
  type ReportingReleaseScope,
} from '@/lib/roadmap/planVsActualStatus';

export type CleargoEpicLiveRow = {
  aha_id: string;
  name: string;
  aha_fields: Record<string, unknown> | null;
};

function cleargoCandidateRaw(epic: { aha_fields?: Record<string, unknown> | null }): unknown {
  const custom = epic.aha_fields?.custom_fields;
  if (!custom || typeof custom !== 'object') return undefined;
  return (custom as Record<string, unknown>).cleargo_candidate;
}

export function isCleargoCandidateEpicRecord(epic: {
  aha_fields?: Record<string, unknown> | null;
}): boolean {
  const raw = cleargoCandidateRaw(epic);
  return raw === 'Yes' || raw === 'Yes - UI Framework' || raw === true;
}

/** Aha epic title from synced `aha_fields` (may be newer than `epic.name`). */
export function parseEpicTitleFromAhaFields(ahaFields: unknown): string | null {
  if (!ahaFields || typeof ahaFields !== 'object') return null;
  const sf = (ahaFields as Record<string, unknown>).standard_fields as
    | Record<string, unknown>
    | undefined;
  if (!sf) return null;
  const n = sf.name;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
}

export function cleargoEpicDisplayTitle(epic: CleargoEpicLiveRow): string | null {
  return (
    parseEpicTitleFromAhaFields(epic.aha_fields)?.trim() ||
    epic.name?.trim() ||
    null
  );
}

export function parseEpicWorkflowStatus(ahaFields: unknown): string | null {
  if (!ahaFields || typeof ahaFields !== 'object') return null;
  const sf = (ahaFields as Record<string, unknown>).standard_fields as
    | Record<string, unknown>
    | undefined;
  if (!sf) return null;
  const ws = sf.workflow_status;
  if (typeof ws === 'string' && ws.trim()) return ws.trim();
  if (ws && typeof ws === 'object' && ws !== null && 'name' in ws) {
    const n = (ws as { name?: unknown }).name;
    if (typeof n === 'string' && n.trim()) return n.trim();
  }
  return null;
}

/** Merge live ClearGO epic title + release; never replace a distinct pivot Epic name with GTM. */
export function overlayRpcRowsWithCleargoEpicNames(
  rows: RpcPlanVsActualRow[],
  epics: CleargoEpicLiveRow[],
): RpcPlanVsActualRow[] {
  const byKey = new Map(epics.map((e) => [e.aha_id.trim(), e]));
  return rows.map((row) => {
    const epic = byKey.get(row.aha_key);
    if (!epic) return row;
    const liveTitle = cleargoEpicDisplayTitle(epic);
    const liveRelease = getReleaseNameFromAhaFields(epic.aha_fields);
    const name = liveTitle ? getPlanVsActualFeatureName(row, liveTitle) : undefined;
    return {
      ...row,
      ...(name ? { end_aha_name: name } : {}),
      ...(liveRelease ? { end_aha_release: liveRelease } : {}),
    };
  });
}

/**
 * Adds ClearGO epics that are not yet on a weekly snapshot (keyed by `aha_id`).
 * Used so net-new betas / mid-month adds show as New Addition before the next pivot pull.
 */
export function supplementRpcRowsWithCleargoEpics(
  rows: RpcPlanVsActualRow[],
  epics: CleargoEpicLiveRow[],
  periodType: PlanVsActualPeriodType,
  scope: ReportingReleaseScope,
  endSnapshotDate: string | null,
): RpcPlanVsActualRow[] {
  if (periodType === 'quarter_baseline') return rows;

  const seen = new Set(rows.map((r) => r.aha_key));
  const out = [...rows];

  for (const epic of epics) {
    const ahaKey = epic.aha_id?.trim();
    if (!ahaKey || seen.has(ahaKey)) continue;
    if (!isCleargoCandidateEpicRecord(epic)) continue;

    const release = getReleaseNameFromAhaFields(epic.aha_fields);
    const inScope = releaseTrainMatchesReportingScope(release, scope);
    if (inScope !== true) continue;

    const status = parseEpicWorkflowStatus(epic.aha_fields);

    out.push({
      aha_key: ahaKey,
      start_snapshot_date: null,
      end_snapshot_date: endSnapshotDate,
      in_start: false,
      in_end: true,
      start_aha_name: null,
      end_aha_name: epic.name ?? null,
      start_aha_primary_goal: null,
      end_aha_primary_goal: null,
      start_aha_pod: null,
      end_aha_pod: null,
      start_gtm_module: null,
      end_gtm_module: null,
      start_gtm_name: null,
      end_gtm_name: epic.name ?? null,
      start_aha_release: null,
      end_aha_release: release,
      start_aha_status: null,
      end_aha_status: status,
      start_aha_end_date: null,
      end_aha_end_date: null,
      start_aha_progress: null,
      end_aha_progress: null,
      first_scan_aha_release: release,
    });
    seen.add(ahaKey);
  }

  return out;
}
