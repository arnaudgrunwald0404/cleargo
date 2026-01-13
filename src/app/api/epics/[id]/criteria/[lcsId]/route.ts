import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeEpicReadiness } from "@/lib/readiness";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lcsId: string }> },
) {
  try {
    const { id, lcsId } = await params;
    const supabase = createClient();
    const userEmail = await getAuthenticatedUserEmail();

    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get app_user ID from email
    const { data: appUser, error: userError } = await supabase
      .from("app_user")
      .select("id")
      .eq("email", userEmail)
      .single();

    if (userError || !appUser) {
      console.error("Failed to find app_user:", userError);
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const { status, notes, condition, condition_due_date, data_source_values } =
      body;

    // Load current user's roles
    const { data: me } = await supabase
      .from("app_user")
      .select("roles")
      .eq("id", appUser.id)
      .single();

    // Check permission to update criterion status in general
    {
      const { canRolesPerform } = await import("@/lib/permissions");
      const canUpdate = await canRolesPerform(
        (me?.roles as string[]) || [],
        "criteria.status.update",
      );
      if (!canUpdate) {
        return NextResponse.json(
          { error: "Forbidden: cannot update criterion status" },
          { status: 403 },
        );
      }
    }

    console.log("Updating criterion status:", {
      lcsId,
      epicId: id,
      status,
      appUserId: appUser.id,
      body,
    });

    // Build update object, only including defined values
    const updateData: any = {
      last_updated_at: new Date().toISOString(),
      last_updated_by: appUser.id,
    };

    if (typeof status !== "undefined") updateData.status = status;
    if (typeof notes !== "undefined") updateData.current_status_notes = notes;
    if (typeof condition !== "undefined") updateData.condition = condition;
    if (typeof condition_due_date !== "undefined")
      updateData.condition_due_date = condition_due_date;
    if (typeof data_source_values !== "undefined")
      updateData.data_source_values = data_source_values;

    // Update the status
    const { data, error } = await supabase
      .from("epic_criterion_status")
      .update(updateData)
      .eq("id", lcsId)
      .eq("epic_id", id) // Security check
      .select("*, data_source_values")
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        {
          error: error.message || "Database error",
          details: error.details || null,
          hint: error.hint || null,
          code: error.code || null,
        },
        { status: 500 },
      );
    }

    // Trigger readiness re-computation asynchronously (or await if we want immediate consistency)
    await recomputeEpicReadiness(id);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error updating criterion status:", error);
    return NextResponse.json(
      {
        error: error?.message || "Failed to update status",
        details: error?.details || null,
      },
      { status: 500 },
    );
  }
}
