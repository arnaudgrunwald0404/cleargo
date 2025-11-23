import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { resolveRole } from "@/lib/roles";
import { listCriteria, createCriterion } from "@/lib/criteriaStore";
import type { CriterionCategory, DecisionOwnerRole, TierApplicability } from "@/types/criteria";

const createSchema = z.object({
  label: z.string().min(1),
  description: z.string().optional(),
  category: z.custom<CriterionCategory>(),
  gate: z.boolean(),
  tier_applicability: z.custom<TierApplicability>(),
  decision_owner_role: z.custom<DecisionOwnerRole>(),
  status_definition_go: z.string().optional(),
  status_definition_conditional: z.string().optional(),
  status_definition_no_go: z.string().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  const items = await listCriteria();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return forbid();
  const role = await resolveRole(session.email);
  if (!(role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const item = await createCriterion(parsed.data as any);
  return NextResponse.json({ item }, { status: 201 });
}
