import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);
        const epicId = searchParams.get("epicId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        // Build base select - try with linked_epics first, fallback if table doesn't exist
        let selectQuery = `
            *,
            epic:epic_id(id, name),
            linked_epic:linked_epic_id(id, name),
            created_by_user:created_by(id, email, name),
            transcript:meeting_transcript(id, transcript_text, uploaded_at),
            snippets:meeting_snippet(id, snippet_text, criterion_id, epic_id, relevance_score)
        `;

        // Try to include linked_epics if the junction table exists
        // We'll attempt this and handle errors gracefully
        let query = supabase
            .from("meeting")
            .select(selectQuery + `, linked_epics:meeting_epic(epic:epic_id(id, name))`)
            .order("meeting_date", { ascending: false });

        if (epicId) {
            query = query.or(`epic_id.eq.${epicId},linked_epic_id.eq.${epicId}`);
        }

        if (startDate) {
            query = query.gte("meeting_date", startDate);
        }

        if (endDate) {
            query = query.lte("meeting_date", endDate);
        }

        let { data, error } = await query;

        // If error is due to missing table, retry without linked_epics
        if (error && (error.message?.includes('meeting_epic') || error.message?.includes('relation') || error.code === '42P01' || error.code === 'PGRST')) {
            query = supabase
                .from("meeting")
                .select(selectQuery)
                .order("meeting_date", { ascending: false });

            if (epicId) {
                query = query.or(`epic_id.eq.${epicId},linked_epic_id.eq.${epicId}`);
            }

            if (startDate) {
                query = query.gte("meeting_date", startDate);
            }

            if (endDate) {
                query = query.lte("meeting_date", endDate);
            }

            const retryResult = await query;
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            console.error("Error fetching meetings:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ meetings: data || [] });
    } catch (error: any) {
        console.error("Error in GET /api/meetings:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { title, description, meeting_date, duration_minutes, epic_id, linked_epic_id, calendar_event_id } = body;

        // Get user ID from app_user table
        const { data: appUser } = await supabase
            .from("app_user")
            .select("id")
            .eq("email", user.email)
            .single();

        if (!appUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        const { data, error } = await supabase
            .from("meeting")
            .insert({
                title,
                description,
                meeting_date,
                duration_minutes,
                epic_id: epic_id || null,
                linked_epic_id: linked_epic_id || null,
                calendar_event_id: calendar_event_id || null,
                created_by: appUser.id,
            })
            .select()
            .single();

        if (error) {
            console.error("Error creating meeting:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ meeting: data });
    } catch (error: any) {
        console.error("Error in POST /api/meetings:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

