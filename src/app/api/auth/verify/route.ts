import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createToken } from "@/lib/jwt";
import { isTokenUsed, markTokenUsed } from "@/lib/tokenStore";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  
  try {
    const payload = await verifyToken<{ email: string; jti: string; t: string }>(token);
    if (payload.t !== "magic") throw new Error("Wrong token type");
    const used = await isTokenUsed(payload.jti);
    if (used) return NextResponse.json({ error: "Link already used" }, { status: 400 });

    await markTokenUsed(payload.jti);

    // Check if user exists in Supabase auth and if they have a password
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    let hasPassword = false;
    
    if (secretKey) {
      try {
        const adminClient = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          secretKey
        );

        const { data: authUsers } = await adminClient.auth.admin.listUsers();
        const authUser = authUsers?.users.find(
          (u) => u.email?.toLowerCase() === payload.email.toLowerCase()
        );

        // If user doesn't exist in Supabase auth, create them (passwordless initially)
        if (!authUser) {
          const { error: createError } = await adminClient.auth.admin.createUser({
            email: payload.email,
            email_confirm: true,
            // Don't set password here - user will set it in setup-password
          });

          if (createError) {
            console.error("Failed to create Supabase auth user:", createError);
            // Continue anyway - user can set password later
          }
        } else {
          // Check if user has a password set
          // If user has signed in before or has email identity, they likely have a password
          // Note: Supabase doesn't expose encrypted_password directly, so we use heuristics
          hasPassword = !!(authUser.last_sign_in_at || 
            authUser.identities?.some((identity) => identity.provider === 'email'));
        }
      } catch (err) {
        console.error("Error checking/creating Supabase auth user:", err);
        // Continue with flow even if check fails
      }
    }

    // Issue session cookie (7 days)
    const session = await createToken({ email: payload.email, t: "session" }, "7d");
    
    // If user doesn't have a password, redirect to setup-password
    if (!hasPassword) {
      const res = NextResponse.redirect(new URL(`/setup-password?token=${encodeURIComponent(session)}`, req.url));
      res.cookies.set({
        name: "lr_session",
        value: session,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    }

    // User has password, redirect to home
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set({
      name: "lr_session",
      value: session,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }
}
