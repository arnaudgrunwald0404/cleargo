import type { Role } from "./roles-constants";
import { ALL_ROLES } from "./roles-constants";

export type CapabilityId =
  | "criteria.status.update"
  | "criteria.delegate"
  | "launch.tier.update"
  | "launch.risk.update"
  | "launch.status.update"
  | "launch.delete"
  | "users.read"
  | "users.invite.send"
  | "users.create"
  | "users.update"
  | "users.delete"
  | "criteria.create"
  | "criteria.update"
  | "criteria.delete"
  | "criteria.import"
  | "releaseStages.manage"
  | "releases.manage"
  | "launches.view"
  | "launches.manage"
  | "launchCriteria.create"
  | "launchCriteria.update"
  | "launchCriteria.delete"
  | "launchCriteria.status.update"
  | "launchSchedule.manage"
  | "settings.read"
  | "settings.update"
  | "settings.emailTemplates.read"
  | "settings.emailTemplates.update"
  | "settings.ahaFields.read"
  | "settings.ahaFields.sync"
  | "settings.ahaTags.update"
  | "settings.webhookUrl.read"
  | "settings.webhookUrl.update"
  | "meetings.read"
  | "analytics.read"
  | "settings.successMeasurement.update"
  | "roadmap.confidence.adjust"
  | "roadmap.impactOverride.write"
  | "roadmap.hiddenItem.write"
  | "roadmap.movementNote.write";

export type Capability = {
  id: CapabilityId;
  label: string;
  description: string;
};

export const CAPABILITIES: Capability[] = [
  {
    id: "criteria.status.update",
    label: "Update Criteria Score",
    description: "Allow updating Go/No-Go score/notes/conditions for a criterion.",
  },
  {
    id: "criteria.delegate",
    label: "Delegate Criteria Accountable",
    description: "Allow delegating criteria accountability to other users. CPO and Super Admin can delegate any criteria, while accountables can delegate their own assigned tasks.",
  },
  {
    id: "launch.tier.update",
    label: "Update Epic Tier",
    description: "Allow changing an Epic's tier.",
  },
  {
    id: "launch.risk.update",
    label: "Update Epic Risk Level",
    description: "Allow changing an Epic's risk level.",
  },
  {
    id: "launch.status.update",
    label: "Update Epic Status",
    description: "Allow manually overriding an Epic's status (normally computed from dates).",
  },
  {
    id: "launch.delete",
    label: "Delete Epic",
    description: "Allow deleting an Epic.",
  },
  {
    id: "users.read",
    label: "View Users",
    description: "Allow viewing the list of users and their details.",
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
    id: "releaseStages.manage",
    label: "Manage Release Stages",
    description: "Allow creating, updating, and deleting release stages.",
  },
  {
    id: "releases.manage",
    label: "Manage Release Schedule",
    description: "Allow creating/updating/deleting release schedule entries.",
  },
  {
    id: "launches.view",
    label: "View Launches Section",
    description: "Allow seeing the Launches section in the sidebar and accessing launch pages.",
  },
  {
    id: "launches.manage",
    label: "Manage Launches",
    description: "Allow creating, updating, and deleting launches and linking epics.",
  },
  {
    id: "launchCriteria.create",
    label: "Create Launch Criteria",
    description: "Allow creating launch criteria template definitions.",
  },
  {
    id: "launchCriteria.update",
    label: "Update Launch Criteria",
    description: "Allow updating launch criteria template definitions.",
  },
  {
    id: "launchCriteria.delete",
    label: "Delete Launch Criteria",
    description: "Allow deleting launch criteria template definitions.",
  },
  {
    id: "launchCriteria.status.update",
    label: "Update Launch Task Status",
    description: "Allow updating task status, owner, notes, and links on launch criteria.",
  },
  {
    id: "launchSchedule.manage",
    label: "Manage Launch Schedule",
    description: "Allow creating/updating/deleting launch schedule entries.",
  },
  {
    id: "settings.read",
    label: "View Settings",
    description: "Allow viewing application-wide settings.",
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
    description: "Allow triggering synchronization from AHA to Epics.",
  },
  {
    id: "settings.ahaTags.update",
    label: "Update AHA Tags",
    description: "Allow updating the list of AHA tags that trigger inclusion in Launch Console.",
  },
  {
    id: "settings.webhookUrl.read",
    label: "View Webhook URL",
    description: "Allow viewing the Aha! webhook URL configuration.",
  },
  {
    id: "settings.webhookUrl.update",
    label: "Update Webhook URL",
    description: "Allow updating the Aha! webhook URL configuration.",
  },
  {
    id: "meetings.read",
    label: "View Meetings",
    description: "Allow viewing and accessing the Meetings section.",
  },
  {
    id: "analytics.read",
    label: "View Analytics",
    description: "Allow viewing the Analytics dashboard (CPO-only for now).",
  },
  {
    id: "settings.successMeasurement.update",
    label: "Configure Success Metrics (HEART)",
    description: "Allow setting up and editing HEART metrics, Pendo config, and success measurement. Others can view only.",
  },
  {
    id: "roadmap.confidence.adjust",
    label: "Adjust Roadmap Confidence",
    description: "Adjust PM confidence offset on delivery confidence ratings (Roadmap Rewind).",
  },
  {
    id: "roadmap.impactOverride.write",
    label: "Override Release Movement Impact",
    description: "Create or edit PM impact overrides for roadmap release movements.",
  },
  {
    id: "roadmap.hiddenItem.write",
    label: "Hide Roadmap Items (self)",
    description: "Hide individual epics from your own roadmap views (per-user preference).",
  },
  {
    id: "roadmap.movementNote.write",
    label: "Add Roadmap Movement Notes",
    description: "Add epic-level movement notes (PM notes) on the Rewind timeline.",
  },
];

