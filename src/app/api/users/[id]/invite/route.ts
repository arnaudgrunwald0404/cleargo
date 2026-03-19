import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createToken } from "@/lib/jwt";
import { canSendEmail, markTokenSent } from "@/lib/tokenStore";
import { resend, EMAIL_SENDER } from "@/lib/email/client";
import { getInviteEmail, getRemindEmail } from "@/lib/email/templates";
import { getSettings, getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";
import { INVITE_EMAIL_LINK } from "@/lib/constants/settings";

const inviteSchema = z.object({
  type: z.enum(["invite", "remind"]).default("invite"),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });

    // Capability check: users.invite.send
    const { data: me, error: userError } = await supabase
      .from("app_user")
      .select("roles")
      .eq("email", user.email)
      .single();
    
    // Handle case where user doesn't exist in app_user table
    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }
    
    const rules = await getEffectivePermissionRules();
    const ok = canRolesPerformWithRules((me?.roles as string[]) || [], "users.invite.send", rules);
    if (!ok) return forbid();

    // Get sending user's profile to construct sender name
    const { data: sendingUser, error: sendingUserError } = await supabase
      .from("app_user")
      .select("first_name, last_name")
      .eq("email", user.email)
      .single();
    
    // Handle case where user doesn't exist in app_user table
    if (sendingUserError && sendingUserError.code === 'PGRST116') {
      // Use default sender name if user profile not found
      console.warn('Sending user profile not found, using default sender name');
    }

    // Construct sender name: "First via ClearGO <email@domain.com>"
    const senderName = sendingUser?.first_name
      ? `${sendingUser.first_name} via ClearGO`
      : "ClearGO";
    
    // Extract email from EMAIL_SENDER (handles both "Name <email>" and "email" formats)
    let senderEmail = "noreply@info.tacticalsync.com";
    if (process.env.EMAIL_SENDER) {
      const emailMatch = process.env.EMAIL_SENDER.match(/<(.+)>/);
      senderEmail = emailMatch ? emailMatch[1] : process.env.EMAIL_SENDER;
    }
    
    const formattedSender = `${senderName} <${senderEmail}>`;

    const body = await req.json().catch(() => ({}));
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { type } = parsed.data;

    // Get user from app_user table
    const { data: targetUser, error: fetchError } = await supabase
      .from("app_user")
      .select("*")
      .eq("id", userId)
      .single();

    if (fetchError || !targetUser) {
      return NextResponse.json(
        { error: "User not found", details: fetchError?.message },
        { status: 404 }
      );
    }

    if (!targetUser.email) {
      return NextResponse.json(
        { error: "User email is missing" },
        { status: 400 }
      );
    }

    // Check if user has logged in before (to determine if it's invite or remind)
    // Use new secret key, fallback to legacy service_role key for backward compatibility
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    
    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey
    );
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const authUser = authUsers?.users.find(
      (u) => u.email?.toLowerCase() === targetUser.email?.toLowerCase()
    );

    const hasLoggedIn = !!authUser?.last_sign_in_at;
    
    // Only send invites to users who haven't logged in
    // Reminders are only sent when explicitly requested via type="remind"
    if (hasLoggedIn && type !== "remind") {
      return NextResponse.json(
        { error: "User has already logged in. Use 'remind' type to send a reminder." },
        { status: 400 }
      );
    }
    
    const emailType = type === "remind" ? "remind" : "invite";

    // Check cooldown (longer cooldown for reminders to prevent spam)
    const cooldownMs = emailType === "remind" ? 300000 : 60000; // 5 min for remind, 1 min for invite
    const okToSend = await canSendEmail(targetUser.email, cooldownMs);
    if (!okToSend) {
      return NextResponse.json(
        { error: "Please wait before sending another email" },
        { status: 429 }
      );
    }

    // Check if MAGIC_LINK_SECRET is configured
    if (!process.env.MAGIC_LINK_SECRET) {
      console.error("MAGIC_LINK_SECRET is not configured");
      return NextResponse.json(
        { error: "Magic link secret is not configured. Please set MAGIC_LINK_SECRET environment variable." },
        { status: 500 }
      );
    }

    // Generate magic link
    const jti = randomUUID();
    const expiresIn = "12h";
    const token = await createToken(
      { email: targetUser.email, jti, t: "magic" },
      expiresIn
    );

    // Calculate expiration date (12 hours from now)
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    // Mark token as sent in database before sending email
    await markTokenSent(jti, targetUser.email, expiresAt);

    const inviteLink = INVITE_EMAIL_LINK;

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return NextResponse.json(
        { error: "Email service is not configured. Please set RESEND_API_KEY." },
        { status: 500 }
      );
    }

    // Get email templates from settings
    const settings = await getSettings();
    const customTemplate = emailType === "remind"
      ? {
          subject: settings.email_template_remind_subject,
          html: settings.email_template_remind_html,
        }
      : {
          subject: settings.email_template_invite_subject,
          html: settings.email_template_invite_html,
        };

    // Send email
    const emailContent =
      emailType === "remind"
        ? await getRemindEmail(targetUser.first_name, inviteLink, customTemplate)
        : await getInviteEmail(targetUser.first_name, inviteLink, customTemplate);

    const data = await resend.emails.send({
      from: formattedSender,
      to: targetUser.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    // Check for Resend API errors
    if (data.error) {
      console.error("Resend API error:", data.error);
      let errorMessage = data.error.message || JSON.stringify(data.error);
      
      // Provide helpful guidance for common errors
      if (errorMessage.includes("domain is not verified") || errorMessage.includes("not verified")) {
        errorMessage = `${errorMessage}. Please verify your domain at https://resend.com/domains or use Resend's test domain (onboarding@resend.dev) for development.`;
      }
      
      return NextResponse.json(
        {
          error: "Failed to send email",
          details: errorMessage,
        },
        { status: 500 }
      );
    }

    // Verify email was sent successfully
    if (!data.data || !data.data.id) {
      console.error("Unexpected Resend response:", data);
      return NextResponse.json(
        {
          error: "Failed to send email",
          details: "Email service returned an unexpected response",
        },
        { status: 500 }
      );
    }

    console.log("Email sent successfully:", {
      emailId: data.data.id,
      to: targetUser.email,
      type: emailType,
    });

    return NextResponse.json({
      success: true,
      type: emailType,
      message: `${
        emailType === "remind" ? "Reminder" : "Invitation"
      } email sent successfully`,
      emailId: data.data.id,
    });
  } catch (error: any) {
    console.error("Error in POST /api/users/[id]/invite:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: "Failed to send invitation",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

