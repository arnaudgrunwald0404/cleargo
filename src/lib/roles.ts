import { promises as fs } from "fs";
import path from "path";

export type Role =
  | "CPO"
  | "PRODUCT_LEAD"
  | "PM"
  | "PMM"
  | "ENG_LEAD"
  | "SUPPORT_LEAD"
  | "SECURITY"
  | "LEARNING"
  | "PRODUCT_OPS"
  | "OTHER";

const FALLBACK_PRODUCT_OPS = (process.env.FALLBACK_PRODUCT_OPS_EMAIL || "agrunwald@clearcompany.com").toLowerCase();
const ROLES_FILE = path.join(process.cwd(), "config", "roles.json");

async function readOverrides(): Promise<Record<string, Role>> {
  try {
    const raw = await fs.readFile(ROLES_FILE, "utf8");
    const obj = JSON.parse(raw) as Record<string, Role>;
    // normalize keys
    const out: Record<string, Role> = {};
    for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
    return out;
  } catch {
    return {};
  }
}

export async function resolveRole(email: string): Promise<Role> {
  const overrides = await readOverrides();
  const e = email.toLowerCase();
  if (overrides[e]) return overrides[e];
  if (e === FALLBACK_PRODUCT_OPS) return "PRODUCT_OPS";
  return "OTHER";
}
