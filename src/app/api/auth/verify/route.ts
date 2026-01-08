import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createToken } from "@/lib/jwt";
import { checkAndMarkTokenUsed } from "@/lib/tokenStore";
import { createClient as createAdminClient } from "@supabase/supabase-js";

// In-memory lock to prevent duplicate processing of the same token
// This is a fallback for race conditions within the same process
const processingTokens = new Map<string, Promise<any>>();

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:10',message:'Verify request started',data:{hasToken:!!token,tokenLength:token?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,D'})}).catch(()=>{});
  // #endregion
  
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:15',message:'Before token verification',data:{hasSecret:!!process.env.MAGIC_LINK_SECRET},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const payload = await verifyToken<{ email: string; jti: string; t: string; exp?: number }>(token);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:16',message:'Token verified',data:{email:payload.email,jti:payload.jti,type:payload.t,exp:payload.exp},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:36',message:'Before checkAndMarkTokenUsed',data:{jti:payload.jti},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        const alreadyUsed = await checkAndMarkTokenUsed(payload.jti);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:37',message:'Token usage check result',data:{jti:payload.jti,alreadyUsed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:86',message:'Before session creation',data:{email:payload.email,hasPassword},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        const session = await createToken({ email: payload.email, t: "session" }, "7d");
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:87',message:'Session token created',data:{email:payload.email,sessionLength:session.length},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        // Determine if we should use secure cookies (only in production with HTTPS)
        const isSecure = req.url.startsWith('https://') || process.env.NODE_ENV === 'production';
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:91',message:'Cookie secure flag determined',data:{isSecure,url:req.url,nodeEnv:process.env.NODE_ENV},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        // If user doesn't have a password, redirect to setup-password
        if (!hasPassword) {
          const redirectUrl = `/setup-password?token=${encodeURIComponent(session)}`;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:95',message:'Redirecting to setup-password',data:{redirectUrl,hasPassword},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:107',message:'Cookie set for setup-password',data:{cookieName:'lr_session',cookieSet:true,secure:isSecure},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          return res;
        }

        // User has password, redirect to home
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:115',message:'Redirecting to home',data:{hasPassword},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:125',message:'Cookie set for home redirect',data:{cookieName:'lr_session',cookieSet:true,secure:isSecure},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'verify/route.ts:125',message:'Verify error caught',data:{error:String(e),message:e?.message,name:e?.name,stack:e?.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C,D,E'})}).catch(()=>{});
    // #endregion
    console.error("[Verify] Error:", e);
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }
}
