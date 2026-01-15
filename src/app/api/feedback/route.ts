import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET - Fetch all feedback (epic/process/tool)
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: feedbacks, error } = await supabase
      .from("feedback")
      .select(`
        id,
        feedback_text,
        feedback_type,
        created_at,
        created_by_id,
        epic:epic_id (
          id,
          name
        ),
        created_by:app_user!created_by_id(email, first_name, last_name, avatar_url)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(feedbacks || []);
  } catch (error: any) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch feedback" }, { status: 500 });
  }
}

// POST - Create new feedback (optionally tied to an epic)
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: appUser, error: userError } = await supabase
      .from("app_user")
      .select("id")
      .eq("email", userEmail)
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { feedback_text, feedback_type, epic_id } = body;

    if (!feedback_text || !feedback_text.trim()) {
      return NextResponse.json({ error: "Feedback text is required" }, { status: 400 });
    }

    const normalizedType = typeof feedback_type === "string" ? feedback_type.toUpperCase() : "";
    if (!["EPIC", "PROCESS", "TOOL"].includes(normalizedType)) {
      return NextResponse.json(
        { error: "feedback_type must be one of: EPIC, PROCESS, TOOL" },
        { status: 400 }
      );
    }

    const epicIdValue = typeof epic_id === "string" && epic_id.trim() ? epic_id.trim() : null;

    const { data: feedback, error } = await supabase
      .from("feedback")
      .insert({
        epic_id: epicIdValue,
        feedback_text: feedback_text.trim(),
        feedback_type: normalizedType,
        created_by_id: appUser.id,
        source: "manual",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(feedback, { status: 201 });
  } catch (error: any) {
    console.error("Error creating feedback:", error);
    return NextResponse.json({ error: error.message || "Failed to create feedback" }, { status: 500 });
  }
}

