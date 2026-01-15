import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { Role } from "./roles-constants";

const FALLBACK_PRODUCT_OPS = (process.env.FALLBACK_PRODUCT_OPS_EMAIL || "agrunwald@clearcompany.com").toLowerCase();

/**
 * Resolve the primary role for a user by querying the database.
 * Falls back to OTHER if user not found or has no roles.
 * The FALLBACK_PRODUCT_OPS email gets PRODUCT_OPS only if user not found in database.
 * Uses admin client to bypass RLS for role lookups.
 */
export async function resolveRole(email: string): Promise<Role> {
  const e = email.toLowerCase();

  try {
    // Use admin client to bypass RLS for role lookups
    // This is necessary because RLS might prevent users from reading their own roles
    let supabase;
    try {
      supabase = createAdminClient();
    } catch {
      // Fall back to regular client if admin client not available
      supabase = createClient();
    }
    
    const { data: user, error } = await supabase
      .from("app_user")
      .select("roles, role")
      .eq("email", e)
      .single();

    if (error || !user) {
      // Safety net: fallback product ops email gets PRODUCT_OPS if user not found
      if (e === FALLBACK_PRODUCT_OPS) {
        return "PRODUCT_OPS";
      }
      return "OTHER";
    }

    // Handle both 'roles' array and legacy 'role' string field
    const roles = user.roles as string[] | null;
    const legacyRole = user.role as string | null;

    // If user has roles array, return the first one (primary role)
    if (roles && roles.length > 0) {
      return roles[0] as Role;
    }

    // Fall back to legacy single role field
    if (legacyRole) {
      return legacyRole as Role;
    }

    // Safety net: fallback product ops email gets PRODUCT_OPS if no roles in database
    if (e === FALLBACK_PRODUCT_OPS) {
      return "PRODUCT_OPS";
    }
    return "OTHER";
  } catch (err) {
    // If database query fails, use fallback for fallback email
    if (e === FALLBACK_PRODUCT_OPS) {
      return "PRODUCT_OPS";
    }
    return "OTHER";
  }
}

// Helper to check if role has admin-level access
export function isAdminRole(role: Role): boolean {
  return role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO";
}
