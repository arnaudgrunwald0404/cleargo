import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings, getEffectivePermissionRules } from "@/lib/settings-db";
import { createClient } from "@/lib/supabase/server";
import { debugLog } from "@/lib/debug";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { canRolesPerformWithRules } from "@/lib/permissions";

export const dynamic = 'force-dynamic';

// Helper to check if user is admin (Product Ops or similar)
// For now, we'll assume any authenticated user can read, but only specific roles can write.
// TODO: refine RBAC.

async function getHandler(req: NextRequest) {
    console.log("GET /api/settings called");
    try {
        // Check authentication (supports both Supabase auth and magic link)
        const supabase = createClient();
        const userEmail = await getAuthenticatedUserEmail();
        
        if (!userEmail) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Capability: settings.read
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
            .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            return NextResponse.json({ error: "Failed to fetch user profile", details: userError.message }, { status: 500 });
        }
        
        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.read', rules);
        if (!ok) {
            return NextResponse.json({ error: 'Forbidden: You do not have permission to view settings' }, { status: 403 });
        }

        const settings = await getSettings();
        return NextResponse.json(settings);
    } catch (error: any) {
        console.error("Error fetching settings:", error);
        return NextResponse.json(
            { 
                error: "Failed to fetch settings",
                details: error?.message || String(error)
            },
            { status: 500 }
        );
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);

async function patchHandler(req: NextRequest) {
    try {
        const supabase = createClient();
        const userEmail = await getAuthenticatedUserEmail();

        if (!userEmail) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Capability: settings.update
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', userEmail)
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

        const body = await req.json();
        console.log("PATCH /api/settings - Request body:", JSON.stringify(body, null, 2));
        debugLog({ location: 'api/settings/route.ts:PATCH', message: 'API received settings update', data: { hasAhaFields: 'aha_fields_to_load' in body, ahaFieldsFromRequest: body.aha_fields_to_load, hasDuplicatesInRequest: body.aha_fields_to_load ? new Set(body.aha_fields_to_load).size !== body.aha_fields_to_load.length : false }, hypothesisId: 'D' });

        // Validate body if necessary (e.g. ensure thresholds are 0-1)

        const updated = await updateSettings(body);
        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Error updating settings:", error);
        console.error("Error details:", {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            stack: error?.stack
        });
        return NextResponse.json(
            { 
                error: "Failed to update settings",
                details: error?.message || String(error),
                code: error?.code || null
            },
            { status: 500 }
        );
    }
}

export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
