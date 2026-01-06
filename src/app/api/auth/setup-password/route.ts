import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { z } from "zod";

const setupPasswordSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = setupPasswordSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // Verify token
    let email: string;
    try {
      const payload = await verifyToken<{ email: string; t: string }>(token);
      if (payload.t !== "session") {
        return NextResponse.json({ error: "Invalid token type" }, { status: 400 });
      }
      email = payload.email;
    } catch (err) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // Use admin client to create/update user
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      secretKey
    );

    // Check if user exists
    const { data: authUsers } = await adminClient.auth.admin.listUsers();
    const authUser = authUsers?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!authUser) {
      // Create user with password
      const { error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) {
        console.error("Failed to create user:", createError);
        return NextResponse.json(
          { error: createError.message || "Failed to create account" },
          { status: 400 }
        );
      }
    } else {
      // Update password for existing user
      const { error: updateError } = await adminClient.auth.admin.updateUserById(
        authUser.id,
        { password }
      );
      if (updateError) {
        console.error("Failed to update password:", updateError);
        return NextResponse.json(
          { error: updateError.message || "Failed to update password" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Setup password error:", err);
    return NextResponse.json(
      { error: err?.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

