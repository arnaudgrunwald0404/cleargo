import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createToken, decodeTokenUnsafe } from "@/lib/jwt";
import { checkAndMarkTokenUsed } from "@/lib/tokenStore";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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
        
        // Determine if we should use secure cookies
        // Check x-forwarded-proto header (set by Netlify/proxies) or URL protocol
        const forwardedProto = req.headers.get('x-forwarded-proto');
        const isHttps = forwardedProto === 'https' || req.url.startsWith('https://');
        const isLocalhost = req.url.includes('localhost') || req.url.includes('127.0.0.1');
        const isSecure = isHttps && !isLocalhost;
        
        // If user doesn't have a password, redirect to setup-password
        if (!hasPassword) {
          const redirectUrl = `/setup-password?token=${encodeURIComponent(session)}`;
          
          const res = NextResponse.redirect(new URL(redirectUrl, req.url));
          res.cookies.set({
            name: "lr_session",
            value: session,
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: isSecure,
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
          secure: isSecure,
          maxAge: 60 * 60 * 24 * 7,
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
      stack: e?.stack,
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
        // If we can't get email from token but have jti, try database lookup
        // This helps with very old tokens that might have been tracked
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
        // Redirect to expired token page with email
        const redirectUrl = `/auth/token-expired?email=${encodeURIComponent(email)}`;
        return NextResponse.redirect(new URL(redirectUrl, req.url));
      } else {
        // Can't extract email, but still redirect to expired page (user can enter email manually)
        const redirectUrl = `/auth/token-expired`;
        return NextResponse.redirect(new URL(redirectUrl, req.url));
      }
    }
    
    // Provide more specific error messages
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
