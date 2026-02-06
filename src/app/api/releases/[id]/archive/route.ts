import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        
        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        // Capability: releases.manage
        const { data: me, error: userError } = await supabase
            .from('app_user')
            .select('roles')
            .eq('email', user.email)
            .single();
        
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
        const { archived } = body;

        if (typeof archived !== 'boolean') {
            return NextResponse.json(
                { error: "archived must be a boolean" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase
            .from("release_schedule")
            .update({ 
                archived,
                updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Error updating release archive status:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: 'Release not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Error in PATCH /api/releases/[id]/archive:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

