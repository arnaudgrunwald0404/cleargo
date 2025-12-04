import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string; lcsId: string } }
) {
    try {
        const supabase = await createClient();
        const body = await request.json();
        const { snippet_id } = body;

        if (!snippet_id) {
            return NextResponse.json(
                { error: "snippet_id is required" },
                { status: 400 }
            );
        }

        // Get the snippet
        const { data: snippet, error: snippetError } = await supabase
            .from("meeting_snippet")
            .select("*")
            .eq("id", snippet_id)
            .single();

        if (snippetError || !snippet) {
            return NextResponse.json(
                { error: "Snippet not found" },
                { status: 404 }
            );
        }

        // Get current notes for this criterion status (using lcsId which is the epic_criterion_status ID)
        const { data: criterionStatus, error: statusError } = await supabase
            .from("epic_criterion_status")
            .select("current_status_notes")
            .eq("id", params.lcsId)
            .eq("epic_id", params.id)
            .single();

        if (statusError) {
            return NextResponse.json(
                { error: "Criterion status not found" },
                { status: 404 }
            );
        }

        // Append snippet to notes
        const existingNotes = criterionStatus?.current_status_notes || "";
        const snippetText = `\n\n[Meeting Snippet] ${snippet.snippet_text}`;
        const newNotes = existingNotes + snippetText;

        // Update the criterion status
        const { data, error } = await supabase
            .from("epic_criterion_status")
            .update({
                current_status_notes: newNotes,
                last_updated_at: new Date().toISOString(),
            })
            .eq("id", params.lcsId)
            .eq("epic_id", params.id)
            .select()
            .single();

        if (error) {
            console.error("Error updating criterion status:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, criterion_status: data });
    } catch (error: any) {
        console.error("Error in POST /api/epics/[id]/criteria/[lcsId]/snippets:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

