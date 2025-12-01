import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";

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
  const role = await resolveRole(user.email);
  if (!(role === "PRODUCT_OPS" || role === "CPO")) return forbid();

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
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  if (!(role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  // Capability check: users.create
  const { data: me } = await supabase
    .from("app_user")
    .select("roles")
    .eq("email", user.email)
    .single();
  const { canRolesPerform } = await import("@/lib/permissions");
  const canCreate = await canRolesPerform((me?.roles as string[]) || [], "users.create");
  if (!canCreate) return forbid();

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

  return NextResponse.json({ user: newUser }, { status: 201 });
}

