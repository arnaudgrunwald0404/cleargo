import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { resolveRole, isAdminRole } from "@/lib/roles";
import { getDenialEmail } from "@/lib/email/templates";
import { Resend } from "resend";
import { getSettings } from "@/lib/settings-db";

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const { email: encodedEmail } = await params;
  const email = decodeURIComponent(encodedEmail);
  
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  
  const role = await resolveRole(user.email);
  // AUTH DISABLED: Superadmin bypasses role checks
  if (!isAdminRole(role)) return forbid();

  // Capability check: users.delete
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
    const canDelete = await canRolesPerform((me?.roles as string[]) || [], "users.delete");
    if (!canDelete) return forbid();
  }

  // Check if user exists in app_user (should not for pending users)
  const { data: appUser } = await supabase
    .from("app_user")
    .select("id")
    .eq("email", email.toLowerCase())
    .single();

  if (appUser) {
    return NextResponse.json({ error: "User is already approved. Use the regular delete endpoint instead." }, { status: 400 });
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
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!authUser) {
    return NextResponse.json({ error: "User not found in authentication system" }, { status: 404 });
  }

  // Delete auth user
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(authUser.id);

  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete user", details: deleteError.message }, { status: 500 });
  }

  // Send denial email (optional, don't fail if email fails)
  try {
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const settings = await getSettings();
      
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        `${req.nextUrl.protocol}//${req.nextUrl.host}`;

      // Get sender info
      const senderName = "ClearGO";
      let senderEmail = "noreply@info.tacticalsync.com";
      if (process.env.EMAIL_SENDER) {
        const emailMatch = process.env.EMAIL_SENDER.match(/<(.+)>/);
        senderEmail = emailMatch ? emailMatch[1] : process.env.EMAIL_SENDER;
      }
      const formattedSender = `${senderName} <${senderEmail}>`;

      const emailContent = await getDenialEmail(
        null, // firstName - we don't have it for pending users
        baseUrl,
        {
          subject: (settings as any).email_template_denial_subject,
          html: (settings as any).email_template_denial_html,
        }
      );

      const emailResponse = await resend.emails.send({
        from: formattedSender,
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
      });

      if (emailResponse.error) {
        console.error("Failed to send denial email:", emailResponse.error);
        // Don't fail the deletion if email fails
      } else {
        console.log("Denial email sent successfully:", {
          emailId: emailResponse.data?.id,
          to: email,
        });
      }
    }
  } catch (emailError: any) {
    console.error("Error sending denial email:", emailError);
    // Don't fail the deletion if email fails
  }

  return NextResponse.json({ message: "Pending user access request denied and deleted successfully" }, { status: 200 });
}
