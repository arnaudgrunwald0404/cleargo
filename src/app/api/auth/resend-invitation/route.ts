import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { createToken } from "@/lib/jwt";
import { markTokenSent, canSendEmail } from "@/lib/tokenStore";
import { resend, EMAIL_SENDER } from "@/lib/email/client";
import { getInviteEmail } from "@/lib/email/templates";
import { getSettings } from "@/lib/settings-db";
import { INVITE_EMAIL_LINK } from "@/lib/constants/settings";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const resendInvitationSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/resend-invitation
 * Resends an invitation email to a user
 * This endpoint is public (no auth required) to allow users with expired tokens to request new ones
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resendInvitationSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Check if MAGIC_LINK_SECRET is configured
    if (!process.env.MAGIC_LINK_SECRET) {
      console.error("MAGIC_LINK_SECRET is not configured");
      return NextResponse.json(
        { error: "Magic link secret is not configured" },
        { status: 500 }
      );
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return NextResponse.json(
        { error: "Email service is not configured" },
        { status: 500 }
      );
    }

    // Check cooldown (1 minute)
    const okToSend = await canSendEmail(email, 60000);
    if (!okToSend) {
      return NextResponse.json(
        { error: "Please wait before requesting another invitation" },
        { status: 429 }
      );
    }

    // Check if user exists in app_user table
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey
    );

    const { data: user, error: userError } = await adminClient
      .from("app_user")
      .select("id, email, first_name")
      .eq("email", email.toLowerCase())
      .single();

    if (userError || !user) {
      // Don't reveal if user exists or not for security
      // But still return success to prevent email enumeration
      return NextResponse.json({
        success: true,
        message: "If an account exists for this email, a new invitation has been sent.",
      });
    }

    // Generate new magic link
    const jti = randomUUID();
    const expiresIn = "12h";
    const token = await createToken(
      { email: user.email, jti, t: "magic" },
      expiresIn
    );

    // Calculate expiration date (12 hours from now)
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    // Mark token as sent in database
    await markTokenSent(jti, user.email, expiresAt);

    const inviteLink = INVITE_EMAIL_LINK;

    // Get email templates from settings
    const settings = await getSettings();
    const customTemplate = {
      subject: settings.email_template_invite_subject,
      html: settings.email_template_invite_html,
    };

    // Extract email from EMAIL_SENDER
    let senderEmail = "noreply@info.tacticalsync.com";
    if (process.env.EMAIL_SENDER) {
      const emailMatch = process.env.EMAIL_SENDER.match(/<(.+)>/);
      senderEmail = emailMatch ? emailMatch[1] : process.env.EMAIL_SENDER;
    }
    const formattedSender = `ClearGO <${senderEmail}>`;

    // Send email
    const emailContent = await getInviteEmail(user.first_name, inviteLink, customTemplate);

    const emailResponse = await resend.emails.send({
      from: formattedSender,
      to: user.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    // Check for Resend API errors
    if (emailResponse.error) {
      console.error("Resend API error:", emailResponse.error);
      return NextResponse.json(
        {
          error: "Failed to send invitation email",
          details: emailResponse.error.message || JSON.stringify(emailResponse.error),
        },
        { status: 500 }
      );
    }

    // Verify email was sent successfully
    if (!emailResponse.data || !emailResponse.data.id) {
      console.error("Unexpected Resend response:", emailResponse);
      return NextResponse.json(
        {
          error: "Failed to send invitation email",
          details: "Email service returned an unexpected response",
        },
        { status: 500 }
      );
    }

    console.log("Invitation resent successfully:", {
      emailId: emailResponse.data.id,
      to: user.email,
    });

    return NextResponse.json({
      success: true,
      message: "A new invitation has been sent to your email address.",
    });
  } catch (error: any) {
    console.error("Error in POST /api/auth/resend-invitation:", error);
    return NextResponse.json(
      {
        error: "Failed to resend invitation",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
