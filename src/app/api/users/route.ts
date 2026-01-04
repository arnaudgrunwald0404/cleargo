import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole, isAdminRole } from "@/lib/roles";
import { syncUserSlackHandle } from "@/lib/slack/notifications";

const createUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  roles: z.array(z.string()).default(["OTHER"]),
  is_active: z.boolean().default(true),
});

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

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  
  // Permission check: users.read
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
    return NextResponse.json({ error: "Failed to fetch user profile", details: userError.message }, { status: 500 });
  }
  
  const { canRolesPerform } = await import("@/lib/permissions");
  const canRead = canRolesPerform((me?.roles as string[]) || [], "users.read");
  if (!canRead) return forbid();

  // Get users from app_user table
  const { data: users, error } = await supabase
    .from("app_user")
    .select("*")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch users", details: error.message }, { status: 500 });
  }

  // Get last login times from auth.users using admin client
  // Use new secret key, fallback to legacy service_role key for backward compatibility
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }
  
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secretKey
  );
  const { data: authUsers } = await adminClient.auth.admin.listUsers();
  const authUserMap = new Map(authUsers?.users.map(u => [u.email?.toLowerCase(), u.last_sign_in_at]) || []);

  // Merge last_login data
  const usersWithLogin = users?.map(u => ({
    ...u,
    last_logged_in: authUserMap.get(u.email?.toLowerCase()) || u.last_logged_in,
  })) || [];

  return NextResponse.json({ users: usersWithLogin });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  // AUTH DISABLED: Superadmin bypasses role checks
  if (!isAdminRole(role)) return forbid();

  // Capability check: users.create
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
    const canCreate = await canRolesPerform((me?.roles as string[]) || [], "users.create");
    if (!canCreate) return forbid();
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: newUser, error } = await supabase
    .from("app_user")
    .insert({
      email: parsed.data.email,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      roles: parsed.data.roles,
      is_active: parsed.data.is_active,
      name: `${parsed.data.first_name || ""} ${parsed.data.last_name || ""}`.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create user", details: error.message }, { status: 500 });
  }

  // Auto-sync Slack handle for new user (non-blocking)
  if (newUser?.email) {
    syncUserSlackHandle(newUser.email).catch((err) => {
      console.error(`Failed to sync Slack handle for ${newUser.email}:`, err);
    });
  }

  return NextResponse.json({ user: newUser }, { status: 201 });
}

