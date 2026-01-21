import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";
import { randomUUID } from "crypto";
import { createToken } from "@/lib/jwt";
import { canSendEmail, markTokenSent } from "@/lib/tokenStore";
import { resend, EMAIL_SENDER } from "@/lib/email/client";
import { getInviteEmail, getRemindEmail } from "@/lib/email/templates";
import { getSettings } from "@/lib/settings-db";

const bulkInviteSchema = z.object({
  userIds: z.array(z.string().uuid()),
  type: z.enum(["invite", "remind"]).default("invite"),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
    const role = await resolveRole(user.email);
    if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

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
    
    const { canRolesPerform } = await import("@/lib/permissions");
    const ok = await canRolesPerform((me?.roles as string[]) || [], "users.invite.send");
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

    const body = await req.json();
    const parsed = bulkInviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { userIds, type } = parsed.data;

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: "No user IDs provided" },
        { status: 400 }
      );
    }

    // Check if required environment variables are configured
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      return NextResponse.json(
        { error: "Email service is not configured. Please set RESEND_API_KEY." },
        { status: 500 }
      );
    }
    
    if (!process.env.MAGIC_LINK_SECRET) {
      console.error("MAGIC_LINK_SECRET is not configured");
      return NextResponse.json(
        { error: "Magic link secret is not configured. Please set MAGIC_LINK_SECRET environment variable." },
        { status: 500 }
      );
    }

    // Get users from app_user table
    const { data: targetUsers, error: fetchError } = await supabase
      .from("app_user")
      .select("*")
      .in("id", userIds);

    if (fetchError || !targetUsers || targetUsers.length === 0) {
      return NextResponse.json(
        { error: "Users not found", details: fetchError?.message },
        { status: 404 }
      );
    }

  // Get auth users to check login status
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
  const authUserMap = new Map(
    authUsers?.users.map((u) => [
      u.email?.toLowerCase(),
      !!u.last_sign_in_at,
    ]) || []
  );

  // Get email templates from settings
  const settings = await getSettings();

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;

  const results: Array<{
    userId: string;
    email: string;
    success: boolean;
    error?: string;
  }> = [];

  // Send emails to each user
  for (const targetUser of targetUsers) {
    try {
      const hasLoggedIn = authUserMap.get(
        targetUser.email?.toLowerCase() || ""
      );
      
      // Only send invites to users who haven't logged in
      // Skip users who have logged in unless explicitly requesting remind
      if (hasLoggedIn && type !== "remind") {
        results.push({
          userId: targetUser.id,
          email: targetUser.email,
          success: false,
          error: "User has already logged in",
        });
        continue;
      }
      
      const emailType = type === "remind" ? "remind" : "invite";

      // Check cooldown
      const cooldownMs = emailType === "remind" ? 300000 : 60000;
      const okToSend = await canSendEmail(targetUser.email, cooldownMs);
      if (!okToSend) {
        results.push({
          userId: targetUser.id,
          email: targetUser.email,
          success: false,
          error: "Cooldown period not expired",
        });
        continue;
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
      
      const inviteLink = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

      // Get custom template for this email type
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

      const emailResponse = await resend.emails.send({
        from: formattedSender,
        to: targetUser.email,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      // Check for Resend API errors
      if (emailResponse.error) {
        console.error(`Resend API error for ${targetUser.email}:`, emailResponse.error);
        let errorMessage = emailResponse.error.message || JSON.stringify(emailResponse.error);
        
        // Provide helpful guidance for common errors
        if (errorMessage.includes("domain is not verified") || errorMessage.includes("not verified")) {
          errorMessage = `${errorMessage}. Please verify your domain at https://resend.com/domains or use Resend's test domain (onboarding@resend.dev) for development.`;
        }
        
        results.push({
          userId: targetUser.id,
          email: targetUser.email,
          success: false,
          error: errorMessage,
        });
        continue;
      }

      // Verify email was sent successfully
      if (!emailResponse.data || !emailResponse.data.id) {
        console.error(`Unexpected Resend response for ${targetUser.email}:`, emailResponse);
        results.push({
          userId: targetUser.id,
          email: targetUser.email,
          success: false,
          error: "Email service returned an unexpected response",
        });
        continue;
      }

      console.log(`Email sent successfully to ${targetUser.email}:`, emailResponse.data.id);

      results.push({
        userId: targetUser.id,
        email: targetUser.email,
        success: true,
      });
    } catch (error: any) {
      console.error(`Failed to send invite to ${targetUser.email}:`, error);
      results.push({
        userId: targetUser.id,
        email: targetUser.email,
        success: false,
        error: error.message || "Failed to send email",
      });
    }
  }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    return NextResponse.json({
      success: failureCount === 0,
      sent: successCount,
      failed: failureCount,
      results,
    });
  } catch (error: any) {
    console.error("Error in POST /api/users/bulk-invite:", error);
    console.error("Error details:", {
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      {
        error: "Failed to send invitations",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

