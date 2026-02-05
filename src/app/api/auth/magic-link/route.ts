import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createToken } from "@/lib/jwt";
import { canSendEmail, markTokenSent } from "@/lib/tokenStore";
import { sendMagicLinkEmail } from "@/lib/sendEmail";

const emailSchema = z.string().email();

const CLEARCOMPANY_DOMAIN = "clearcompany.com";

function isAllowed(email: string) {
  const fromEnv = (process.env.ALLOWLIST_DOMAINS || CLEARCOMPANY_DOMAIN).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const allow = Array.from(new Set([CLEARCOMPANY_DOMAIN, ...fromEnv]));
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && allow.includes(domain);
}

export async function POST(req: NextRequest) {
  let body: any;
  
  try {
    // Try to parse JSON body
    try {
      body = await req.json();
    } catch (parseError) {
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
    
    const isEmailAllowed = isAllowed(email);
    
    if (!isEmailAllowed) {
      return NextResponse.json({ error: "Email domain not allowed" }, { status: 403 });
    }
    
    const okToSend = await canSendEmail(email);
    
    if (!okToSend) {
      return NextResponse.json({ error: "Please wait before requesting another link" }, { status: 429 });
    }

    const jti = randomUUID();
    const expiresIn = "12h";
    const token = await createToken({ email, jti, t: "magic" }, expiresIn);

    // Calculate expiration date (12 hours from now)
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

    // Mark token as sent in database before sending email
    await markTokenSent(jti, email, expiresAt);
    
    await sendMagicLinkEmail(email, link);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
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
