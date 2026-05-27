import { NextRequest, NextResponse } from "next/server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { getSession } from "@/lib/auth";

import { getEffectiveUserEmail, IMPERSONATE_COOKIE_NAME } from "@/lib/auth/impersonation";

import { withRateLimit, RATE_LIMITS } from "@/lib/middleware/rate-limit-middleware";

import { buildIdeasPortalAuthForEmail } from "@/lib/aha/ideasPortalAuth";



export const dynamic = "force-dynamic";



function getAppOrigin(request: NextRequest): string {

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configured) return configured.replace(/\/$/, "");

  return request.nextUrl.origin;

}



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



    const { searchParams } = request.nextUrl;

    const state = searchParams.get("state");

    const cleargoRedirect = searchParams.get("redirect") || "/";

    const returnTo = normalizeReturnTo(searchParams.get("return_to"));



    if (!realUserEmail) {

      const loginUrl = new URL("/login", getAppOrigin(request));

      loginUrl.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search);

      return NextResponse.redirect(loginUrl);

    }



    const cookieStore = await cookies();

    const impersonateCookie = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;

    const effectiveEmail = await getEffectiveUserEmail(realUserEmail, impersonateCookie);



    const { callbackUrl } = await buildIdeasPortalAuthForEmail(supabase, effectiveEmail, {

      returnTo,

      state,

    });



    const response = NextResponse.redirect(callbackUrl);

    response.headers.set("X-Frame-Options", "SAMEORIGIN");

    response.cookies.set("aha_portal_cleargo_redirect", cleargoRedirect, {

      httpOnly: true,

      secure: process.env.NODE_ENV === "production",

      sameSite: "lax",

      maxAge: 600,

      path: "/",

    });

    return response;

  } catch (err) {

    console.error("[ideas-portal-sso] Failed:", err);

    const message = err instanceof Error ? err.message : "Failed to start portal SSO";

    if (message === "User profile not found") {

      return NextResponse.json({ error: message }, { status: 404 });

    }

    const isConfig = message.includes("JWT_SECRET");

    return NextResponse.json({ error: message }, { status: isConfig ? 503 : 500 });

  }

}



export const GET = withRateLimit(getHandler, RATE_LIMITS.light);

