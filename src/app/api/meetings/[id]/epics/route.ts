import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createClient();
        const body = await request.json();
        const { epic_ids } = body;

        if (!Array.isArray(epic_ids)) {
            return NextResponse.json(
                { error: "epic_ids must be an array" },
                { status: 400 }
            );
        }

        // Check if meeting_epic table exists by trying to query it
        const { error: tableCheckError } = await supabase
            .from("meeting_epic")
            .select("id")
            .limit(1);

        if (tableCheckError && (tableCheckError.message?.includes('relation') || tableCheckError.code === '42P01' || tableCheckError.code === 'PGRST')) {
            // Table doesn't exist - fallback to legacy linked_epic_id field
            if (epic_ids.length > 1) {
                return NextResponse.json(
                    { error: "Multiple epic linking requires migration 0021. Please run the migration or link only one epic at a time." },
                    { status: 400 }
                );
            }

            // Use legacy linked_epic_id field for single epic
            const { error: updateError } = await supabase
                .from("meeting")
                .update({
                    linked_epic_id: epic_ids.length > 0 ? epic_ids[0] : null,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", params.id);

            if (updateError) {
                console.error("Error updating meeting:", updateError);
                return NextResponse.json(
                    { error: updateError.message },
                    { status: 500 }
                );
            }

            return NextResponse.json({ success: true });
        }

        // Delete existing links
        const { error: deleteError } = await supabase
            .from("meeting_epic")
            .delete()
            .eq("meeting_id", params.id);

        if (deleteError) {
            console.error("Error deleting meeting-epic links:", deleteError);
            return NextResponse.json(
                { error: deleteError.message },
                { status: 500 }
            );
        }

        // Insert new links
        if (epic_ids.length > 0) {
            const links = epic_ids.map((epicId: string) => ({
                meeting_id: params.id,
                epic_id: epicId,
            }));

            const { error: insertError } = await supabase
                .from("meeting_epic")
                .insert(links);

            if (insertError) {
                console.error("Error inserting meeting-epic links:", insertError);
                return NextResponse.json(
                    { error: insertError.message },
                    { status: 500 }
                );
            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error in PUT /api/meetings/[id]/epics:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("meeting_epic")
            .select("epic_id, epic:epic_id(id, name)")
            .eq("meeting_id", params.id);

        if (error) {
            console.error("Error fetching meeting epics:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ epic_ids: data?.map(item => item.epic_id) || [] });
    } catch (error: any) {
        console.error("Error in GET /api/meetings/[id]/epics:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

