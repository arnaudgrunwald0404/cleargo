import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUserEmail } from "@/lib/api-auth";
import { isSuperAdmin } from "@/lib/auth-helpers";
import { getSlackClient } from "@/lib/slack/client";
import { syncUserSlackHandle, logNotification } from "@/lib/slack/notifications";

export const dynamic = "force-dynamic";

const FEEDBACK_STATUSES = [
  "unread",
  "received",
  "need_more_info",
  "considering",
  "in_progress",
  "completed",
  "no_go",
] as const;

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    unread: "Unread",
    received: "Received",
    need_more_info: "Need More Info",
    considering: "Considering",
    in_progress: "Go ;)",
    completed: "Completed",
    no_go: "No Go ;(",
  };
  return labels[status] ?? status;
}

// PATCH - Update feedback: status (superadmin only, notifies author via Slack) or feedback_text (own only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> }
) {
  try {
    const { feedbackId } = await params;
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    if (typeof body?.status === "string") {
      const status = body.status.trim().toLowerCase();
      if (!FEEDBACK_STATUSES.includes(status as any)) {
        return NextResponse.json(
          { error: "Invalid status", allowed: [...FEEDBACK_STATUSES] },
          { status: 400 }
        );
      }
      if (!isSuperAdmin(userEmail)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const supabase = createClient();
      let existing: { id: string; feedback_text: string; created_by_id: string | null; status?: string } | null = null;
      let previousStatus = "unread";

      const { data: withStatus, error: fetchWithStatus } = await supabase
        .from("feedback")
        .select("id, feedback_text, status, created_by_id")
        .eq("id", feedbackId)
        .single();

      if (!fetchWithStatus && withStatus) {
        existing = withStatus as any;
        previousStatus = (existing?.status ?? "unread");
      } else {
        const { data: withoutStatus, error: fetchWithout } = await supabase
          .from("feedback")
          .select("id, feedback_text, created_by_id")
          .eq("id", feedbackId)
          .single();
        if (fetchWithout || !withoutStatus) {
          return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
        }
        existing = withoutStatus as any;
      }

      if (!existing) {
        return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
      }

      const { data: updater } = await supabase
        .from("app_user")
        .select("id")
        .eq("email", userEmail)
        .single();

      const updatePayload: Record<string, unknown> = {
        status,
        status_updated_at: new Date().toISOString(),
        status_updated_by_id: updater?.id ?? null,
      };

      const { data: updated, error: updateError } = await supabase
        .from("feedback")
        .update(updatePayload)
        .eq("id", feedbackId)
        .select()
        .maybeSingle();

      if (updateError) {
        if (updateError.message?.includes("column") && updateError.message?.includes("does not exist")) {
          return NextResponse.json(
            { error: "Feedback status columns are not installed. Run the migration that adds feedback.status." },
            { status: 503 }
          );
        }
        throw updateError;
      }
      if (!updated) {
        return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
      }

      let authorEmail: string | undefined;
      let authorSlackHandle: string | undefined;
      if (existing.created_by_id) {
        const { data: author } = await supabase
          .from("app_user")
          .select("email, slack_handle")
          .eq("id", existing.created_by_id)
          .single();
        authorEmail = author?.email;
        authorSlackHandle = author?.slack_handle;
      }
      let slackNotificationSent = false;
      if (authorEmail && previousStatus !== status) {
        try {
          let slackHandle = authorSlackHandle;
          if (!slackHandle) {
            slackHandle = (await syncUserSlackHandle(authorEmail)) ?? undefined;
          }
          if (slackHandle) {
            const client = getSlackClient();
            const channel = await client.openConversation(slackHandle);
            const snippet = (existing.feedback_text || "").slice(0, 50);
            const quote = snippet.length >= 50 ? `"${snippet}..."` : `"${snippet}"`;
            const text =
              `This is to let you know that we have received your feedback: ${quote}\n` +
              `We have changed its status from *${statusLabel(previousStatus)}* to *${statusLabel(status)}*. 👍✨`;
            const response = await client.postMessage({
              channel,
              text,
            });
            slackNotificationSent = true;
            await logNotification({
              user_id: existing.created_by_id ?? undefined,
              launch_id: (updated as any).epic_id ?? undefined,
              type: "feedback_status_update",
              payload: {
                feedback_id: feedbackId,
                previous_status: previousStatus,
                new_status: status,
                author_email: authorEmail,
              },
              delivery_channel: "slack",
              status: "sent",
              slack_ts: response.ts ?? undefined,
              slack_channel: channel,
            });
          }
        } catch (slackErr: any) {
          console.error("Failed to send feedback status Slack notification:", slackErr);
          await logNotification({
            user_id: existing.created_by_id ?? undefined,
            launch_id: (updated as any).epic_id ?? undefined,
            type: "feedback_status_update",
            payload: {
              feedback_id: feedbackId,
              previous_status: previousStatus,
              new_status: status,
              author_email: authorEmail,
            },
            delivery_channel: "slack",
            status: "failed",
            error: slackErr?.message ?? String(slackErr),
          });
        }
      }

      return NextResponse.json({ ...updated, slack_notification_sent: slackNotificationSent });
    }

    const { feedback_text } = body;
    if (feedback_text === undefined || feedback_text === null) {
      return NextResponse.json({ error: "feedback_text or status is required" }, { status: 400 });
    }

    const supabase = createClient();
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
      return NextResponse.json({ error: "You can only edit your own feedback" }, { status: 403 });
    }

    const trimmed = typeof feedback_text === "string" ? feedback_text.trim() : "";
    if (!trimmed) {
      return NextResponse.json({ error: "feedback_text cannot be empty" }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("feedback")
      .update({ feedback_text: trimmed })
      .eq("id", feedbackId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Error updating feedback:", error);
    return NextResponse.json({ error: error.message || "Failed to update feedback" }, { status: 500 });
  }
}

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

