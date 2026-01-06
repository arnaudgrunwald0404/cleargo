import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { z } from "zod";

const validateTokenSchema = z.object({
  token: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = validateTokenSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { token } = parsed.data;

    try {
      const payload = await verifyToken<{ email: string; t: string }>(token);
      if (payload.t !== "session") {
        return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
      }
      return NextResponse.json({ email: payload.email, valid: true });
    } catch (err) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Validate token error:", err);
    return NextResponse.json(
      { error: err?.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