export const DEFAULT_RULES: Record<CapabilityId, Role[]> = {
  "criteria.status.update": ["PM", "PMM", "ENG", "PRODUCT_OPS", "CPO", "PRODUCT"],
  "criteria.delegate": ["CPO", "PRODUCT_OPS"],
  "launch.tier.update": ["PRODUCT_OPS", "CPO"],
  "launch.risk.update": ["PRODUCT_OPS", "CPO", "PRODUCT"],
  "launch.status.update": ["PRODUCT_OPS", "CPO"],
  "launch.delete": ["PRODUCT_OPS", "CPO"],
  "users.read": ["PRODUCT_OPS", "CPO", "PMM", "PM"],
  "users.invite.send": ["PRODUCT_OPS", "CPO"],
  "users.create": ["PRODUCT_OPS", "CPO"],
  "users.update": ["PRODUCT_OPS", "CPO"],
  "users.delete": ["PRODUCT_OPS", "CPO"],
  "criteria.create": ["PRODUCT_OPS", "CPO"],
  "criteria.update": ["PRODUCT_OPS", "CPO"],
  "criteria.delete": ["PRODUCT_OPS", "CPO"],
  "criteria.import": ["PRODUCT_OPS", "CPO"],
  "releaseStages.manage": ["PRODUCT_OPS", "CPO"],
  "releases.manage": ["PRODUCT_OPS", "CPO"],
  "launches.view": ["PMM", "CPO", "PRODUCT_OPS"],
  "launches.manage": ["PMM", "CPO", "PRODUCT_OPS"],
  "launchCriteria.create": ["PMM", "CPO", "PRODUCT_OPS"],
  "launchCriteria.update": ["PMM", "CPO", "PRODUCT_OPS"],
  "launchCriteria.delete": ["PMM", "CPO", "PRODUCT_OPS"],
  "launchCriteria.status.update": ["PM", "PMM", "ENG", "CPO", "PRODUCT_OPS", "PRODUCT"],
  "launchSchedule.manage": ["PMM", "CPO", "PRODUCT_OPS"],
  "settings.read": ["PRODUCT_OPS", "CPO"],
  "settings.update": ["PRODUCT_OPS", "CPO"],
  "settings.emailTemplates.read": ["PRODUCT_OPS", "CPO"],
  "settings.emailTemplates.update": ["PRODUCT_OPS", "CPO"],
  "settings.ahaFields.read": ["PRODUCT_OPS", "CPO"],
  "settings.ahaFields.sync": ["PRODUCT_OPS", "CPO"],
  "settings.ahaTags.update": ["CPO"],
  "settings.webhookUrl.read": ["CPO", "PRODUCT_OPS", "PRODUCT"],
  "settings.webhookUrl.update": ["CPO", "PRODUCT_OPS"],
  "meetings.read": ["CPO", "SUPERADMIN"],
  "analytics.read": ["CPO"],
  "settings.successMeasurement.update": ["CPO", "PRODUCT", "PRODUCT_OPS", "PM", "PMM", "SUPERADMIN"],
  "roadmap.confidence.adjust": ["PM", "PRODUCT_OPS", "CPO"],
  "roadmap.impactOverride.write": ["PM", "PRODUCT_OPS", "CPO"],
  "roadmap.hiddenItem.write": [...ALL_ROLES],
  "roadmap.movementNote.write": [...ALL_ROLES],
};

export type PermissionRules = Record<CapabilityId, Role[]>;

// Client-safe function that uses default rules only (no server imports)
// This can be used in both client and server components
export function canRolesPerform(roles: Role[] | string[] | null | undefined, capability: CapabilityId): boolean {
  return canRolesPerformWithRules(roles, capability, DEFAULT_RULES);
}

// Check permission against a given rules map (e.g. effective rules from DB).
// Use this on the server with getEffectivePermissionRules() so checks use DB overrides.
export function canRolesPerformWithRules(
  roles: Role[] | string[] | null | undefined,
  capability: CapabilityId,
  rules: Record<string, string[]>
): boolean {
  if (!roles || (Array.isArray(roles) ? roles.length === 0 : !String(roles).trim())) return false;

  const roleArray = Array.isArray(roles) ? roles : [String(roles)];
  const normalizedRoles = roleArray.map((r) => String(r).toUpperCase());

  if (normalizedRoles.includes("SUPERADMIN")) {
    return true;
  }

  const allowedRoles = (rules[capability] || []).map((r) => String(r).toUpperCase());
  const allowedSet = new Set(allowedRoles);

  return normalizedRoles.some((r) => allowedSet.has(r));
}

// Alias for backward compatibility
export const canRolesPerformSync = canRolesPerform;
