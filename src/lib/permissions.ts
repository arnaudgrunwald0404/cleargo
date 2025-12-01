import { getSettings } from "./settings-db";
import type { Role } from "./roles-constants";

export type CapabilityId =
  | "criteria.assignee.override"
  | "criteria.status.update"
  | "launch.tier.update"
  | "launch.risk.update"
  | "launch.delete"
  | "users.invite.send"
  | "users.create"
  | "users.update"
  | "users.delete";

export type Capability = {
  id: CapabilityId;
  label: string;
  description: string;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "criteria.assignee.override",
    label: "Override Criteria Assignee",
    description: "Allow overriding who is assigned/owner for a criterion in a specific launch.",
  },
  {
    id: "criteria.status.update",
    label: "Update Criteria Status",
    description: "Allow updating status/notes/conditions for a criterion.",
  },
  {
    id: "launch.tier.update",
    label: "Update Launch Tier",
    description: "Allow changing a launch's tier.",
  },
  {
    id: "launch.risk.update",
    label: "Update Launch Risk Level",
    description: "Allow changing a launch's risk level.",
  },
  {
    id: "launch.delete",
    label: "Delete Launch",
    description: "Allow deleting a launch.",
  },
  {
    id: "users.invite.send",
    label: "Send User Invites",
    description: "Allow sending/inviting users to the app.",
  },
  {
    id: "users.create",
    label: "Create Users",
    description: "Allow creating new users.",
  },
  {
    id: "users.update",
    label: "Update Users",
    description: "Allow updating user profiles and roles.",
  },
  {
    id: "users.delete",
    label: "Delete Users",
    description: "Allow deleting users (single or bulk).",
  },
];

export const DEFAULT_RULES: Record<CapabilityId, Role[]> = {
  "criteria.assignee.override": ["PRODUCT_OPS", "CPO"],
  "criteria.status.update": ["PM", "PMM", "ENG_LEAD", "PRODUCT_OPS", "CPO", "PRODUCT_LEAD"],
  "launch.tier.update": ["PRODUCT_OPS", "CPO"],
  "launch.risk.update": ["PRODUCT_OPS", "CPO", "PRODUCT_LEAD"],
  "launch.delete": ["PRODUCT_OPS", "CPO"],
  "users.invite.send": ["PRODUCT_OPS", "CPO"],
  "users.create": ["PRODUCT_OPS", "CPO"],
  "users.update": ["PRODUCT_OPS", "CPO"],
  "users.delete": ["PRODUCT_OPS", "CPO"],
};

export type PermissionRules = Record<CapabilityId, Role[]>;

export async function getEffectiveRules(): Promise<PermissionRules> {
  const settings = await getSettings();
  const overrides = (settings as any).permissions as Partial<Record<CapabilityId, Role[]>> | undefined;
  const effective: Partial<Record<CapabilityId, Role[]>> = { ...DEFAULT_RULES };
  if (overrides) {
    for (const [cap, roles] of Object.entries(overrides)) {
      if (roles && Array.isArray(roles)) {
        effective[cap as CapabilityId] = roles as Role[];
      }
    }
  }
  return effective as PermissionRules;
}

export async function canRolesPerform(roles: Role[] | string[] | null | undefined, capability: CapabilityId): Promise<boolean> {
  if (!roles || roles.length === 0) return false;
  const effective = await getEffectiveRules();
  const allowed = new Set(effective[capability] || []);
  return (roles as string[]).some((r) => allowed.has(r as Role));
}
