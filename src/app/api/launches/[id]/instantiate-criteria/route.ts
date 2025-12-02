import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { instantiateCriteriaForLaunch } from "@/lib/db/launches";

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createClient();
        
        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get launch to determine tier
        const { data: launch, error: launchError } = await supabase
            .from("launch")
            .select("id, tier")
            .eq("id", params.id)
            .single();

        if (launchError || !launch) {
            return NextResponse.json(
                { error: "Launch not found" },
                { status: 404 }
            );
        }

        // Instantiate criteria for this launch using the same SSR client (guarantees same project)
        await instantiateCriteriaForLaunch(launch.id, launch.tier, supabase as any);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error instantiating criteria:", error);
        return NextResponse.json(
            { error: error.message || "Failed to instantiate criteria" },
            { status: 500 }
        );
    }
}


