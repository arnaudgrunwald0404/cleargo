import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createToken, decodeTokenUnsafe } from "@/lib/jwt";
import { checkAndMarkTokenUsed } from "@/lib/tokenStore";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// In-memory lock to prevent duplicate processing of the same token
// This is a fallback for race conditions within the same process
const processingTokens = new Map<string, Promise<any>>();

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Basic validation - JWT tokens have 3 parts separated by dots
  if (token.split('.').length !== 3) {
    console.error("[Verify] Token does not have expected JWT format (expected 3 parts separated by dots)");
    return NextResponse.json({ error: "Invalid token format" }, { status: 400 });
  }

  try {
    const payload = await verifyToken<{ email: string; jti: string; t: string; exp?: number }>(token);

    if (payload.t !== "magic") throw new Error("Wrong token type");

    console.log(`[Verify] Processing magic link token for ${payload.email}, jti: ${payload.jti}`);

    // Check if this token is already being processed
    const existingProcessing = processingTokens.get(payload.jti);
    if (existingProcessing) {
      console.log(`[Verify] Token ${payload.jti} is already being processed, waiting...`);
      try {
        return await existingProcessing;
      } catch (error) {
        // If the existing processing failed, continue with new processing
        processingTokens.delete(payload.jti);
      }
    }

    // Create a promise for this token processing
    const processingPromise = (async () => {
      try {
        // Atomically check and mark token as used to prevent race conditions
        const alreadyUsed = await checkAndMarkTokenUsed(payload.jti);

        if (alreadyUsed) {
          console.log(`[Verify] Token ${payload.jti} was already marked as used`);
          return NextResponse.json({ error: "Link already used" }, { status: 400 });
        }

        console.log(`[Verify] Token ${payload.jti} successfully marked as used, proceeding with auth`);

        const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

        if (!secretKey || !supabaseUrl) {
          console.error("[Verify] Missing Supabase admin credentials");
          return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const adminClient = createAdminClient(supabaseUrl, secretKey);

        // Check if user exists in Supabase auth
        const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers();
        let authUser = authUsers?.find(
          (u) => u.email?.toLowerCase() === payload.email.toLowerCase()
        );

        // If user doesn't exist in Supabase auth, create them
        if (!authUser) {
          const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email: payload.email,
            email_confirm: true,
          });

          if (createError) {
            console.error("[Verify] Failed to create Supabase auth user:", createError);
            return NextResponse.json({ error: "Failed to create user account" }, { status: 500 });
          }
          authUser = newUser.user;
        }

        // Check if user has a password set by looking for an email identity
        // with a non-null identity_data.sub (only email+password identities have this)
        // Google SSO users have provider='google', not 'email', so this is accurate
        const emailIdentity = authUser.identities?.find((id) => id.provider === 'email');
        const hasPassword = !!emailIdentity;

        // Generate a magic link via Supabase admin API — this gives us a proper
        // Supabase auth link with token_hash that we can exchange for a real session
        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email: payload.email,
        });

        if (linkError || !linkData) {
          console.error("[Verify] Failed to generate Supabase magic link:", linkError);
          return NextResponse.json({ error: "Failed to generate session" }, { status: 500 });
        }

        // Extract the token_hash from the generated link properties
        const tokenHash = linkData.properties?.hashed_token;
        if (!tokenHash) {
          console.error("[Verify] No hashed_token in generated link");
          return NextResponse.json({ error: "Failed to generate session" }, { status: 500 });
        }

        // Exchange the token_hash for a real Supabase session using a server client
        // that can set cookies on the response
        const storedCookies: Array<{ name: string; value: string; options?: any }> = [];

        const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!publishableKey) {
          return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
        }

        const supabase = createServerClient(supabaseUrl, publishableKey, {
          cookies: {
            getAll() {
              return req.cookies.getAll();
            },
            setAll(cookiesToSet) {
              storedCookies.length = 0;
              cookiesToSet.forEach(({ name, value, options }) => {
                storedCookies.push({ name, value, options });
              });
            },
          },
        });

        const { error: verifyError } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: tokenHash,
        });

        if (verifyError) {
          console.error("[Verify] Failed to verify OTP:", verifyError);
          return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
        }

        console.log(`[Verify] Successfully created Supabase session for ${payload.email}`);

        // Redirect based on whether user has a password
        let redirectPath = "/";
        if (!hasPassword) {
          // Generate a setup token for the setup-password page to verify identity
          const setupToken = await createToken({ email: payload.email, t: "session" }, "1h");
          redirectPath = `/setup-password?token=${encodeURIComponent(setupToken)}`;
        }
        const res = NextResponse.redirect(new URL(redirectPath, req.url));

        // Apply Supabase session cookies to the redirect response
        storedCookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options);
        });

        return res;
      } finally {
        // Clean up the lock after processing completes
        processingTokens.delete(payload.jti);
      }
    })();

    // Store the promise and await it
    processingTokens.set(payload.jti, processingPromise);
    return await processingPromise;
  } catch (e: any) {
    console.error("[Verify] Error:", e);
    console.error("[Verify] Error details:", {
      message: e?.message,
      name: e?.name,
      code: e?.code,
      cause: e?.cause,
    });

    // Check if token is expired or invalid - try to extract email and redirect to resend page
    const isExpired = e?.code === "ERR_JWT_EXPIRED" || e?.message?.includes("expired");
    const isInvalid = e?.code === "ERR_JWT_INVALID" || e?.message?.includes("invalid");

    if ((isExpired || isInvalid) && token) {
      let email: string | null = null;

      // Try to decode the token to extract email (works even for expired tokens)
      const decoded = decodeTokenUnsafe<{ email?: string; t?: string; jti?: string }>(token);

      if (decoded?.email && decoded?.t === "magic") {
        email = decoded.email;
      } else if (decoded?.jti) {
        try {
          const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (secretKey) {
            const adminClient = createAdminClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              secretKey
            );
            const { data: tokenData } = await adminClient
              .from("used_magic_link_tokens")
              .select("email")
              .eq("jti", decoded.jti)
              .single();

            if (tokenData?.email) {
              email = tokenData.email;
            }
          }
        } catch (dbError) {
          console.error("[Verify] Error looking up token in database:", dbError);
        }
      }

      if (email) {
        const redirectUrl = `/auth/token-expired?email=${encodeURIComponent(email)}`;
        return NextResponse.redirect(new URL(redirectUrl, req.url));
      } else {
        return NextResponse.redirect(new URL(`/auth/token-expired`, req.url));
      }
    }

    let errorMessage = "Invalid or expired token";
    if (isExpired) {
      errorMessage = "This invitation link has expired. Please request a new invitation.";
    } else if (e?.code === "ERR_JWT_INVALID" || e?.message?.includes("invalid")) {
      errorMessage = "This invitation link is invalid. Please request a new invitation.";
    } else if (e?.message?.includes("Wrong token type")) {
      errorMessage = "Invalid token type. Please use a valid invitation link.";
    }

    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
