import type { NormalizedPivotRow } from "./pivotNormalizer";

/** Row shape for inserting into `roadmap_snapshot` (service role / cron). */
export type RoadmapSnapshotInsert = {
  epic_id: string | null;
  snapshot_date: string;
  aha_key: string;
  aha_name: string | null;
  aha_description: string | null;
  aha_start_date: string | null;
  aha_end_date: string | null;
  aha_status: string | null;
  aha_t_shirt_est: string | null;
  aha_primary_goal: string | null;
  aha_calculated_devs: string | null;
  aha_owner: string | null;
  aha_initial_est: string | null;
  aha_release: string | null;
  aha_pod: string | null;
  jira_key: string | null;
  aha_release_date: string | null;
  aha_csm_priority: string | null;
  aha_progress: number | null;
};

/** Find "Primary Goal - …" column (Aha renames yearly). */
export function findPrimaryGoalValue(row: NormalizedPivotRow): string | null {
  for (const key of Object.keys(row)) {
    if (/^Primary Goal/i.test(key)) {
      const v = row[key];
      if (v === null || v === undefined) return null;
      return String(v);
    }
  }
  return null;
}

function str(row: NormalizedPivotRow, k: string): string | null {
  const v = row[k];
  if (v === null || v === undefined) return null;
  return String(v);
}

/**
 * Map one normalized pivot row to `roadmap_snapshot` columns.
 * `aha_owner` stores the Epic assignee email (matches historical n8n mapping).
 */
export function mapPivotRowToRoadmapSnapshot(
  row: NormalizedPivotRow,
  snapshotDate: string,
  epicIdByAhaKey: Map<string, string | null>
): RoadmapSnapshotInsert {
  const ahaKey = str(row, "Epic key")?.trim() || "";
  return {
    epic_id: ahaKey ? epicIdByAhaKey.get(ahaKey) ?? null : null,
    snapshot_date: snapshotDate,
    aha_key: ahaKey,
    aha_name: str(row, "Epic name"),
    aha_description: str(row, "Epic description"),
    aha_start_date: str(row, "Epic start date"),
    aha_end_date: str(row, "Epic end date"),
    aha_status: str(row, "Epic status"),
    aha_t_shirt_est: str(row, "T-Shirt Est."),
    aha_primary_goal: findPrimaryGoalValue(row),
    aha_calculated_devs: str(row, "Est. Applied Devs"),
    aha_owner: str(row, "Epic assigned to email"),
    aha_initial_est: str(row, "Epic initial estimate"),
    aha_release: str(row, "Epic releases name"),
    aha_pod: str(row, "Dev Backlog/Pod"),
    jira_key: str(row, "Jira key"),
    aha_release_date: str(row, "Epic releases date (external)"),
    aha_csm_priority: str(row, "CSM Priority"),
    aha_progress: typeof row["Epic progress bar"] === "number" ? (row["Epic progress bar"] as number) : null,
  };
}
