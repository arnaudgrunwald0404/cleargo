import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { isSuperAdmin } from "@/lib/auth-helpers";
import { getEffectiveUserEmail, getImpersonatedEmail, IMPERSONATE_COOKIE_NAME } from "@/lib/auth/impersonation";
import { trackLogin } from "@/lib/services/userActivityService";
import { getUser } from "@/lib/auth/getUser";

const notificationChannelSchema = z.enum(['email', 'slack', 'both', 'none']);

const updateProfileSchema = z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    avatar_url: z.string().optional(),
    notification_preferences: z.object({
        gate_signoff_ready: notificationChannelSchema.optional(),
        master_approval_ready: notificationChannelSchema.optional(),
        criteria_nudge: notificationChannelSchema.optional(),
        criteria_assignment: notificationChannelSchema.optional(),
        weekly_digest: notificationChannelSchema.optional(),
    }).optional(),
});

export async function PATCH(req: NextRequest) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Check for custom lr_session cookie (used by magic link)
    const session = await getSession();
    const sessionEmail = session?.email;
    
    // Use email from Supabase auth or from lr_session cookie
    const userEmail = user?.email || sessionEmail;

    if (!userEmail) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
    }

    // Remove undefined fields before sending to Supabase
    const updateData = Object.fromEntries(
        Object.entries(parsed.data).filter(([, v]) => v !== undefined)
    );
    // If name components are provided, construct full name
    // If name components are provided, construct full name without assigning null
    if (updateData.first_name || updateData.last_name) {
        const fullName = `${updateData.first_name || ""} ${updateData.last_name || ""}`.trim();
        if (fullName) {
            updateData.name = fullName;
        }
    }
    // If avatar_url is provided, ensure it's stored as is (could add validation later)
    if (updateData.avatar_url) {
        // No additional processing needed currently
    }

    // Use upsert to handle both insert and update cases
    // This ensures the profile is created if it doesn't exist
    let { data: updatedUser, error } = await supabase
        .from("app_user")
        .upsert(
            {
                email: userEmail,
                ...updateData,
                updated_at: new Date().toISOString(),
            },
            {
                onConflict: 'email',
            }
        )
        .select()
        .single();

    // If RLS error occurs, try with admin client that bypasses RLS
    if (error && (error.message?.includes('row-level security') || error.code === '42501')) {
        const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (secretKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
            const adminSupabase = createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL,
                secretKey
            );
            
            const adminResult = await adminSupabase
                .from("app_user")
                .upsert(
                    {
                        email: userEmail,
                        ...updateData,
                        updated_at: new Date().toISOString(),
                    },
                    {
                        onConflict: 'email',
                    }
                )
                .select()
                .single();
            
            if (adminResult.error) {
                console.error("Error upserting profile with admin client:", adminResult.error);
                return NextResponse.json({ error: "Failed to update profile", details: adminResult.error.message }, { status: 500 });
            }
            
            updatedUser = adminResult.data;
        } else {
            console.error("Error upserting profile:", error);
            return NextResponse.json({ error: "Failed to update profile", details: error.message }, { status: 500 });
        }
    } else if (error) {
        console.error("Error upserting profile:", error);
        return NextResponse.json({ error: "Failed to update profile", details: error.message }, { status: 500 });
    }

    return NextResponse.json({ user: updatedUser });
}

async function getHandler(req: NextRequest) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const session = await getSession();
    const sessionEmail = session?.email;
    const realUserEmail = (user?.email || sessionEmail)?.toLowerCase();

    if (!realUserEmail) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const impersonateCookie = req.cookies.get(IMPERSONATE_COOKIE_NAME)?.value;
    const effectiveEmail = await getEffectiveUserEmail(realUserEmail, impersonateCookie);

    let { data: profile, error } = await supabase
        .from("app_user")
        .select("*")
        .eq("email", effectiveEmail)
        .single();

    if (error?.code === 'PGRST116') {
        try {
            await getUser();
        } catch {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        const retry = await supabase
            .from("app_user")
            .select("*")
            .eq("email", effectiveEmail)
            .single();
        profile = retry.data;
        error = retry.error;
    }

    if (error) {
        if (error.code === 'PGRST116') {
            return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
        }
        return NextResponse.json({ error: "Failed to fetch profile", details: error.message }, { status: 500 });
    }

    const isImpersonating = effectiveEmail !== realUserEmail;
    const impersonationPayload = isImpersonating ? await getImpersonatedEmail(impersonateCookie) : null;
    const impersonationStartedAt = impersonationPayload?.iat != null
        ? new Date(impersonationPayload.iat * 1000).toISOString()
        : undefined;

    // Track login activity (throttled: only if last_logged_in is more than 1 hour old or null)
    if (!isImpersonating && profile?.id) {
      const lastLoggedIn = profile.last_logged_in ? new Date(profile.last_logged_in).getTime() : 0;
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      
      if (!lastLoggedIn || lastLoggedIn < oneHourAgo) {
        // Track asynchronously to avoid blocking the response
        trackLogin(effectiveEmail).catch(err => {
          console.error('[api/me] Failed to track login:', err);
        });
      }
    }

    return NextResponse.json({
        user: profile,
        isSuperAdmin: isSuperAdmin(realUserEmail),
        ...(isImpersonating && {
            impersonating: true,
            impersonationStartedAt,
        }),
    });
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
