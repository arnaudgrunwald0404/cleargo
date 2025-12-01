import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, Role } from "@/lib/roles-constants";

export const dynamic = "force-dynamic";

const ROLES_FILE = path.join(process.cwd(), "config", "roles.json");

async function readMapping(): Promise<Record<string, Role>> {
  try {
    const raw = await fs.readFile(ROLES_FILE, "utf8");
    const obj = JSON.parse(raw) as Record<string, Role>;
    const out: Record<string, Role> = {};
    for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v as Role;
    return out;
  } catch {
    return {};
  }
}

async function writeMapping(mapping: Record<string, Role>) {
  // Ensure normalized keys and deterministic order
  const normalized: Record<string, Role> = {};
  Object.keys(mapping)
    .sort()
    .forEach((k) => {
      const email = k.toLowerCase().trim();
      const role = mapping[k] as Role;
      if (email && ALL_ROLES.includes(role)) normalized[email] = role;
    });
  await fs.mkdir(path.dirname(ROLES_FILE), { recursive: true });
  await fs.writeFile(ROLES_FILE, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  return normalized;
}

export async function GET() {
  try {
    const mapping = await readMapping();
    return NextResponse.json({ mapping, roles: ALL_ROLES });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to read permissions" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const mapping = body?.mapping as Record<string, Role> | undefined;
    if (!mapping || typeof mapping !== "object") {
      return NextResponse.json({ error: "Invalid body: expected { mapping }" }, { status: 400 });
    }

    // Validate roles
    for (const [email, role] of Object.entries(mapping)) {
      if (!ALL_ROLES.includes(role as Role)) {
        return NextResponse.json({ error: `Invalid role for ${email}: ${role}` }, { status: 400 });
      }
    }

    const saved = await writeMapping(mapping);
    return NextResponse.json({ mapping: saved, roles: ALL_ROLES });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save permissions" }, { status: 500 });
  }
}