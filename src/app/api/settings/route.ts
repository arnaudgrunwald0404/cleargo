import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/settings-db";
import { createClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

// Helper to check if user is admin (Product Ops or similar)
// For now, we'll assume any authenticated user can read, but only specific roles can write.
// TODO: refine RBAC.

export async function GET(req: NextRequest) {
    console.log("GET /api/settings called");
    try {
        const settings = await getSettings();
        return NextResponse.json(settings);
    } catch (error) {
        console.error("Error fetching settings:", error);
        return NextResponse.json(
            { error: "Failed to fetch settings" },
            { status: 500 }
        );
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Capability: settings.update
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
            return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
            throw userError;
        }
        
        const { canRolesPerform } = await import('@/lib/permissions');
        const ok = await canRolesPerform((me?.roles as string[]) || [], 'settings.update');
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await req.json();
        console.log("PATCH /api/settings - Request body:", JSON.stringify(body, null, 2));

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
