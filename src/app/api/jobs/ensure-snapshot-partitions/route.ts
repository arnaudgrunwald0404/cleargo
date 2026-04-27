/**
 * Monthly maintenance: ensure `roadmap_snapshot` monthly partitions exist ahead of the calendar.
 * Calls public.ensure_roadmap_snapshot_partitions() (SECURITY DEFINER).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function requireCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function GET(request: NextRequest) {
  try {
    if (!requireCronAuth(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.rpc("ensure_roadmap_snapshot_partitions");

    if (error) {
      console.error("[ensure-snapshot-partitions]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[ensure-snapshot-partitions]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
