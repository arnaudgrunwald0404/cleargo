import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        
        // Check authentication (supports both Supabase auth and magic link)
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

        const { release_name, launch_date } = body;

        const updateData: any = {
            updated_at: new Date().toISOString(),
        };

        if (release_name !== undefined) {
            updateData.release_name = release_name;
        }

        if (launch_date !== undefined) {
            // Parse date - support MM/DD/YYYY format
            let parsedDate: string;
            if (launch_date.includes("/")) {
                const [month, day, year] = launch_date.split("/");
                parsedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
            } else {
                parsedDate = launch_date; // Assume YYYY-MM-DD format
            }
            updateData.launch_date = parsedDate;
        }

        const { data, error } = await supabase
            .from("release_schedule")
            .update(updateData)
            .eq("id", id)
            .select()
            .single();

        if (error) {
            // Handle case where release doesn't exist (PGRST116)
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Release not found' }, { status: 404 });
            }
            console.error("Error updating release:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ error: 'Release not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Error in PATCH /api/releases/[id]:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
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

        const { error } = await supabase
            .from("release_schedule")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("Error deleting release:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error in DELETE /api/releases/[id]:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

