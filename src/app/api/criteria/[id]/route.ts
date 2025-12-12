import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteCriteria, updateCriteria } from "@/lib/db/criteria";
import { resolveRole } from "@/lib/roles";

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  gate: z.boolean().optional(),
  tier_applicability: z.string().optional(),
  decision_owner_email: z.string().nullable().optional(),
  status_definition_go: z.string().nullable().optional(),
  status_definition_conditional: z.string().nullable().optional(),
  status_definition_no_go: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  rating_timing: z.number().int().nullable().optional(),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  // Capability: criteria.delete
  // AUTH DISABLED: Superadmin bypasses capability checks
  if (role !== "SUPERADMIN") {
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
    const canDelete = await canRolesPerform((me?.roles as string[]) || [], "criteria.delete");
    if (!canDelete) return forbid();
  }

  const deleted = await deleteCriteria(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ message: "Criteria deleted successfully" });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  // Capability: criteria.update
  // AUTH DISABLED: Superadmin bypasses capability checks
  if (role !== "SUPERADMIN") {
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
    const canUpdate = await canRolesPerform((me?.roles as string[]) || [], "criteria.update");
    if (!canUpdate) return forbid();
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const updated = await updateCriteria(id, parsed.data as any);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: updated });
  } catch (e: any) {
    const code = e?.code || e?.status || undefined;
    const status = code === 'PGRST116' ? 404 : 500;
    const error = code === 'PGRST116' ? 'Not found' : 'Update failed';
    return NextResponse.json({ error, code, details: e?.message || String(e) }, { status });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  // Capability: criteria.update
  // AUTH DISABLED: Superadmin bypasses capability checks
  if (role !== "SUPERADMIN") {
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
    const canUpdate = await canRolesPerform((me?.roles as string[]) || [], "criteria.update");
    if (!canUpdate) return forbid();
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const updated = await updateCriteria(id, parsed.data as any);
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ item: updated });
  } catch (e: any) {
    const code = e?.code || e?.status || undefined;
    const status = code === 'PGRST116' ? 404 : 500;
    const error = code === 'PGRST116' ? 'Not found' : 'Update failed';
    return NextResponse.json({ error, code, details: e?.message || String(e) }, { status });
  }
}
