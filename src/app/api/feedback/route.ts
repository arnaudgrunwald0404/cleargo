import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";
import { notifySuperAdminsOfFeedback } from "@/lib/slack/notifications";

export const dynamic = "force-dynamic";

// GET - Fetch all feedback (epic/process/tool)
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let list: any[] = [];
    const { data: withStatus, error: errWithStatus } = await supabase
      .from("feedback")
      .select("id, feedback_text, feedback_type, created_at, created_by_id, status, status_updated_at, status_updated_by_id, epic_id")
      .order("created_at", { ascending: false });

    if (!errWithStatus) {
      list = withStatus || [];
    } else {
      const { data: withoutStatus, error: errWithout } = await supabase
        .from("feedback")
        .select("id, feedback_text, feedback_type, created_at, created_by_id, epic_id")
        .order("created_at", { ascending: false });
      if (errWithout) throw errWithout;
      list = (withoutStatus || []).map((f: any) => ({ ...f, status: "unread", status_updated_at: null, status_updated_by_id: null }));
    }

    const userIds = [...new Set(list.flatMap((f: any) => [f.created_by_id, f.status_updated_by_id].filter(Boolean)))];
    const epicIds = [...new Set(list.map((f: any) => f.epic_id).filter(Boolean))];

    const [usersRes, epicsRes] = await Promise.all([
      userIds.length ? supabase.from("app_user").select("id, email, first_name, last_name, avatar_url").in("id", userIds) : { data: [] },
      epicIds.length ? supabase.from("epic").select("id, name").in("id", epicIds) : { data: [] },
    ]);

    const usersById = new Map((usersRes.data || []).map((u: any) => [u.id, u]));
    const epicsById = new Map((epicsRes.data || []).map((e: any) => [e.id, e]));

    const result = list.map((f: any) => ({
      ...f,
      epic: f.epic_id ? epicsById.get(f.epic_id) ?? null : null,
      created_by: f.created_by_id ? usersById.get(f.created_by_id) ?? null : null,
      status_updated_by: f.status_updated_by_id ? usersById.get(f.status_updated_by_id) ?? null : null,
    }));

    return NextResponse.json(result);
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

    await notifySuperAdminsOfFeedback({
      feedbackId: feedback.id,
      feedbackText: feedback.feedback_text,
      feedbackType: normalizedType || undefined,
      epicId: feedback.epic_id ?? undefined,
      authorEmail: userEmail,
    }).catch((e) => {
      console.error('Feedback created but super admin notification failed:', e?.message ?? e);
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (error: any) {
    console.error("Error creating feedback:", error);
    return NextResponse.json({ error: error.message || "Failed to create feedback" }, { status: 500 });
  }
}

