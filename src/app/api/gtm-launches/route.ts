import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const supabase = createClient();

        // Fetch all non-archived epics with a launch_ref
        const { data: epics, error: epicsErr } = await supabase
            .from("epic")
            .select("id, name, launch_ref, target_launch_date, risk_level, status")
            .not("launch_ref", "is", null)
            .or("archived.is.null,archived.eq.false");

        if (epicsErr) throw epicsErr;

        // Group epics by launch_ref
        const groups = new Map<
            string,
            {
                launch_ref: string;
                epics: typeof epics;
                target_launch_date: string | null;
                risk_level: string | null;
            }
        >();

        for (const epic of epics || []) {
            if (!epic.launch_ref || epic.launch_ref === "No Launch") continue;

            const existing = groups.get(epic.launch_ref);
            if (existing) {
                existing.epics.push(epic);
                // Earliest target date
                if (
                    epic.target_launch_date &&
                    (!existing.target_launch_date ||
                        epic.target_launch_date < existing.target_launch_date)
                ) {
                    existing.target_launch_date = epic.target_launch_date;
                }
                // Highest risk wins
                if (epic.risk_level) {
                    const riskOrder: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
                    const currentRisk = riskOrder[existing.risk_level || ""] || 0;
                    const newRisk = riskOrder[epic.risk_level] || 0;
                    if (newRisk > currentRisk) existing.risk_level = epic.risk_level;
                }
            } else {
                groups.set(epic.launch_ref, {
                    launch_ref: epic.launch_ref,
                    epics: [epic],
                    target_launch_date: epic.target_launch_date,
                    risk_level: epic.risk_level,
                });
            }
        }

        // Fetch launches that match these refs for readiness_pct
        const refNames = [...groups.keys()];
        let launchReadiness = new Map<string, number>();
        if (refNames.length > 0) {
            const { data: launches } = await supabase
                .from("launch")
                .select("name, readiness_pct")
                .in("name", refNames);
            for (const l of launches || []) {
                launchReadiness.set(l.name, l.readiness_pct ?? 0);
            }
        }

        // Build response sorted by launch_ref ascending
        const result = [...groups.values()]
            .map((g) => ({
                launch_ref: g.launch_ref,
                epic_count: g.epics.length,
                target_launch_date: g.target_launch_date,
                readiness_pct: launchReadiness.get(g.launch_ref) ?? 0,
                risk_level: g.risk_level,
            }))
            .sort((a, b) => a.launch_ref.localeCompare(b.launch_ref));

        return NextResponse.json({ launches: result });
    } catch (error: any) {
        console.error("Failed to fetch GTM launches:", error);
        return NextResponse.json({ launches: [] }, { status: 500 });
    }
}
