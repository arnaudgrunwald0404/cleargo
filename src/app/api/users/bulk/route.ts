import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as XLSX from "xlsx";
import { syncUserSlackHandle } from "@/lib/slack/notifications";
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";

const bulkCreateSchema = z.object({
  users: z.array(z.object({
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    roles: z.array(z.string()).default(["OTHER"]),
    is_active: z.boolean().default(true),
  })),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

const emailListSchema = z.object({
  emails: z.array(z.string().email()).min(1, "At least one email required"),
  role: z.string().optional().default("OTHER"),
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function extractEmailFromToken(token: string): string | null {
  const inBrackets = token.match(/<([^>]+)>/);
  const candidate = inBrackets ? inBrackets[1].trim() : token;
  return emailRegex.test(candidate) ? candidate.toLowerCase() : null;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });

  // Capability check: users.create
  const { data: me, error: userError } = await supabase
    .from("app_user")
    .select("roles")
    .eq("email", user.email)
    .single();

  if (userError && userError.code === 'PGRST116') {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }
  if (userError) {
    throw userError;
  }

  const rules = await getEffectivePermissionRules();
  const canCreate = canRolesPerformWithRules((me?.roles as string[]) || [], "users.create", rules);
  if (!canCreate) return forbid();

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json();

    if (Array.isArray(body.users) && body.users.length > 0) {
      const normalized = body.users.map((u: { email: string; role?: string }) => {
        const token = typeof u.email === "string" ? u.email.trim() : "";
        const email = extractEmailFromToken(token) ?? (emailRegex.test(token) ? token.toLowerCase() : null);
        const roleVal = (u.role && typeof u.role === "string") ? u.role : "OTHER";
        return { email, role: roleVal };
      }).filter((u: { email: string | null }) => u.email != null) as Array<{ email: string; role: string }>;
      if (normalized.length === 0) {
        return NextResponse.json({ error: "No valid emails in users list" }, { status: 400 });
      }
      const users = normalized.map((u) => ({
        email: u.email,
        first_name: null as string | null,
        last_name: null as string | null,
        roles: [u.role],
        is_active: true,
      }));
      const { data: insertedUsers, error: insertError } = await supabase
        .from("app_user")
        .upsert(
          users.map((u) => ({
            email: u.email,
            first_name: u.first_name,
            last_name: u.last_name,
            roles: u.roles,
            is_active: u.is_active,
            name: null,
          })),
          { onConflict: "email" }
        )
        .select();
      if (insertError) {
        return NextResponse.json({ error: "Failed to import users", details: insertError.message }, { status: 500 });
      }
      if (insertedUsers && insertedUsers.length > 0) {
        for (const u of insertedUsers) {
          if (u.email) {
            syncUserSlackHandle(u.email).catch((err) => {
              console.error(`Failed to sync Slack handle for ${u.email}:`, err);
            });
          }
        }
      }
      return NextResponse.json({
        message: "Import successful",
        created: insertedUsers?.length || 0,
      });
    }

    const rawTokens = typeof body.emails === "string"
      ? body.emails.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(body.emails)
        ? body.emails.flatMap((e: unknown) => String(e).split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean))
        : [];
    const validEmails = rawTokens.map(extractEmailFromToken).filter((e: string | null): e is string => e != null);
    if (validEmails.length === 0) {
      return NextResponse.json({ error: "At least one valid email is required" }, { status: 400 });
    }
    const roleForAll = (body.role && typeof body.role === "string") ? body.role : "OTHER";
    const parsed = emailListSchema.safeParse({ emails: validEmails, role: roleForAll });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
    }
    const { role: singleRole } = parsed.data;
    const users = validEmails.map((email: string) => ({
      email,
      first_name: null as string | null,
      last_name: null as string | null,
      roles: [singleRole],
      is_active: true,
    }));
    type UserUpsert = { email: string; first_name: string | null; last_name: string | null; roles: string[]; is_active: boolean };
    const { data: insertedUsers, error: insertError } = await supabase
      .from("app_user")
      .upsert(
        users.map((u: UserUpsert) => ({
          email: u.email,
          first_name: u.first_name,
          last_name: u.last_name,
          roles: u.roles,
          is_active: u.is_active,
          name: null,
        })),
        { onConflict: "email" }
      )
      .select();
    if (insertError) {
      return NextResponse.json({ error: "Failed to import users", details: insertError.message }, { status: 500 });
    }
    if (insertedUsers && insertedUsers.length > 0) {
      for (const u of insertedUsers) {
        if (u.email) {
          syncUserSlackHandle(u.email).catch((err) => {
            console.error(`Failed to sync Slack handle for ${u.email}:`, err);
          });
        }
      }
    }
    return NextResponse.json({
      message: "Import successful",
      created: insertedUsers?.length || 0,
    });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Expect header row: Email, First Name, Last Name, Roles (comma-separated), Active
    const users = [];
    const errors: Array<{ row: number; email: string; error: string }> = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const email = row[0]?.toString().trim();
      const firstName = row[1]?.toString().trim() || "";
      const lastName = row[2]?.toString().trim() || "";
      const rolesStr = row[3]?.toString().trim() || "OTHER";
      const active = row[4]?.toString().trim().toLowerCase() !== "false";

      if (!email) {
        errors.push({ row: i + 1, email: "", error: "Email is required" });
        continue;
      }

      const roles = rolesStr.split(",").map((r: string) => r.trim()).filter(Boolean);
      if (roles.length === 0) roles.push("OTHER");

      users.push({
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        roles,
        is_active: active,
      });
    }

    // Bulk insert
    const { data: insertedUsers, error: insertError } = await supabase
      .from("app_user")
      .upsert(
        users.map(u => ({
          email: u.email,
          first_name: u.first_name,
          last_name: u.last_name,
          roles: u.roles,
          is_active: u.is_active,
          name: `${u.first_name || ""} ${u.last_name || ""}`.trim() || null,
        })),
        { onConflict: "email" }
      )
      .select();

    if (insertError) {
      return NextResponse.json({ error: "Failed to import users", details: insertError.message }, { status: 500 });
    }

    // Auto-sync Slack handles for all imported users (non-blocking, in background)
    if (insertedUsers && insertedUsers.length > 0) {
      for (const user of insertedUsers) {
        if (user.email) {
          syncUserSlackHandle(user.email).catch((err) => {
            console.error(`Failed to sync Slack handle for ${user.email}:`, err);
          });
        }
      }
    }

    return NextResponse.json({
      message: "Import successful",
      created: insertedUsers?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to process file", details: error.message }, { status: 500 });
  }
}


