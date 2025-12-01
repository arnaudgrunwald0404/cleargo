import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  const body = await req.json();
  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const { error } = await supabase
    .from("app_user")
    .delete()
    .in("id", parsed.data.ids);

  if (error) {
    return NextResponse.json({ error: "Failed to delete users", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: `Successfully deleted ${parsed.data.ids.length} user(s)` });
}


