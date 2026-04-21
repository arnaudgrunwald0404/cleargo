import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";
import { toDateOnlyString } from "@/lib/date-utils";

async function getHandler(request: NextRequest) {
    try {
        const supabase = createClient();

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

        // Filter by context if the column exists (added by launches migration)
        query = query.eq("context", "release");

        // Filter out archived releases by default (unless include_archived=true)
        if (!includeArchived) {
            query = query.eq("archived", false);
        }

        let { data, error } = await query.order("launch_date", { ascending: true });

        // If error is about missing context or archived column, retry without those filters
        if (error && error.message && error.message.includes("does not exist")) {
            console.warn("Column missing, retrying without context/archived filters:", error.message);
            let retryQuery = supabase
                .from("release_schedule")
                .select("*");
            // Only add filters for columns that aren't the ones causing the error
            if (!error.message.includes("context")) {
                retryQuery = retryQuery.eq("context", "release");
            }
            if (!includeArchived && !error.message.includes("archived")) {
                retryQuery = retryQuery.eq("archived", false);
            }
            const retryResult = await retryQuery.order("launch_date", { ascending: true });
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            console.error("Error fetching releases:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        const rows = (data || []).map((r: any) => ({
            ...r,
            launch_date: toDateOnlyString(r.launch_date) ?? r.launch_date,
        }));
        return NextResponse.json(rows);
    } catch (error: any) {
        console.error("Error in GET /api/releases:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);

async function postHandler(request: NextRequest) {
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
        
        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'releases.manage', rules);
        if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

        const body = await request.json();

        const { release_name, launch_date, cohort2_date } = body;

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

        const normalizedDate = toDateOnlyString(parsedDate) ?? parsedDate;
        console.log("Attempting to upsert release:", { release_name, launch_date: normalizedDate });

        // Try composite unique first (post-launches migration), fall back to release_name only
        let data, error;
        const row: Record<string, unknown> = {
            release_name,
            launch_date: normalizedDate,
            updated_at: new Date().toISOString(),
            ...(cohort2_date ? { cohort2_date: toDateOnlyString(cohort2_date) ?? cohort2_date } : {}),
        };

        // Try with context column (launches migration applied)
        const attempt1 = await supabase
            .from("release_schedule")
            .upsert(
                { ...row, context: 'release' },
                { onConflict: "release_name,context" }
            )
            .select()
            .single();

        if (attempt1.error && attempt1.error.code === '42P10') {
            // Composite constraint doesn't exist yet — fall back to release_name only
            const attempt2 = await supabase
                .from("release_schedule")
                .upsert(row, { onConflict: "release_name" })
                .select()
                .single();
            data = attempt2.data;
            error = attempt2.error;
        } else {
            data = attempt1.data;
            error = attempt1.error;
        }

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

export const POST = withRateLimit(postHandler, RATE_LIMITS.default);

