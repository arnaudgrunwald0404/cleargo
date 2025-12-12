import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";
import * as XLSX from "xlsx";

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

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

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

    return NextResponse.json({
      message: "Import successful",
      created: insertedUsers?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to process file", details: error.message }, { status: 500 });
  }
}


