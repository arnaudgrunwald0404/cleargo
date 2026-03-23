import { NextResponse } from "next/server";

const FILENAME = "criteria-import-template.csv";

/**
 * CSV template for criteria import.
 * Columns: A=Category, B=Label, C=Decision Owner Email, D=Ready By (launch stage name, e.g. GTM Access),
 * E=GO, F=CONDITIONAL GO, G=NO GO, H=UI Framework Only (true/yes/1), I=Gate (true/yes/1), J=Tier (ALL, TIER_1_ONLY, TIER_1_AND_2, TIER_2_ONLY, TIER_3_ONLY). For UI Framework: Level 1→Tier 1, Level 2→Tier 2, Level 3→Tier 3.
 * Ready By is matched to release_stages by name. Gate/Tier/UI Framework Only default to false/ALL/false when column missing.
 */
// Use ASCII only (no em dash or other Unicode) so downloads open correctly everywhere
const TEMPLATE_CSV = `Category,Label,Decision Owner Email,Ready By,GO Definition,CONDITIONAL GO Definition,NO GO Definition,UI Framework Only,Gate,Tier
UX & Research,Example Criterion,[name of pod's product manager],GTM Access,Definition for GO status.,Definition for CONDITIONAL GO.,Definition for NO GO.,true,false,ALL`;

export async function GET() {
  return new NextResponse(TEMPLATE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${FILENAME}"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
