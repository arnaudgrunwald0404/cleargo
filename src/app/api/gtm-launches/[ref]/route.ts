import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateLaunchReadiness } from "@/lib/launch-readiness";

export const dynamic = "force-dynamic";

/**
 * GET /api/gtm-launches/[ref]
 * Returns the launch record (find-or-create), linked epics, and criteria statuses.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ ref: string }> }
) {
    try {
        const { ref } = await params;
        const launchRef = decodeURIComponent(ref);
        const supabase = createClient();

        // 1. Find or create a launch record for this ref
        let { data: launch } = await supabase
            .from("launch")
            .select("*")
            .eq("name", launchRef)
            .maybeSingle();

        if (!launch) {
            // Get earliest target date from epics with this ref
            const { data: epicDates } = await supabase
                .from("epic")
                .select("target_launch_date")
                .eq("launch_ref", launchRef)
                .not("target_launch_date", "is", null)
                .order("target_launch_date", { ascending: true })
                .limit(1);

            const targetDate = epicDates?.[0]?.target_launch_date ?? null;

            const { data: created, error: createErr } = await supabase
                .from("launch")
                .insert({
                    name: launchRef,
                    tier: "TIER_1",
                    status: "Planning",
                    target_launch_date: targetDate,
                })
                .select()
                .single();

            if (createErr) throw createErr;
            launch = created;
        }

        // 2. Ensure all active launch criteria have status rows
        const { data: criteria } = await supabase
            .from("criterion")
            .select("id, label, description, phase, gate, sort_order, default_owner_email, default_due_offset_days")
            .eq("context", "launch")
            .eq("is_active", true)
            .order("phase")
            .order("sort_order");

        const { data: existingStatuses } = await supabase
            .from("launch_criterion_status")
            .select("*, criterion:criterion_id(id, label, description, phase, gate, sort_order)")
            .eq("launch_id", launch.id);

        const existingCriterionIds = new Set(
            (existingStatuses || []).map((s: any) => s.criterion_id)
        );

        // Insert missing status rows
        const missing = (criteria || []).filter((c) => !existingCriterionIds.has(c.id));
        if (missing.length > 0) {
            const dueBase = launch.target_launch_date
                ? new Date(launch.target_launch_date + "T00:00:00")
                : null;

            const rows = missing.map((c) => ({
                launch_id: launch!.id,
                criterion_id: c.id,
                status: "NOT_STARTED",
                owner_email: c.default_owner_email || null,
                due_date:
                    dueBase && c.default_due_offset_days
                        ? new Date(
                              dueBase.getTime() -
                                  c.default_due_offset_days * 86400000
                          )
                              .toISOString()
                              .split("T")[0]
                        : null,
            }));

            await supabase.from("launch_criterion_status").insert(rows);
        }

        // 3. Re-fetch all statuses (with criterion data)
        const { data: statuses } = await supabase
            .from("launch_criterion_status")
            .select("*, criterion:criterion_id(id, label, description, phase, gate, sort_order)")
            .eq("launch_id", launch.id)
            .order("criterion(phase)")
            .order("criterion(sort_order)");

        // 4. Get linked epics
        const { data: epics } = await supabase
            .from("epic")
            .select("id, name, tier, status, target_launch_date, risk_level, readiness_status, aha_fields")
            .eq("launch_ref", launchRef)
            .or("archived.is.null,archived.eq.false");

        return NextResponse.json({
            launch,
            statuses: statuses || [],
            epics: epics || [],
        });
    } catch (error: any) {
        console.error("Failed to fetch GTM launch detail:", error);
        return NextResponse.json(
            { error: "Failed to fetch launch detail" },
            { status: 500 }
        );
    }
}
