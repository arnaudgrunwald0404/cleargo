import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { transcript_text } = body;

        if (!transcript_text || typeof transcript_text !== "string") {
            return NextResponse.json(
                { error: "transcript_text is required" },
                { status: 400 }
            );
        }

        // Get user ID from app_user table
        const { data: appUser } = await supabase
            .from("app_user")
            .select("id")
            .eq("email", user.email)
            .single();

        if (!appUser) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Upsert transcript (update if exists, insert if not)
        const { data, error } = await supabase
            .from("meeting_transcript")
            .upsert(
                {
                    meeting_id: id,
                    transcript_text,
                    uploaded_by: appUser.id,
                    uploaded_at: new Date().toISOString(),
                },
                {
                    onConflict: "meeting_id",
                }
            )
            .select()
            .single();

        if (error) {
            console.error("Error saving transcript:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ transcript: data });
    } catch (error: any) {
        console.error("Error in POST /api/meetings/[id]/transcript:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}




