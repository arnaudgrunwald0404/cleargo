import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  roles: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  receive_slack_notifications: z.boolean().optional(),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  // Capability check: users.update
  const { data: me, error: userError } = await supabase
    .from("app_user")
    .select("roles")
    .eq("email", user.email)
    .single();
  
  // Handle case where user doesn't exist in app_user table
  if (userError && userError.code === 'PGRST116') {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }
  if (userError) {
    throw userError;
  }
  
  const rules = await getEffectivePermissionRules();
  const canUpdate = canRolesPerformWithRules((me?.roles as string[]) || [], "users.update", rules);
  if (!canUpdate) return forbid();

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const updateData: any = { ...parsed.data };
  if (updateData.first_name || updateData.last_name) {
    updateData.name = `${updateData.first_name || ""} ${updateData.last_name || ""}`.trim() || null;
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(updateData)) {
    if (value !== undefined) payload[key] = value;
  }

  const { data: updatedUser, error } = await supabase
    .from("app_user")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const msg = error.message || "";
    const code = (error as { code?: string }).code;
    if (code === "42703" || msg.includes("receive_slack_notifications") && (msg.includes("does not exist") || msg.includes("column"))) {
      return NextResponse.json(
        { error: "Slack notification setting is not available. Run the database migration: 20260130100000_add_receive_slack_notifications_to_app_user.sql" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to update user", details: error.message }, { status: 500 });
  }

  if (!updatedUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user: updatedUser });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  // Capability check: users.delete
  const { data: me, error: userError } = await supabase
    .from("app_user")
    .select("roles")
    .eq("email", user.email)
    .single();
  
  // Handle case where user doesn't exist in app_user table
  if (userError && userError.code === 'PGRST116') {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }
  if (userError) {
    throw userError;
  }
  
  const rules = await getEffectivePermissionRules();
  const canDelete = canRolesPerformWithRules((me?.roles as string[]) || [], "users.delete", rules);
  if (!canDelete) return forbid();

  const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!secretKey || !supabaseUrl) {
    return NextResponse.json(
      { error: "Server configuration error", details: "Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY" },
      { status: 503 }
    );
  }
  const admin = createSupabaseAdminClient(supabaseUrl, secretKey);

  const { data: deleted, error } = await admin
    .from("app_user")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete user", details: error.message },
      { status: 500 }
    );
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json(
      { error: "User not found or could not be deleted", details: "No row was deleted. The user may not exist or may be protected by database constraints." },
      { status: 404 }
    );
  }

  return NextResponse.json({ message: "User deleted successfully" });
}


