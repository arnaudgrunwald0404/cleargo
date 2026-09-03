'use client';

/**
 * What the current user may actually do.
 *
 * Client components have been calling `canRolesPerform` from
 * @/lib/permissions, which reads the hardcoded DEFAULT_RULES. Every API route
 * enforces `getEffectivePermissionRules` -- those defaults merged with the
 * admin overrides in `app_settings.permissions`. Wherever an override narrows a
 * capability the two disagree, and the result is a control the user can see and
 * click whose every save is rejected.
 *
 * In production today that is real for three capabilities:
 *   launches.manage             default [PMM]                  -> [CPO]
 *   launchCriteria.status.update default 6 roles                -> [CPO]
 *   launch.status.update        default [PRODUCT_OPS, CPO]      -> []
 *
 * The list comes from GET /api/me, which every authenticated surface already
 * fetches, and it is resolved server-side against the user's profile -- so it
 * follows impersonation, which computing it from roles on the client would not.
 *
 * Fail CLOSED while loading and on error. An affordance that flickers into
 * existence and then fails is worse than one that appears a moment late.
 */
import { useEffect, useState } from 'react';
import type { CapabilityId } from '@/lib/permissions';

export interface CapabilitiesState {
    /** Effective capability ids for the current (or impersonated) user. */
    capabilities: CapabilityId[];
    /** True until the first response lands. Treat every `can()` as false. */
    loading: boolean;
    /** Set when /api/me could not be read; `can()` stays false. */
    error: string | null;
    can: (capability: CapabilityId) => boolean;
}

/** Module-level cache: /api/me is fetched by several components per page. */
let cached: CapabilityId[] | null = null;
let inFlight: Promise<CapabilityId[]> | null = null;

async function loadCapabilities(): Promise<CapabilityId[]> {
    if (cached) return cached;
    if (inFlight) return inFlight;

    inFlight = (async () => {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!res.ok) throw new Error(`/api/me returned ${res.status}`);
        const body = await res.json();
        const list = Array.isArray(body?.capabilities) ? (body.capabilities as CapabilityId[]) : [];
        cached = list;
        return list;
    })();

    try {
        return await inFlight;
    } finally {
        inFlight = null;
    }
}

/**
 * Clear the cache after anything that can change the answer -- an impersonation
 * switch, or an admin saving new permission rules.
 */
export function invalidateCapabilities(): void {
    cached = null;
    inFlight = null;
}

export function useCapabilities(): CapabilitiesState {
    const [capabilities, setCapabilities] = useState<CapabilityId[]>(cached ?? []);
    const [loading, setLoading] = useState(cached === null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // No cache branch here: the useState initializers above already read it,
        // and loadCapabilities() returns it without a fetch. Setting state
        // synchronously in an effect just to repeat that would cascade renders.
        let alive = true;
        loadCapabilities()
            .then((list) => {
                if (!alive) return;
                setCapabilities(list);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (!alive) return;
                setError(err instanceof Error ? err.message : String(err));
                setCapabilities([]);
                setLoading(false);
            });

        return () => {
            alive = false;
        };
    }, []);

    return {
        capabilities,
        loading,
        error,
        // Closed while loading and on error, by design.
        can: (capability: CapabilityId) => !loading && !error && capabilities.includes(capability),
    };
}
