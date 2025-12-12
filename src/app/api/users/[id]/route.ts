import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  roles: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
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
  if (!(role === "PRODUCT_OPS" || role === "CPO")) return forbid();

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
  
  const { canRolesPerform } = await import("@/lib/permissions");
  const canUpdate = await canRolesPerform((me?.roles as string[]) || [], "users.update");
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

  const { data: updatedUser, error } = await supabase
    .from("app_user")
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
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
  if (!(role === "PRODUCT_OPS" || role === "CPO")) return forbid();

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
  
  const { canRolesPerform } = await import("@/lib/permissions");
  const canDelete = await canRolesPerform((me?.roles as string[]) || [], "users.delete");
  if (!canDelete) return forbid();

  const { error } = await supabase
    .from("app_user")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete user", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: "User deleted successfully" });
}


