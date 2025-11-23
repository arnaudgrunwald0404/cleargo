import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { createToken } from "@/lib/jwt";
import { canSendEmail } from "@/lib/tokenStore";
import { sendMagicLinkEmail } from "@/lib/sendEmail";

const emailSchema = z.string().email();

function isAllowed(email: string) {
  const allow = (process.env.ALLOWLIST_DOMAINS || "clearcompany.com").split(",").map(s => s.trim().toLowerCase());
  const domain = email.split("@")[1]?.toLowerCase();
  return domain && allow.includes(domain);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = emailSchema.parse(body.email);
    if (!isAllowed(email)) {
      return NextResponse.json({ error: "Email domain not allowed" }, { status: 403 });
    }
    const okToSend = await canSendEmail(email);
    if (!okToSend) {
      return NextResponse.json({ error: "Please wait before requesting another link" }, { status: 429 });
    }

    const jti = randomUUID();
    const token = await createToken({ email, jti, t: "magic" }, "30m");

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const link = `${baseUrl}/api/auth/verify?token=${encodeURIComponent(token)}`;

    await sendMagicLinkEmail(email, link);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
