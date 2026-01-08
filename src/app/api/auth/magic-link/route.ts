import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createToken } from "@/lib/jwt";
import { canSendEmail, markTokenSent } from "@/lib/tokenStore";
import { sendMagicLinkEmail } from "@/lib/sendEmail";

const emailSchema = z.string().email();

function isAllowed(email: string) {
  const allow = (process.env.ALLOWLIST_DOMAINS || "clearcompany.com").split(",").map(s => s.trim().toLowerCase());
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && allow.includes(domain);
}

export async function POST(req: NextRequest) {
  let body: any;
  
  try {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:16',message:'Magic link request started',data:{hasBody:!!req.body},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion
    
    // Try to parse JSON body
    try {
      body = await req.json();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:23',message:'Body parsed successfully',data:{hasEmail:!!body.email,email:body.email?.substring(0,10)+'...'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    } catch (parseError) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:26',message:'JSON parse error',data:{error:String(parseError)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error("JSON parse error:", parseError);
      return NextResponse.json({ error: "Invalid request body. Expected JSON." }, { status: 400 });
    }
    
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    
    if (!body.email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (typeof body.email !== 'string') {
      return NextResponse.json({ error: "Email must be a string" }, { status: 400 });
    }

    const email = emailSchema.parse(body.email);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:40',message:'Email validated',data:{email,domain:email.split('@')[1]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    const isEmailAllowed = isAllowed(email);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:42',message:'Email domain check',data:{email,isAllowed:isEmailAllowed,allowedDomains:process.env.ALLOWLIST_DOMAINS||'clearcompany.com'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    if (!isEmailAllowed) {
      return NextResponse.json({ error: "Email domain not allowed" }, { status: 403 });
    }
    
    const okToSend = await canSendEmail(email);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:45',message:'Cooldown check result',data:{email,okToSend},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
    // #endregion
    
    if (!okToSend) {
      return NextResponse.json({ error: "Please wait before requesting another link" }, { status: 429 });
    }

    const jti = randomUUID();
    const expiresIn = "30m";
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:51',message:'Before token creation',data:{email,jti,hasSecret:!!process.env.MAGIC_LINK_SECRET},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const token = await createToken({ email, jti, t: "magic" }, expiresIn);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:52',message:'Token created',data:{email,jti,tokenLength:token.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // Calculate expiration date (30 minutes from now)
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:57',message:'Link generated',data:{baseUrl,linkLength:link.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Mark token as sent in database before sending email
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:60',message:'Before markTokenSent',data:{jti,email,expiresAt:expiresAt.toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    await markTokenSent(jti, email, expiresAt);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:61',message:'Token marked as sent',data:{jti,email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:63',message:'Before sendMagicLinkEmail',data:{email,hasResendKey:!!process.env.RESEND_API_KEY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    await sendMagicLinkEmail(email, link);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:64',message:'Email sent successfully',data:{email},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:66',message:'Magic link request completed successfully',data:{email,jti},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion
    
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/02bb678d-8fa7-4f70-af47-31a813f6ac12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'magic-link/route.ts:68',message:'Magic link error caught',data:{error:String(err),message:err?.message,name:err?.name,stack:err?.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
    // #endregion
    console.error("Magic link error:", err);
    
    // Handle Zod validation errors
    if (err.name === "ZodError" || err.issues) {
      return NextResponse.json({ error: "Invalid email address format" }, { status: 400 });
    }
    
    // Handle other known errors
    if (err.message) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    
    return NextResponse.json({ error: "Failed to send magic link. Please try again." }, { status: 500 });
  }
}
