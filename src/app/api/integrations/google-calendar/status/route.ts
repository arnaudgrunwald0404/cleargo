import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const supabase = createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get user ID from app_user table
        const { data: appUser } = await supabase
            .from("app_user")
            .select("id")
            .eq("email", user.email)
            .single();

        if (!appUser) {
            return NextResponse.json({ connected: false });
        }

        // Check for active integration
        const { data: integration } = await supabase
            .from("google_calendar_integrations")
            .select("id")
            .eq("user_id", appUser.id)
            .eq("is_active", true)
            .single();

        return NextResponse.json({ connected: !!integration });
    } catch (error: any) {
        console.error("Error checking Google Calendar status:", error);
        return NextResponse.json({ connected: false });
    }
}




