import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, Role } from "@/lib/roles-constants";
import { CAPABILITIES, DEFAULT_RULES, canRolesPerformWithRules } from "@/lib/permissions";
import { getSettings, updateSettings, getEffectivePermissionRules } from "@/lib/settings-db";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const ROLES_FILE = path.join(process.cwd(), "config", "roles.json");

const LEGACY_ROLE_MAP: Record<string, Role> = {
  PRODUCT_LEAD: "PRODUCT",
  ENG_LEAD: "ENG",
  SUPPORT_LEAD: "SUPPORT",
};

function normalizeRole(r: string): Role {
  const upper = r.toUpperCase().trim();
  return (LEGACY_ROLE_MAP[upper] ?? upper) as Role;
}

function normalizeRoles(roles: string[]): Role[] {
  return roles.map(normalizeRole);
}

function validRoles(roles: Role[]): roles is Role[] {
  return roles.every((r) => ALL_ROLES.includes(r));
}

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
    // Capability: settings.read.
    //
    // This GET had NO authorization at all, while returning the full email ->
    // role mapping for the whole org plus every capability and override. It
    // answered 200 to an unauthenticated request in production. Its own PATCH
    // is gated, and the sibling GET /api/settings has required settings.read
    // since it was written, so this was an oversight rather than a decision.
    //
    // Gated the same way as that sibling, deliberately: the only consumer is
    // SettingsContext, which is mounted solely on /admin/settings, and that
    // page cannot load its main settings without settings.read anyway. So no
    // caller who could legitimately use this loses access.
    const supabase = createClient();
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: me, error: userError } = await supabase
      .from("app_user")
      .select("roles")
      .eq("email", userEmail)
      .maybeSingle();

    if (userError) {
      return NextResponse.json(
        { error: "Failed to fetch user profile", details: userError.message },
        { status: 500 }
      );
    }
    if (!me) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const effectiveRules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me.roles as string[]) || [], "settings.read", effectiveRules)) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to view permissions" },
        { status: 403 }
      );
    }

    const mapping = await readMapping();
    const settings = await getSettings();
    const rawOverrides = (settings.permissions || {}) as Record<string, string[]>;
    
    // Filter out invalid capabilities, normalize legacy role names in overrides
    const validCaps: Set<string> = new Set(CAPABILITIES.map(c => c.id as string));
    const overrides: Record<string, string[]> = {};
    for (const [cap, roles] of Object.entries(rawOverrides)) {
      if (validCaps.has(cap)) {
        const normalized = normalizeRoles(Array.isArray(roles) ? roles : []);
        overrides[cap] = normalized.filter((r) => ALL_ROLES.includes(r));
      }
    }

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
      
      const rules = await getEffectivePermissionRules();
      const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.update', rules);
      if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

      // Validate capability ids and roles, filter out invalid capabilities
      const validCaps: Set<string> = new Set(CAPABILITIES.map(c => c.id as string));
      const filteredRules: Record<string, string[]> = {};
      const entries = Object.entries(body.rules as Record<string, string[]>);
      
      for (const [cap, roles] of entries) {
        if (!validCaps.has(cap)) {
          console.warn(`Filtering out invalid capability: ${cap}`);
          continue;
        }
        const roleList = Array.isArray(roles) ? roles : [];
        const normalized = normalizeRoles(roleList);
        if (!validRoles(normalized)) {
          return NextResponse.json({ error: `Invalid roles for ${cap}` }, { status: 400 });
        }
        filteredRules[cap] = normalized;
      }

      // Persist overrides in app_settings.permissions (only valid capabilities)
      const updated = await updateSettings({ permissions: filteredRules });

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
