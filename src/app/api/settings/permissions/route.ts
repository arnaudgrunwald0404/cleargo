import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, Role } from "@/lib/roles-constants";
import { CAPABILITIES, DEFAULT_RULES } from "@/lib/permissions";
import { getSettings, updateSettings } from "@/lib/settings-db";

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
    const settings = await getSettings();
    const overrides = (settings.permissions || {}) as Record<string, string[]>;

    return NextResponse.json({
      roles: ALL_ROLES,
      capabilities: CAPABILITIES,
      rules: DEFAULT_RULES,
      overrides,
      mapping,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to read permissions" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    // Two supported shapes:
    // 1) { rules: Record<capabilityId, Role[]> } -> update settings.permissions
    // 2) { mapping: Record<email, Role> } -> update roles.json mapping (legacy)

    if (body?.rules && typeof body.rules === "object") {
      // Authorization: require capability 'settings.update'
      const { data: me, error: userError } = await supabase
        .from('app_user')
        .select('roles')
        .eq('email', user.email)
        .single();
      
      // Handle case where user doesn't exist in app_user table
      if (userError && userError.code === 'PGRST116') {
        return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
      }
      if (userError) {
        throw userError;
      }
      
      const { canRolesPerform } = await import('@/lib/permissions');
      const ok = await canRolesPerform((me?.roles as string[]) || [], 'settings.update');
      if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

      // Validate capability ids and roles
      const validCaps: Set<string> = new Set(CAPABILITIES.map(c => c.id as string));
      const entries = Object.entries(body.rules as Record<import('@/lib/permissions').CapabilityId, string[]>);
      for (const [cap, roles] of entries) {
        if (!validCaps.has(cap)) {
          return NextResponse.json({ error: `Invalid capability id: ${cap}` }, { status: 400 });
        }
        if (!Array.isArray(roles) || roles.some(r => !ALL_ROLES.includes(r as Role))) {
          return NextResponse.json({ error: `Invalid roles for ${cap}` }, { status: 400 });
        }
      }

      // Persist overrides in app_settings.permissions
      const updated = await updateSettings({ permissions: body.rules });

      return NextResponse.json({
        roles: ALL_ROLES,
        capabilities: CAPABILITIES,
        rules: DEFAULT_RULES,
        overrides: updated.permissions || {},
      });
    }

    if (body?.mapping && typeof body.mapping === "object") {
      // Validate roles for mapping
      for (const [email, role] of Object.entries(body.mapping as Record<string, Role>)) {
        if (!ALL_ROLES.includes(role as Role)) {
          return NextResponse.json({ error: `Invalid role for ${email}: ${role}` }, { status: 400 });
        }
      }
      const saved = await writeMapping(body.mapping as Record<string, Role>);
      // Also return current capability state for convenience
      const settings = await getSettings();
      return NextResponse.json({
        roles: ALL_ROLES,
        capabilities: CAPABILITIES,
        rules: DEFAULT_RULES,
        overrides: settings.permissions || {},
        mapping: saved,
      });
    }

    return NextResponse.json({ error: "Invalid body: expected { rules } or { mapping }" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save permissions" }, { status: 500 });
  }
}
