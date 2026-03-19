import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";
import { createToken } from "@/lib/jwt";
import { markTokenSent } from "@/lib/tokenStore";
import { resend, EMAIL_SENDER } from "@/lib/email/client";
import { getInviteEmail } from "@/lib/email/templates";
import { getSettings } from "@/lib/settings-db";
import { INVITE_EMAIL_LINK } from "@/lib/constants/settings";
import { z } from "zod";

const extendTokensSchema = z.object({
  sendEmails: z.boolean().default(true),
  extendThresholdHours: z.number().min(0).max(24).default(1), // Extend tokens expiring within this many hours
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * POST /api/admin/extend-invite-tokens
 * Extends validity of invitation tokens by generating new tokens
 * and optionally sending new invitation emails.
 * 
 * Since JWT tokens have expiration encoded in them, we can't extend existing tokens.
 * Instead, we generate new tokens and send new emails.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });

    // Capability check: users.invite.send
    const { data: me, error: userError } = await supabase
      .from("app_user")
      .select("roles")
      .eq("email", user.email)
      .single();

    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) throw userError;

    const rules = await getEffectivePermissionRules();
    const canInvite = canRolesPerformWithRules((me?.roles as string[]) || [], "users.invite.send", rules);
    if (!canInvite) return forbid();

    const body = await req.json().catch(() => ({}));
    const parsed = extendTokensSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { sendEmails, extendThresholdHours } = parsed.data;

    // Check if MAGIC_LINK_SECRET is configured
    if (!process.env.MAGIC_LINK_SECRET) {
      return NextResponse.json(
        { error: "Magic link secret is not configured" },
        { status: 500 }
      );
    }

    // Check if Resend API key is configured (if sending emails)
    if (sendEmails && !process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service is not configured. Please set RESEND_API_KEY." },
        { status: 500 }
      );
    }

    // Use admin client for database operations
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey
    );

    // Get all unused tokens (not yet used)
    const { data: tokens, error: fetchError } = await adminClient
      .from("used_magic_link_tokens")
      .select("*")
      .is("used_at", null)
      .order("sent_at", { ascending: false });

    if (fetchError) {
      console.error("Error fetching tokens:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch tokens", details: fetchError.message },
        { status: 500 }
      );
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No unused tokens found",
        extended: 0,
        errors: 0,
      });
    }

    // Filter tokens that are expired or expiring soon
    const now = new Date();
    const thresholdTime = new Date(now.getTime() + extendThresholdHours * 60 * 60 * 1000);
    
    const tokensToExtend = tokens.filter((token) => {
      const expiresAt = new Date(token.expires_at);
      return expiresAt <= thresholdTime;
    });

    if (tokensToExtend.length === 0) {
      return NextResponse.json({
        success: true,
        message: `No tokens need extension (all are valid for more than ${extendThresholdHours} hour(s))`,
        extended: 0,
        errors: 0,
        totalUnused: tokens.length,
      });
    }

    // Get email settings
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

    let successCount = 0;
    let errorCount = 0;
    const errors: Array<{ email: string; error: string }> = [];

    // Process each token
    for (const token of tokensToExtend) {
      try {
        // Generate new token
        const newJti = randomUUID();
        const expiresIn = "12h";
        const newToken = await createToken(
          { email: token.email, jti: newJti, t: "magic" },
          expiresIn
        );

        // Calculate new expiration date (12 hours from now)
        const newExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

        // Mark old token as used (so it can't be used anymore)
        const { error: markOldError } = await adminClient
          .from("used_magic_link_tokens")
          .update({ used_at: new Date().toISOString() })
          .eq("jti", token.jti);

        if (markOldError) {
          console.warn(`Warning: Could not mark old token as used for ${token.email}:`, markOldError);
        }

        // Mark new token as sent
        await markTokenSent(newJti, token.email, newExpiresAt);

        const inviteLink = INVITE_EMAIL_LINK;

        // Send new invitation email if requested
        if (sendEmails) {
          // Get user's first name if available
          const { data: userData } = await adminClient
            .from("app_user")
            .select("first_name")
            .eq("email", token.email)
            .single();

          const emailContent = await getInviteEmail(
            userData?.first_name || null,
            inviteLink,
            customTemplate
          );

          const emailResponse = await resend.emails.send({
            from: formattedSender,
            to: token.email,
            subject: emailContent.subject,
            html: emailContent.html,
          });

          if (emailResponse.error) {
            throw new Error(
              `Email send failed: ${emailResponse.error.message || JSON.stringify(emailResponse.error)}`
            );
          }
        }

        successCount++;
      } catch (error: any) {
        console.error(`Error processing token for ${token.email}:`, error);
        errorCount++;
        errors.push({
          email: token.email,
          error: error.message || String(error),
        });
      }
    }

    return NextResponse.json({
      success: errorCount === 0,
      message: `Extended ${successCount} token(s)${sendEmails ? " and sent new emails" : ""}`,
      extended: successCount,
      errors: errorCount,
      totalUnused: tokens.length,
      tokensNeedingExtension: tokensToExtend.length,
      errorsDetails: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in POST /api/admin/extend-invite-tokens:", error);
    return NextResponse.json(
      {
        error: "Failed to extend invitation tokens",
        details: error?.message || String(error),
      },
      { status: 500 }
    );
  }
}
