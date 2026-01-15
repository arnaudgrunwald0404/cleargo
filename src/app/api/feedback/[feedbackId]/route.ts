import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// DELETE - Delete a product-wide feedback
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> }
) {
  try {
    const { feedbackId } = await params;
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

    const { data: feedback, error: fetchError } = await supabase
      .from("feedback")
      .select("created_by_id")
      .eq("id", feedbackId)
      .single();

    if (fetchError || !feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    if (feedback.created_by_id !== appUser.id) {
      return NextResponse.json({ error: "You can only delete your own feedback" }, { status: 403 });
    }

    const { error: deleteError } = await supabase.from("feedback").delete().eq("id", feedbackId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting feedback:", error);
    return NextResponse.json({ error: error.message || "Failed to delete feedback" }, { status: 500 });
  }
}

