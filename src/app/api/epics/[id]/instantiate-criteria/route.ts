import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { instantiateReleaseCriteriaForEpic } from "@/lib/db/epics";

export async function POST(
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

        // Get epic to determine tier
        const { data: epic, error: epicError } = await supabase
            .from("epic")
            .select("id, tier")
            .eq("id", id)
            .single();

        // Handle case where epic doesn't exist (PGRST116)
        if (epicError) {
            if (epicError.code === 'PGRST116') {
                return NextResponse.json(
                    { error: "Epic not found" },
                    { status: 404 }
                );
            }
            console.error("Error fetching epic:", epicError);
            return NextResponse.json(
                { error: "Failed to fetch epic" },
                { status: 500 }
            );
        }

        if (!epic) {
            return NextResponse.json(
                { error: "Epic not found" },
                { status: 404 }
            );
        }

        // Validate tier before instantiating
        if (!epic.tier) {
            console.error(`Epic ${epic.id} has no tier set`);
            return NextResponse.json(
                { error: "Epic tier is not set. Please set a tier before instantiating criteria." },
                { status: 400 }
            );
        }

        // Instantiate criteria for this epic using the same SSR client (guarantees same project)
        await instantiateReleaseCriteriaForEpic(epic.id, epic.tier, supabase as any);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error instantiating criteria:", error);
        console.error("Error details:", {
            message: error?.message,
            code: error?.code,
            details: error?.details,
            hint: error?.hint,
            stack: error?.stack
        });
        return NextResponse.json(
            { 
                error: error.message || "Failed to instantiate criteria",
                details: error?.details || error?.hint || undefined
            },
            { status: 500 }
        );
    }
}




