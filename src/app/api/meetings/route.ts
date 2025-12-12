import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
    try {
        // Use direct PostgREST request - Supabase JS client has issues with JWT keys
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        const { searchParams } = new URL(request.url);
        const epicId = searchParams.get("epicId");
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        if (serviceRoleKey && supabaseUrl) {
            try {
                // Build PostgREST select query with joins
                // PostgREST syntax: foreign_key_table(id,name) for foreign keys
                const selectQuery = `*,epic_id(id,name),linked_epic_id(id,name),created_by(id,email,name),meeting_transcript(id,transcript_text,uploaded_at),meeting_snippet(id,snippet_text,criterion_id,epic_id,relevance_score),meeting_epic(epic_id(id,name))`;
                
                // Build query params
                const params = new URLSearchParams({
                    select: selectQuery,
                    order: 'meeting_date.desc'
                });

                if (epicId) {
                    params.append('or', `(epic_id.eq.${epicId},linked_epic_id.eq.${epicId})`);
                }
                if (startDate) {
                    params.append('meeting_date', `gte.${startDate}`);
                }
                if (endDate) {
                    params.append('meeting_date', `lte.${endDate}`);
                }

                const response = await fetch(`${supabaseUrl}/rest/v1/meeting?${params.toString()}`, {
                    method: 'GET',
                    headers: {
                        'apikey': serviceRoleKey,
                        'Authorization': `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    return NextResponse.json({ meetings: data || [] });
                } else if (response.status === 404 || response.status === 400) {
                    // Try without linked_epics if it fails
                    const simpleSelectQuery = `*,epic_id(id,name),linked_epic_id(id,name),created_by(id,email,name),meeting_transcript(id,transcript_text,uploaded_at),meeting_snippet(id,snippet_text,criterion_id,epic_id,relevance_score)`;
                    const simpleParams = new URLSearchParams({
                        select: simpleSelectQuery,
                        order: 'meeting_date.desc'
                    });

                    if (epicId) {
                        simpleParams.append('or', `(epic_id.eq.${epicId},linked_epic_id.eq.${epicId})`);
                    }
                    if (startDate) {
                        simpleParams.append('meeting_date', `gte.${startDate}`);
                    }
                    if (endDate) {
                        simpleParams.append('meeting_date', `lte.${endDate}`);
                    }

                    const retryResponse = await fetch(`${supabaseUrl}/rest/v1/meeting?${simpleParams.toString()}`, {
                        method: 'GET',
                        headers: {
                            'apikey': serviceRoleKey,
                            'Authorization': `Bearer ${serviceRoleKey}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=representation'
                        }
                    });

                    if (retryResponse.ok) {
                        const data = await retryResponse.json();
                        return NextResponse.json({ meetings: data || [] });
                    }
                }
            } catch (directError: any) {
                console.warn('Direct PostgREST request error:', directError?.message);
            }
        }

        // Fallback to Supabase client
        const supabase = createClient();
        const selectQuery = `
            *,
            epic:epic_id(id, name),
            linked_epic:linked_epic_id(id, name),
            created_by_user:created_by(id, email, name),
            transcript:meeting_transcript(id, transcript_text, uploaded_at),
            snippets:meeting_snippet(id, snippet_text, criterion_id, epic_id, relevance_score)
        `;

        let query = supabase
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

        const { data, error } = await query;

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
        const supabase = createClient();
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

