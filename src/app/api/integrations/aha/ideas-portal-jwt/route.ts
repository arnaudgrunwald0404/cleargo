import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { getEffectiveUserEmail, IMPERSONATE_COOKIE_NAME } from "@/lib/auth/impersonation";
import { withRateLimit, RATE_LIMITS } from "@/lib/middleware/rate-limit-middleware";
import { buildIdeasPortalAuthForEmail } from "@/lib/aha/ideasPortalAuth";

export const dynamic = "force-dynamic";

function normalizeReturnTo(returnToParam: string | null): string {
  if (returnToParam && returnToParam.startsWith("/") && !returnToParam.startsWith("//")) {
    return returnToParam;
  }
  return "/";
}

async function getHandler(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const session = await getSession();
    const realUserEmail = (user?.email || session?.email)?.toLowerCase();

    if (!realUserEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const impersonateCookie = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
    const effectiveEmail = await getEffectiveUserEmail(realUserEmail, impersonateCookie);

    const { searchParams } = request.nextUrl;
    const returnTo = normalizeReturnTo(searchParams.get("return_to"));
    const state = searchParams.get("state");

    const { callbackUrl, email } = await buildIdeasPortalAuthForEmail(supabase, effectiveEmail, {
      returnTo,
      state,
    });

    return NextResponse.json({ callbackUrl, email });
  } catch (err) {
    console.error("[ideas-portal-jwt] Failed:", err);
    const message = err instanceof Error ? err.message : "Failed to issue portal JWT";
    if (message === "User profile not found") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    const isConfig = message.includes("JWT_SECRET");
    return NextResponse.json({ error: message }, { status: isConfig ? 503 : 500 });
  }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.light);
