import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    try {
        const supabase = createClient();
        
        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const { data, error } = await supabase
            .from("release_schedule")
            .select("*")
            .order("launch_date", { ascending: true });

        if (error) {
            console.error("Error fetching releases:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data || []);
    } catch (error: any) {
        console.error("Error in GET /api/releases:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = createClient();
        
        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        const body = await request.json();

        const { release_name, launch_date } = body;

        if (!release_name || !launch_date) {
            return NextResponse.json(
                { error: "release_name and launch_date are required" },
                { status: 400 }
            );
        }

        // Parse date - support MM/DD/YYYY format
        let parsedDate: string;
        try {
            if (launch_date.includes("/")) {
                const parts = launch_date.split("/");
                if (parts.length !== 3) {
                    return NextResponse.json(
                        { error: "Invalid date format. Use MM/DD/YYYY" },
                        { status: 400 }
                    );
                }
                const [month, day, year] = parts;
                parsedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
                
                // Validate the date
                const dateObj = new Date(parsedDate);
                if (isNaN(dateObj.getTime())) {
                    return NextResponse.json(
                        { error: "Invalid date. Please check the date format." },
                        { status: 400 }
                    );
                }
            } else {
                parsedDate = launch_date; // Assume YYYY-MM-DD format
            }
        } catch (parseError: any) {
            console.error("Date parsing error:", parseError);
            return NextResponse.json(
                { error: `Date parsing failed: ${parseError.message}` },
                { status: 400 }
            );
        }

        console.log("Attempting to upsert release:", { release_name, launch_date: parsedDate });
        
        const { data, error } = await supabase
            .from("release_schedule")
            .upsert(
                {
                    release_name,
                    launch_date: parsedDate,
                    updated_at: new Date().toISOString(),
                },
                {
                    onConflict: "release_name",
                }
            )
            .select()
            .single();

        if (error) {
            console.error("Error creating/updating release:", error);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            console.error("Error details:", JSON.stringify(error, null, 2));
            
            // Provide more helpful error messages
            let errorMessage = error.message || "Failed to create/update release";
            if (error.code === "42P01") {
                errorMessage = "The release_schedule table does not exist. Please run the migration: supabase/migrations/20251127000000_create_release_schedule.sql";
            } else if (error.code === "42501") {
                errorMessage = "Permission denied. Check RLS policies for release_schedule table.";
            }
            
            return NextResponse.json(
                { 
                    error: errorMessage,
                    code: error.code,
                    details: process.env.NODE_ENV === "development" ? error : undefined
                },
                { status: 500 }
            );
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error("Error in POST /api/releases:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

