import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateProfileSchema = z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    avatar_url: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    // Remove undefined fields before sending to Supabase
    const updateData = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    );
    // If name components are provided, construct full name
    // If name components are provided, construct full name without assigning null
    if (updateData.first_name || updateData.last_name) {
        const fullName = `${updateData.first_name || ""} ${updateData.last_name || ""}`.trim();
        if (fullName) {
            updateData.name = fullName;
        }
    }
    // If avatar_url is provided, ensure it's stored as is (could add validation later)
    if (updateData.avatar_url) {
        // No additional processing needed currently
    }

    // Update app_user table where email matches
    const { data: updatedUser, error } = await supabase
        .from("app_user")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("email", user.email)
        .select()
        .single();

    if (error) {
        // Handle case where user profile doesn't exist yet
        if (error.code === 'PGRST116') {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        console.error("Error updating profile:", error);
        return NextResponse.json({ error: "Failed to update profile", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: updatedUser });
}

export async function GET(req: NextRequest) {
    // AUTH DISABLED: Return mock superadmin
    const { getMockSuperAdminProfile } = await import('@/lib/auth-mock');
    return NextResponse.json({ user: getMockSuperAdminProfile() });
    
    /* AUTH DISABLED
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const { data: profile, error } = await supabase
        .from("app_user")
        .select("*")
        .eq("email", user.email)
        .single();

    if (error) {
        // Handle case where user profile doesn't exist yet
        if (error.code === 'PGRST116') {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to fetch profile", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: profile });
    */
}
