import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";

export async function POST(request: NextRequest) {
    try {
        const supabase = createClient();
        
        // Check authentication
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Capability: releases.manage
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
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releases.manage', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();
        const { ids } = body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json(
                { error: "ids array is required and must not be empty" },
                { status: 400 }
            );
        }

        // Validate all IDs are numbers
        const numericIds = ids.map(id => {
            const numId = typeof id === 'string' ? parseInt(id, 10) : id;
            if (isNaN(numId)) {
                throw new Error(`Invalid ID: ${id}`);
            }
            return numId;
        });

        // Delete all releases in batch
        const { error } = await supabase
            .from("release_schedule")
            .delete()
            .in("id", numericIds);

        if (error) {
            console.error("Error batch deleting releases:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ 
            success: true, 
            deleted_count: numericIds.length 
        });
    } catch (error: any) {
        console.error("Error in POST /api/releases/batch-delete:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
