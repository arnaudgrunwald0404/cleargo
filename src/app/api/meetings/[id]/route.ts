import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        // Try with linked_epics first, fallback if table doesn't exist
        const selectQuery = `
            *,
            epic:epic_id(id, name),
            linked_epic:linked_epic_id(id, name),
            created_by_user:created_by(id, email, name),
            transcript:meeting_transcript(id, transcript_text, uploaded_at, uploaded_by),
            snippets:meeting_snippet(
                id,
                snippet_text,
                criterion_id,
                epic_id,
                relevance_score,
                context_start,
                context_end,
                criterion:criterion_id(id, label, category)
            )
        `;

        let { data, error } = await supabase
            .from("meeting")
            .select(selectQuery + `, linked_epics:meeting_epic(epic:epic_id(id, name))`)
            .eq("id", id)
            .single();

        // If error is due to missing table, retry without linked_epics
        if (error && (error.message?.includes('meeting_epic') || error.message?.includes('relation') || error.code === '42P01' || error.code === 'PGRST')) {
            const retryResult = await supabase
                .from("meeting")
                .select(selectQuery)
                .eq("id", id)
                .single();
            data = retryResult.data;
            error = retryResult.error;
        }

        if (error) {
            console.error("Error fetching meeting:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ meeting: data });
    } catch (error: any) {
        console.error("Error in GET /api/meetings/[id]:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const body = await request.json();

        const { data, error } = await supabase
            .from("meeting")
            .update({
                ...body,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .select()
            .single();

        if (error) {
            console.error("Error updating meeting:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ meeting: data });
    } catch (error: any) {
        console.error("Error in PATCH /api/meetings/[id]:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { error } = await supabase
            .from("meeting")
            .delete()
            .eq("id", id);

        if (error) {
            console.error("Error deleting meeting:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error in DELETE /api/meetings/[id]:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

