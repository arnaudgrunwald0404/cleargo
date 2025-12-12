import { promises as fs } from "fs";
import path from "path";
import type { Role } from "./roles-constants";

const FALLBACK_PRODUCT_OPS = (process.env.FALLBACK_PRODUCT_OPS_EMAIL || "agrunwald@clearcompany.com").toLowerCase();
const ROLES_FILE = path.join(process.cwd(), "config", "roles.json");

async function readOverrides(): Promise<Record<string, Role>> {
  try {
    const raw = await fs.readFile(ROLES_FILE, "utf8");
    const obj = JSON.parse(raw) as Record<string, Role>;
    // normalize keys
    const out: Record<string, Role> = {};
    for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v as Role;
    return out;
  } catch {
    return {};
  }
}

export async function resolveRole(email: string): Promise<Role> {
  // AUTH DISABLED: Superadmin always returns SUPERADMIN
  const e = email.toLowerCase();
  if (e === 'agrunwald@clearcompany.com') {
    return "SUPERADMIN" as Role;
  }
  
  const overrides = await readOverrides();
  if (overrides[e]) return overrides[e];
  if (e === FALLBACK_PRODUCT_OPS) return "PRODUCT_OPS";
  return "OTHER";
}

// Helper to check if role has admin-level access
export function isAdminRole(role: Role): boolean {
  return role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO";
}
