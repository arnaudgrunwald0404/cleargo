/**
 * @anthropic-internal/shared - RBAC Engine
 *
 * A generic, pluggable Role-Based Access Control system. Each consuming app
 * defines its own roles and capabilities; this module provides the engine.
 *
 * Extracted from ClearGo's permissions.ts and roles.ts.
 *
 * Usage:
 *   // 1. Define your app's roles and capabilities
 *   type AppRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
 *   type AppCapability = 'posts.create' | 'posts.delete' | 'settings.update';
 *
 *   // 2. Create the RBAC engine
 *   const rbac = createRbac<AppCapability, AppRole>({
 *     superAdminRole: 'ADMIN',
 *     defaultRules: {
 *       'posts.create': ['ADMIN', 'EDITOR'],
 *       'posts.delete': ['ADMIN'],
 *       'settings.update': ['ADMIN'],
 *     },
 *   });
 *
 *   // 3. Check permissions
 *   rbac.can(['EDITOR'], 'posts.create');  // true
 *   rbac.can(['VIEWER'], 'posts.create');  // false
 */

import type { Capability, PermissionRules } from '../types';

export interface RbacConfig<
  TCapabilityId extends string = string,
  TRole extends string = string,
> {
  /** Role that bypasses all checks (e.g. "SUPERADMIN") */
  superAdminRole?: TRole;
  /** Default permission rules: capability -> allowed roles */
  defaultRules: PermissionRules<TCapabilityId, TRole>;
  /** Optional capability metadata (labels + descriptions) */
  capabilities?: Capability<TCapabilityId>[];
}

export interface RbacEngine<
  TCapabilityId extends string = string,
  TRole extends string = string,
> {
  /**
   * Check if any of the given roles can perform the capability.
   * Uses the default rules defined at creation.
   */
  can(roles: TRole[] | string[] | null | undefined, capability: TCapabilityId): boolean;

  /**
   * Check permission against a custom rules map (e.g. DB-loaded overrides).
   * Use this server-side when you fetch per-org permission customizations.
   */
  canWithRules(
    roles: TRole[] | string[] | null | undefined,
    capability: TCapabilityId,
    rules: Record<string, string[]>,
  ): boolean;

  /** Whether the given role is the super-admin role */
  isSuperAdmin(role: TRole | string): boolean;

  /** Get the list of allowed roles for a capability (from default rules) */
  getAllowedRoles(capability: TCapabilityId): TRole[];

  /** Get all registered capabilities with metadata */
  getCapabilities(): Capability<TCapabilityId>[];

  /** Get the default rules */
  getDefaultRules(): PermissionRules<TCapabilityId, TRole>;

  /**
   * Merge DB-loaded overrides with default rules.
   * Returns a complete rules map where overrides take precedence.
   */
  mergeRules(
    overrides: Partial<PermissionRules<TCapabilityId, TRole>>,
  ): PermissionRules<TCapabilityId, TRole>;
}

export function createRbac<
  TCapabilityId extends string = string,
  TRole extends string = string,
>(config: RbacConfig<TCapabilityId, TRole>): RbacEngine<TCapabilityId, TRole> {
  const { superAdminRole, defaultRules, capabilities = [] } = config;

  function normalizeRoles(roles: TRole[] | string[] | null | undefined): string[] {
    if (!roles) return [];
    const arr = Array.isArray(roles) ? roles : [String(roles)];
    return arr.map((r) => String(r).toUpperCase());
  }

  function canWithRules(
    roles: TRole[] | string[] | null | undefined,
    capability: TCapabilityId,
    rules: Record<string, string[]>,
  ): boolean {
    const normalized = normalizeRoles(roles);
    if (normalized.length === 0) return false;

    // Super-admin bypasses all checks
    if (superAdminRole && normalized.includes(superAdminRole.toUpperCase())) {
      return true;
    }

    const allowedRoles = (rules[capability] || []).map((r) => String(r).toUpperCase());
    const allowedSet = new Set(allowedRoles);

    return normalized.some((r) => allowedSet.has(r));
  }

  return {
    can(roles, capability) {
      return canWithRules(roles, capability, defaultRules as Record<string, string[]>);
    },

    canWithRules,

    isSuperAdmin(role) {
      if (!superAdminRole) return false;
      return String(role).toUpperCase() === superAdminRole.toUpperCase();
    },

    getAllowedRoles(capability) {
      return (defaultRules[capability] || []) as TRole[];
    },

    getCapabilities() {
      return capabilities;
    },

    getDefaultRules() {
      return defaultRules;
    },

    mergeRules(overrides) {
      return { ...defaultRules, ...overrides };
    },
  };
}

export type { Capability, PermissionRules };
