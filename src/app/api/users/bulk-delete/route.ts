import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
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
  
  const { canRolesPerform } = await import("@/lib/permissions");
  const ok = await canRolesPerform((me?.roles as string[]) || [], "users.delete");
  if (!ok) return forbid();

  const body = await req.json();
  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

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
    .in("id", parsed.data.ids)
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: "Failed to delete users", details: error.message },
      { status: 500 }
    );
  }

  const deletedCount = deleted?.length ?? 0;
  if (deletedCount === 0) {
    return NextResponse.json(
      { error: "No users could be deleted", details: "No rows were deleted. Users may not exist or may be protected by database constraints." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    message: `Successfully deleted ${deletedCount} user(s)`,
    deleted: deletedCount,
    ...(deletedCount < parsed.data.ids.length && { warning: `${parsed.data.ids.length - deletedCount} user(s) could not be deleted` }),
  });
}




