/**
 * Weekly Aha! custom pivot snapshot → `roadmap_snapshot` (replaces n8n workflow).
 * Auth: Authorization: Bearer CRON_SECRET (same as other /api/jobs/* cron routes).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { normalizePivotApiResponse } from "@/lib/aha/pivotNormalizer";
import { mapPivotRowToRoadmapSnapshot } from "@/lib/aha/pivotMapping";
import { fetchAhaPivotPage, nextPivotPageUrl } from "@/lib/aha/pivotFetch";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INSERT_CHUNK = 150;

function requireCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

async function loadEpicIdsForKeys(
  supabase: ReturnType<typeof createAdminClient>,
  keys: string[]
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await supabase.from("epic").select("id, aha_id").in("aha_id", chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (row.aha_id && row.id) map.set(String(row.aha_id), String(row.id));
    }
  }
  for (const k of unique) {
    if (!map.has(k)) map.set(k, null);
  }
  return map;
}

export async function GET(request: NextRequest) {
  return runRoadmapSnapshot(request);
}

export async function POST(request: NextRequest) {
  return runRoadmapSnapshot(request);
}

/** First-page diagnostics when `?debug=1` — see mapped GTM fields vs raw pivot keys (no secrets). */
function buildSnapshotDebug(
  page: { columns?: Array<{ title?: string; table?: string; field?: string }> },
  normalized: ReturnType<typeof normalizePivotApiResponse>,
  firstMapped: {
    aha_key: string;
    gtm_module: string | null;
    gtm_name: string | null;
    aha_promoted_ideas_votes: number | null;
  } | null
) {
  const pivotColumnHeaders =
    page.columns?.map((c) => String(c.title || `${c.table}.${c.field}` || "").trim()) ?? [];
  const firstRow = normalized[0];
  const firstRowKeys = firstRow ? Object.keys(firstRow).sort() : [];
  const firstRowGtmRelated: Record<string, string | number | null> = {};
  if (firstRow) {
    for (const k of Object.keys(firstRow)) {
      if (/gtm|promoted|vote count|ideas?\s+vote/i.test(k)) {
        const v = firstRow[k];
        firstRowGtmRelated[k] =
          v === null || v === undefined
            ? null
            : typeof v === "number"
              ? v
              : String(v);
      }
    }
  }
  return {
    pivot_column_headers: pivotColumnHeaders,
    first_row_normalized_key_count: firstRowKeys.length,
    first_row_normalized_keys_sample: firstRowKeys.slice(0, 80),
    first_row_keys_matching_gtm_vote_pattern: firstRowGtmRelated,
    first_row_after_mapping: firstMapped,
    hint:
      "If first_row_after_mapping is null but pivot_column_headers shows your fields, the header text likely does not match pivotMapping.ts (exact title or epic.table_field key).",
  };
}

async function runRoadmapSnapshot(request: NextRequest): Promise<NextResponse> {
  try {
    if (!requireCronAuth(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pivotId = process.env.AHA_ROADMAP_PIVOT_ID;
    const domain = process.env.AHA_DOMAIN;
    if (!pivotId || !domain) {
      return NextResponse.json(
        { error: "Missing AHA_ROADMAP_PIVOT_ID or AHA_DOMAIN" },
        { status: 500 }
      );
    }

    const debugRequested =
      request.nextUrl.searchParams.get("debug") === "1" ||
      request.nextUrl.searchParams.get("debug") === "true";

    const snapshotDate = new Date().toISOString().slice(0, 10);
    let url: string | null =
      `https://${domain}/api/v1/bookmarks/custom_pivots/${pivotId}?view=list`;

    const supabase = createAdminClient();
    let totalRows = 0;
    const unmatchedKeys = new Set<string>();
    let debugPayload: ReturnType<typeof buildSnapshotDebug> | undefined;

    while (url) {
      const page = await fetchAhaPivotPage(url);
      const normalized = normalizePivotApiResponse(page);
      const keys = normalized
        .map((row) => String(row["Epic key"] ?? "").trim())
        .filter(Boolean);
      const epicMap = await loadEpicIdsForKeys(supabase, keys);

      const rows = normalized
        .map((row) => mapPivotRowToRoadmapSnapshot(row, snapshotDate, epicMap))
        .filter((m) => m.aha_key);

      if (debugRequested && debugPayload === undefined) {
        const first = rows[0];
        debugPayload = buildSnapshotDebug(
          page,
          normalized,
          first
            ? {
                aha_key: first.aha_key,
                gtm_module: first.gtm_module,
                gtm_name: first.gtm_name,
                aha_promoted_ideas_votes: first.aha_promoted_ideas_votes,
              }
            : null
        );
      }

      for (const m of rows) {
        if (!m.epic_id) unmatchedKeys.add(m.aha_key);
      }

      for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
        const chunk = rows.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase.from("roadmap_snapshot").insert(chunk);
        if (error) {
          console.error("[roadmap-snapshot] insert error", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        totalRows += chunk.length;
      }

      url = nextPivotPageUrl(url, page);
    }

    return NextResponse.json({
      ok: true,
      snapshot_date: snapshotDate,
      rows_inserted: totalRows,
      unmatched_aha_keys: unmatchedKeys.size,
      unmatched_sample: [...unmatchedKeys].slice(0, 20),
      ...(debugPayload ? { debug: debugPayload } : {}),
    });
  } catch (e) {
    console.error("[roadmap-snapshot]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot failed" },
      { status: 500 }
    );
  }
}
