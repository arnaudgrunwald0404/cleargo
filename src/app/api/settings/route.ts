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

        // TODO: Add strict role check here (e.g. must be PRODUCT_OPS or ADMIN)
        // For MVP, we'll proceed.

        const body = await req.json();

        // Validate body if necessary (e.g. ensure thresholds are 0-1)

        const updated = await updateSettings(body);
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating settings:", error);
        return NextResponse.json(
            { error: "Failed to update settings" },
            { status: 500 }
        );
    }
}
