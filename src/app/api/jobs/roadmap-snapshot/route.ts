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

    const snapshotDate = new Date().toISOString().slice(0, 10);
    let url: string | null =
      `https://${domain}/api/v1/bookmarks/custom_pivots/${pivotId}?view=list`;

    const supabase = createAdminClient();
    let totalRows = 0;
    const unmatchedKeys = new Set<string>();

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
    });
  } catch (e) {
    console.error("[roadmap-snapshot]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot failed" },
      { status: 500 }
    );
  }
}
