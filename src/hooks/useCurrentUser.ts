'use client';

import { useQuery } from '@tanstack/react-query';

export interface CurrentUser {
  /** `app_user.id` UUID — useful as `created_by` on inserts. */
  id: string | null;
  email: string;
  roles: string[];
  first_name?: string | null;
  last_name?: string | null;
}

interface MeApiResponse {
  user?: {
    id?: string;
    email?: string;
    roles?: string[];
    role?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
}

/**
 * Light client-side hook for the currently logged-in user, backed by
 * `/api/me`. Returns roles as an array so callers can capability-check
 * (mirrors the shape `Sidebar.tsx` already uses).
 */
export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ['current-user'],
    queryFn: async () => {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) return null;
      const data = (await res.json()) as MeApiResponse;
      const u = data.user;
      if (!u?.email) return null;
      const roles = Array.isArray(u.roles) ? u.roles : u.role ? [u.role] : [];
      return {
        id: u.id ?? null,
        email: u.email,
        roles,
        first_name: u.first_name ?? null,
        last_name: u.last_name ?? null,
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Roles allowed to write PM-style roadmap data (movement notes, confidence
 * adjustments, impact overrides, and the "hide for me" toggle on the
 * Snapshot view). Mirrors the RLS policies on `epic_comment`,
 * `confidence_rating`, `confidence_adjustment_history`, and
 * `pm_impact_override`. SUPERADMIN is included so admins can author
 * notes for testing / cleanup; PRODUCT is intentionally excluded — the
 * DB policies don't allow PRODUCT to write either.
 *
 * Note: this is *UI* gating only (defense in depth). The authoritative
 * gate is the RLS policy on each table.
 */
const PRODUCT_WRITE_ROLES = new Set(['SUPERADMIN', 'PRODUCT_OPS', 'CPO', 'PM']);

export function canEditRoadmap(roles: string[] | undefined | null): boolean {
  if (!roles || roles.length === 0) return false;
  return roles.some((r) => PRODUCT_WRITE_ROLES.has(r));
}
