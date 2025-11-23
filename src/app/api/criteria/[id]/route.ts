import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { resolveRole } from "@/lib/roles";
import { updateCriterion } from "@/lib/criteriaStore";

const updateSchema = z.object({
  label: z.string().min(1).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  gate: z.boolean().optional(),
  tier_applicability: z.string().optional(),
  decision_owner_role: z.string().optional(),
  status_definition_go: z.string().optional(),
  status_definition_conditional: z.string().optional(),
  status_definition_no_go: z.string().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

function forbid() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return forbid();
  const role = await resolveRole(session.email);
  if (!(role === "PRODUCT_OPS" || role === "CPO")) return forbid();

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }
  const updated = await updateCriterion(params.id, parsed.data as any);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ item: updated });
}
