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
  | "users.delete"
  | "criteria.create"
  | "criteria.update"
  | "criteria.delete"
  | "criteria.import"
  | "launchStages.manage"
  | "releases.manage"
  | "settings.update"
  | "settings.emailTemplates.read"
  | "settings.emailTemplates.update"
  | "settings.ahaFields.read"
  | "settings.ahaFields.sync"
  | "settings.ahaTags.update";

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
  {
    id: "criteria.create",
    label: "Create Criteria",
    description: "Allow creating readiness criteria definitions.",
  },
  {
    id: "criteria.update",
    label: "Update Criteria",
    description: "Allow updating readiness criteria definitions.",
  },
  {
    id: "criteria.delete",
    label: "Delete Criteria",
    description: "Allow deleting readiness criteria definitions.",
  },
  {
    id: "criteria.import",
    label: "Import Criteria",
    description: "Allow importing criteria in bulk.",
  },
  {
    id: "launchStages.manage",
    label: "Manage Launch Stages",
    description: "Allow creating, updating, and deleting launch stages.",
  },
  {
    id: "releases.manage",
    label: "Manage Release Schedule",
    description: "Allow creating/updating/deleting release schedule entries.",
  },
  {
    id: "settings.update",
    label: "Update Settings",
    description: "Allow changing application-wide settings.",
  },
  {
    id: "settings.emailTemplates.read",
    label: "Read Email Templates",
    description: "Allow reading email template settings.",
  },
  {
    id: "settings.emailTemplates.update",
    label: "Update Email Templates",
    description: "Allow updating email template settings.",
  },
  {
    id: "settings.ahaFields.read",
    label: "Read AHA Fields Config",
    description: "Allow reading AHA fields configuration.",
  },
  {
    id: "settings.ahaFields.sync",
    label: "Synchronize AHA Fields",
    description: "Allow triggering synchronization from AHA to launches.",
  },
  {
    id: "settings.ahaTags.update",
    label: "Update AHA Tags",
    description: "Allow updating the list of AHA tags that trigger inclusion in Launch Console.",
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
  "criteria.create": ["PRODUCT_OPS", "CPO"],
  "criteria.update": ["PRODUCT_OPS", "CPO"],
  "criteria.delete": ["PRODUCT_OPS", "CPO"],
  "criteria.import": ["PRODUCT_OPS", "CPO"],
  "launchStages.manage": ["PRODUCT_OPS", "CPO"],
  "releases.manage": ["PRODUCT_OPS", "CPO"],
  "settings.update": ["PRODUCT_OPS", "CPO"],
  "settings.emailTemplates.read": ["PRODUCT_OPS", "CPO"],
  "settings.emailTemplates.update": ["PRODUCT_OPS", "CPO"],
  "settings.ahaFields.read": ["PRODUCT_OPS", "CPO"],
  "settings.ahaFields.sync": ["PRODUCT_OPS", "CPO"],
  "settings.ahaTags.update": ["CPO"],
};

export type PermissionRules = Record<CapabilityId, Role[]>;

// Client-safe function that uses default rules only (no server imports)
// This can be used in both client and server components
export function canRolesPerform(roles: Role[] | string[] | null | undefined, capability: CapabilityId): boolean {
  // SUPERADMIN bypasses all permission checks
  if (roles && Array.isArray(roles)) {
    const roleStrings = roles.map(r => String(r).toUpperCase());
    if (roleStrings.includes('SUPERADMIN')) {
      return true;
    }
  }
  
  if (!roles || roles.length === 0) return false;
  const allowed = new Set(DEFAULT_RULES[capability] || []);
  return (roles as string[]).some((r) => allowed.has(r as Role));
}

// Alias for backward compatibility
export const canRolesPerformSync = canRolesPerform;
