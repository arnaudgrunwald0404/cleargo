import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole, isAdminRole } from "@/lib/roles";
import { syncUserSlackHandle } from "@/lib/slack/notifications";
import { getApprovalEmail } from "@/lib/email/templates";
import { Resend } from "resend";
import { getSettings } from "@/lib/settings-db";

const approveUserSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  roles: z.array(z.string()).default(["OTHER"]),
  is_active: z.boolean().default(true),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  
  const role = await resolveRole(user.email);
  // AUTH DISABLED: Superadmin bypasses role checks
  if (!isAdminRole(role)) return forbid();

  // Capability check: users.create
  // AUTH DISABLED: Superadmin bypasses capability checks
  if (role !== "SUPERADMIN") {
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
    const canCreate = await canRolesPerform((me?.roles as string[]) || [], "users.create");
    if (!canCreate) return forbid();
  }

  const body = await req.json();
  const parsed = approveUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  // Check if user already exists in app_user
  const { data: existingUser } = await supabase
    .from("app_user")
    .select("id")
    .eq("email", parsed.data.email.toLowerCase())
    .single();

  if (existingUser) {
    return NextResponse.json({ error: "User already exists in the system" }, { status: 400 });
  }

  // Get auth user ID from Supabase auth
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
    (u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase()
  );

  if (!authUser) {
    return NextResponse.json({ error: "User not found in authentication system" }, { status: 404 });
  }

  // Create app_user record
  const { data: newUser, error } = await supabase
    .from("app_user")
    .insert({
      id: authUser.id,
      email: parsed.data.email.toLowerCase(),
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      roles: parsed.data.roles.length > 0 ? parsed.data.roles : ["OTHER"],
      is_active: parsed.data.is_active,
      name: `${parsed.data.first_name || ""} ${parsed.data.last_name || ""}`.trim() || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create user", details: error.message }, { status: 500 });
  }

  // Auto-sync Slack handle for new user (non-blocking)
  if (newUser?.email) {
    syncUserSlackHandle(newUser.email).catch((err) => {
      console.error(`Failed to sync Slack handle for ${newUser.email}:`, err);
    });
  }

  // Send approval email
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not configured");
      // Don't fail the approval if email fails
    } else {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const settings = await getSettings();
      
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        `${req.nextUrl.protocol}//${req.nextUrl.host}`;
      
      const appUrl = `${baseUrl}/login`;

      // Get sender info
      const senderName = "ClearGO";
      let senderEmail = "noreply@info.tacticalsync.com";
      if (process.env.EMAIL_SENDER) {
        const emailMatch = process.env.EMAIL_SENDER.match(/<(.+)>/);
        senderEmail = emailMatch ? emailMatch[1] : process.env.EMAIL_SENDER;
      }
      const formattedSender = `${senderName} <${senderEmail}>`;

      const emailContent = await getApprovalEmail(
        newUser.first_name,
        appUrl,
        {
          subject: (settings as any).email_template_approval_subject,
          html: (settings as any).email_template_approval_html,
        }
      );

      const emailResponse = await resend.emails.send({
        from: formattedSender,
        to: newUser.email,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      if (emailResponse.error) {
        console.error("Failed to send approval email:", emailResponse.error);
        // Don't fail the approval if email fails
      } else {
        console.log("Approval email sent successfully:", {
          emailId: emailResponse.data?.id,
          to: newUser.email,
        });
      }
    }
  } catch (emailError: any) {
    console.error("Error sending approval email:", emailError);
    // Don't fail the approval if email fails
  }

  return NextResponse.json({ user: newUser, message: "User approved successfully" }, { status: 201 });
}
