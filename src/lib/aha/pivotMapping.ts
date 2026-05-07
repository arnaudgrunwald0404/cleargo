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
  gtm_module: string | null;
  gtm_name: string | null;
  aha_promoted_ideas_votes: number | null;
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

/** Match pivot column title case-insensitively (Aha casing varies; whitespace normalized). */
function findKeyCaseInsensitive(row: NormalizedPivotRow, wanted: string): string | null {
  const t = wanted.replace(/\s+/g, " ").trim().toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.replace(/\s+/g, " ").trim().toLowerCase() === t) return k;
  }
  return null;
}

/** First non-empty string among exact keys or case-insensitive aliases. */
function strAlias(row: NormalizedPivotRow, ...aliases: string[]): string | null {
  for (const a of aliases) {
    const key = findKeyCaseInsensitive(row, a);
    if (!key) continue;
    const v = row[key];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return null;
}

/** Promoted-ideas column title varies; match known aliases or a regex on the normalized header text. */
function findPromotedIdeasVoteKey(row: NormalizedPivotRow): string | null {
  const aliases = [
    "Epic promoted ideas vote count",
    "Epic promoted idea vote count",
    "Promoted ideas vote count",
  ];
  for (const a of aliases) {
    const k = findKeyCaseInsensitive(row, a);
    if (k) return k;
  }
  const re = /promoted\s+ideas?\s+vote\s+count|epic\s+promoted.*vote/i;
  for (const k of Object.keys(row)) {
    if (re.test(k.replace(/\s+/g, " ").trim())) return k;
  }
  return null;
}

/** When labels differ slightly, match row keys by regex (full header text after trim/collapse spaces). */
function strMatchingRowKey(row: NormalizedPivotRow, keyPattern: RegExp): string | null {
  for (const k of Object.keys(row)) {
    const normalized = k.replace(/\s+/g, " ").trim();
    if (!keyPattern.test(normalized)) continue;
    const v = row[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s !== "") return s;
  }
  return null;
}

/** Parse integer vote counts from pivot cells (number or numeric string). */
function parsePromotedIdeasVotes(row: NormalizedPivotRow): number | null {
  const key = findPromotedIdeasVoteKey(row);
  if (!key) return null;
  const v = row[key];
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const s = String(v).trim().replace(/,/g, "");
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
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
    // GTM: titles may differ in casing; pivots sometimes use `table.field` as the header key.
    gtm_module:
      strAlias(row, "GTM Module", "GTM module", "Gtm module") ??
      strMatchingRowKey(row, /^GTM\s+module$/i) ??
      strMatchingRowKey(row, /\.gtm[_\s]*module$/i),
    gtm_name:
      strAlias(row, "GTM Name", "GTM name", "Gtm name") ??
      strMatchingRowKey(row, /^GTM\s+name$/i) ??
      strMatchingRowKey(row, /\.gtm[_\s]*name$/i),
    aha_promoted_ideas_votes: parsePromotedIdeasVotes(row),
  };
}
