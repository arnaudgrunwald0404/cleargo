import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
    // #region agent log
    const fs = require('fs');
    const logEntry1 = {location:'releases/route.ts:4',message:'GET releases called',data:{url:request.url,hasCookies:request.cookies.getAll().length>0,cookieNames:request.cookies.getAll().map(c=>c.name)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'};
    try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry1) + '\n'); } catch(e) {}
    // #endregion
    try {
        // #region agent log
        const envCheck = {hasSupabaseUrl:!!process.env.NEXT_PUBLIC_SUPABASE_URL,hasPublishableKey:!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,hasAnonKey:!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY};
        const logEntry2 = {location:'releases/route.ts:7',message:'Before createClient - env check',data:envCheck,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry2) + '\n'); } catch(e) {}
        // #endregion
        const supabase = createClient();
        // #region agent log
        const logEntry3 = {location:'releases/route.ts:9',message:'After createClient - before getUser',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'};
        try { fs.appendFileSync('/Users/arnaudgrunwald/AGcodework/cleargo/.cursor/debug.log', JSON.stringify(logEntry3) + '\n'); } catch(e) {}
        // #endregion
        
        // Check authentication (supports both Supabase auth and magic link)
        const userEmail = await getAuthenticatedUserEmail();
        if (!userEmail) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        
        // Check if include_archived query parameter is set
        const { searchParams } = new URL(request.url);
        const includeArchived = searchParams.get('include_archived') === 'true';
        
        let query = supabase
            .from("release_schedule")
            .select("*");
        
        // Filter out archived releases by default (unless include_archived=true)
        // Handle case where archived column doesn't exist yet (migration not applied)
        if (!includeArchived) {
            query = query.eq("archived", false);
        }
        
        let { data, error } = await query.order("launch_date", { ascending: true });

        // If error is about missing archived column, retry without the filter
        if (error && error.message && error.message.includes("archived") && error.message.includes("does not exist")) {
            console.warn("archived column does not exist, fetching all releases without archived filter");
            const retryQuery = supabase
                .from("release_schedule")
                .select("*");
            const retryResult = await retryQuery.order("launch_date", { ascending: true });
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            console.error("Error fetching releases:", error);
            // If error is about missing aha_epic_count column, still return data (migration not run yet)
            if (error.message && error.message.includes("aha_epic_count") && error.message.includes("does not exist")) {
                console.warn("aha_epic_count column does not exist yet - migration may not have been run");
                // Try to fetch without the problematic column by selecting specific columns
                const fallbackQuery = supabase
                    .from("release_schedule")
                    .select("id, release_name, launch_date, archived, created_at, updated_at");
                if (!includeArchived) {
                    fallbackQuery.eq("archived", false);
                }
                const fallbackResult = await fallbackQuery.order("launch_date", { ascending: true });
                if (!fallbackResult.error) {
                    return NextResponse.json(fallbackResult.data || []);
                }
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Log first release to debug aha_epic_count field
        if (data && data.length > 0 && process.env.NODE_ENV === 'development') {
            console.log("Sample release data:", {
                release_name: data[0].release_name,
                has_aha_epic_count: 'aha_epic_count' in data[0],
                aha_epic_count: data[0].aha_epic_count
            });
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
        
        const { canRolesPerform } = await import('@/lib/permissions');
        const ok = await canRolesPerform((me?.roles as string[]) || [], 'releases.manage');
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

