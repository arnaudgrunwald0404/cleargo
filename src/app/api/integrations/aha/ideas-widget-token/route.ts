import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getEffectiveUserEmail, IMPERSONATE_COOKIE_NAME } from "@/lib/auth/impersonation";
import { withRateLimit, RATE_LIMITS } from "@/lib/middleware/rate-limit-middleware";
import {
  createAhaIdeasWidgetJwt,
  formatAhaIdeasWidgetUserName,
  getAhaIdeasWidgetAccount,
  getAhaIdeasWidgetApplicationId,
  getAhaIdeasWidgetId,
} from "@/lib/aha/ideasWidget";

export const dynamic = "force-dynamic";

async function getHandler() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const session = await getSession();
    const realUserEmail = (user?.email || session?.email)?.toLowerCase();

    if (!realUserEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.AHA_IDEAS_WIDGET_JWT_SECRET) {
      return NextResponse.json(
        { error: "Aha Ideas widget is not configured (missing AHA_IDEAS_WIDGET_JWT_SECRET)" },
        { status: 503 }
      );
    }

    const cookieStore = await cookies();
    const impersonateCookie = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
    const effectiveEmail = await getEffectiveUserEmail(realUserEmail, impersonateCookie);

    const { data: profile, error } = await supabase
      .from("app_user")
      .select("id, email, first_name, last_name, name")
      .eq("email", effectiveEmail)
      .single();

    if (error || !profile?.id) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    const jwt = await createAhaIdeasWidgetJwt({
      id: profile.id,
      name: formatAhaIdeasWidgetUserName(profile),
      email: profile.email,
    });

    return NextResponse.json({
      jwt,
      account: getAhaIdeasWidgetAccount(),
      applicationId: getAhaIdeasWidgetApplicationId(),
      widgetId: getAhaIdeasWidgetId(),
    });
  } catch (err) {
    console.error("[ideas-widget-token] Failed to issue token:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to issue widget token" },
      { status: 500 }
    );
  }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
