import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveRole } from "@/lib/roles";
import { createCriteria, getCriteria, listCriteria } from "@/lib/db/criteria";
import type { CriterionCategory, DecisionOwnerRole, TierApplicability } from "@/types/criteria";

const dataSourceSchema = z.object({
  type: z.enum(["aha_field", "aha_description_part", "url", "jira_jql", "success_metrics_defined"]),
  value: z.string(), // Allow empty strings (especially for URL type where value is entered per-epic)
  label: z.string().optional(), // Optional label for URL sources (e.g., "Figma designs", "PRD")
});

const createSchema = z.object({
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  category: z.custom<CriterionCategory>(),
  gate: z.boolean(),
  tier_applicability: z.custom<TierApplicability>(),
  decision_owner_email: z.string().nullable().optional(),
  status_definition_go: z.string().optional(),
  status_definition_conditional: z.string().optional(),
  status_definition_no_go: z.string().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  data_sources: z.array(dataSourceSchema).max(5).nullable().optional(),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const items = await listCriteria();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
  const role = await resolveRole(user.email);
  if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  // Capability: criteria.create
  const { data: me, error: userError } = await supabase
    .from("app_user")
    .select("roles")
    .eq("email", user.email)
    .single();
  
  // Handle case where user doesn't exist in app_user table
  if (userError && userError.code === 'PGRST116') {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }
  if (userError) {
    throw userError;
  }
  
  const { canRolesPerform } = await import("@/lib/permissions");
  const canCreate = await canRolesPerform((me?.roles as string[]) || [], "criteria.create");
  if (!canCreate) return forbid();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    console.error('Validation failed:', parsed.error.errors);
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten(), errors: parsed.error.errors }, { status: 400 });
  }
  const item = await createCriteria(parsed.data as any);
  return NextResponse.json({ item }, { status: 201 });
}
