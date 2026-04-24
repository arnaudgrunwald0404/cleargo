import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { instantiateReleaseCriteriaForEpic } from "@/lib/db/epics";
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";
import { getUiFrameworkDueDateOptions } from "@/lib/criterion-due-date";

export const dynamic = "force-dynamic";

function epicMatchesCriterion(
  epicTier: string,
  epicAhaFields: unknown,
  tierApplicability: string,
  uiFrameworkOnly: boolean
): boolean {
  if (uiFrameworkOnly) {
    const { isUiFramework } = getUiFrameworkDueDateOptions(epicAhaFields);
    if (!isUiFramework) return false;
  }
  if (tierApplicability === "ALL") return true;
  if (tierApplicability === "TIER_1_ONLY") return epicTier === "TIER_1";
  if (tierApplicability === "TIER_1_AND_2") return epicTier === "TIER_1" || epicTier === "TIER_2";
  if (tierApplicability === "TIER_2_ONLY") return epicTier === "TIER_2";
  if (tierApplicability === "TIER_3_ONLY") return epicTier === "TIER_3";
  return false;
}

async function getEligibleEpicCount(supabase: any, criterionId: string): Promise<number> {
  const { data: criterion } = await supabase
    .from("criterion")
    .select("tier_applicability, ui_framework_only, is_active, context")
    .eq("id", criterionId)
    .single();

  if (!criterion?.is_active || criterion.context !== "release") return 0;

  const { data: epics } = await supabase
    .from("epic")
    .select("id, tier, aha_fields")
    .eq("archived", false)
    .not("tier", "is", null);

  if (!epics?.length) return 0;

  const matchingIds = epics
    .filter((e: any) => epicMatchesCriterion(e.tier, e.aha_fields, criterion.tier_applicability, !!criterion.ui_framework_only))
    .map((e: any) => e.id);

  if (!matchingIds.length) return 0;

  const { data: existing } = await supabase
    .from("epic_criterion_status")
    .select("epic_id")
    .eq("criterion_id", criterionId)
    .in("epic_id", matchingIds);

  const existingIds = new Set(existing?.map((e: any) => e.epic_id) ?? []);
  return matchingIds.filter((id: string) => !existingIds.has(id)).length;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const count = await getEligibleEpicCount(supabase, id);
    return NextResponse.json({ count });
  } catch (err: any) {
    console.error("Error counting eligible epics:", err);
    return NextResponse.json({ error: "Failed to count eligible epics" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });

  const { data: me, error: userError } = await supabase
    .from("app_user")
    .select("roles")
    .eq("email", user.email)
    .single();

  if (userError?.code === "PGRST116") {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }
  if (userError) throw userError;

  const rules = await getEffectivePermissionRules();
  const canUpdate = canRolesPerformWithRules((me?.roles as string[]) || [], "criteria.update", rules);
  if (!canUpdate) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: criterion, error: criterionError } = await supabase
    .from("criterion")
    .select("id, label, tier_applicability, ui_framework_only, is_active, context")
    .eq("id", id)
    .single();

  if (criterionError?.code === "PGRST116" || !criterion) {
    return NextResponse.json({ error: "Criterion not found" }, { status: 404 });
  }
  if (criterionError) throw criterionError;

  if (!criterion.is_active) {
    return NextResponse.json({ error: "Criterion is not active" }, { status: 400 });
  }
  if (criterion.context !== "release") {
    return NextResponse.json({ error: "Backfill only supported for release criteria" }, { status: 400 });
  }

  const { data: epics, error: epicsError } = await supabase
    .from("epic")
    .select("id, tier, name")
    .eq("archived", false)
    .not("tier", "is", null);

  if (epicsError) {
    console.error("Error fetching epics for backfill:", epicsError);
    return NextResponse.json({ error: "Failed to fetch epics" }, { status: 500 });
  }

  if (!epics || epics.length === 0) {
    return NextResponse.json({ processed: 0, skipped: 0, failed: 0, errors: [] });
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { epicId: string; epicName: string; error: string }[] = [];

  for (const epic of epics) {
    if (!epic.tier) {
      skipped++;
      continue;
    }

    try {
      await instantiateReleaseCriteriaForEpic(epic.id, epic.tier, supabase as any);
      processed++;
    } catch (err: any) {
      failed++;
      errors.push({ epicId: epic.id, epicName: epic.name, error: err?.message || String(err) });
      console.error(`Backfill failed for epic ${epic.id} (${epic.name}):`, err);
    }
  }

  console.log(`Criterion backfill complete for criterion ${id}: processed=${processed}, skipped=${skipped}, failed=${failed}`);

  return NextResponse.json({ processed, skipped, failed, errors });
}
