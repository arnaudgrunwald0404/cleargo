import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { resolveRole } from "@/lib/roles";
import { upsertCriteriaBatch, CreateCriterionInput } from "@/lib/db/criteria";
import * as XLSX from "xlsx";
import { CriterionCategory, DecisionOwnerRole, TierApplicability } from "@/types/criteria";

export async function POST(req: NextRequest) {
    // Debug header
    const debugHeaders = { 'X-Debug-Handler': 'CriteriaImport' };

    // Development bypass: allow testing without Google OAuth
    const url = req.nextUrl;
    const bypass = url.searchParams.get('bypassAuth') === 'true';
    console.log(`[Import] Debug: bypass=${bypass}, NODE_ENV=${process.env.NODE_ENV}`);

    if (bypass && process.env.NODE_ENV === 'development') {
        console.log('[Import] Bypass auth enabled for development');
    } else {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) {
                return NextResponse.json({
                    error: "Unauthorized (No User)",
                    debug: {
                        bypass,
                        nodeEnv: process.env.NODE_ENV,
                        isDev: process.env.NODE_ENV === 'development'
                    }
                }, { status: 401, headers: debugHeaders });
            }
            const role = await resolveRole(user.email);
            if (!(role === "PRODUCT_OPS" || role === "CPO")) return new NextResponse("Forbidden", { status: 403 });
        } catch (authError) {
            console.error('[Import] Auth error:', authError);
            return NextResponse.json({
                error: "Unauthorized",
                debug: {
                    bypass,
                    nodeEnv: process.env.NODE_ENV,
                    isDev: process.env.NODE_ENV === 'development'
                }
            }, { status: 401 });
        }
    }
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value;
                    },
                    set() { },
                    remove() { },
                },
            }
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return new NextResponse("Unauthorized", { status: 401 });
        const role = await resolveRole(user.email);
        if (!(role === "PRODUCT_OPS" || role === "CPO")) return new NextResponse("Forbidden", { status: 403 });

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const commit = req.nextUrl.searchParams.get("commit") === "true";

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Use array of arrays

        const criteria: CreateCriterionInput[] = [];
        const errors: Array<{ row: number; label: string; error: string }> = [];
        let currentCategory = "General";
        let sortOrder = 0;

        // Find the start row (where "Criteria" is in column 1)
        let startRowIndex = rows.findIndex(row => row[1] === "Criteria");
        if (startRowIndex === -1) startRowIndex = 17; // Fallback

        console.log(`[Import] Found header at row ${startRowIndex}, starting data parse at row ${startRowIndex + 1}`);

        for (let i = startRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 1; // 1-indexed for user-friendly error messages

            // Skip empty rows or repeated headers
            if (!row || !row[1] || row[1] === "Criteria") {
                continue;
            }

            // Update category if present in Col 0
            if (row[0]) {
                currentCategory = row[0].toString().trim();
            }

            const label = row[1].toString().trim();

            // Validate: skip rows with empty labels
            if (!label) {
                console.log(`[Import] Skipping row ${rowNumber}: empty label`);
                continue;
            }

            const roleRaw = row[2]?.toString().trim();

            // Enhanced role mapping with specific name handling
            let role: DecisionOwnerRole = "PM";
            if (roleRaw) {
                const upper = roleRaw.toUpperCase();
                // Check for specific names first
                if (upper === "SAM") {
                    role = "LEARNING"; // Sam is typically Learning/Enablement
                } else if (upper.includes("ELT") || upper.includes("CPO")) {
                    role = "CPO";
                } else if (upper.includes("PMM")) {
                    role = "PMM";
                } else if (upper.includes("PM")) {
                    role = "PM";
                } else if (upper.includes("ENG")) {
                    role = "ENG_LEAD";
                } else if (upper.includes("SUPPORT")) {
                    role = "SUPPORT_LEAD";
                } else if (upper.includes("SECURITY")) {
                    role = "SECURITY";
                } else if (upper.includes("LEARNING") || upper.includes("ENABLEMENT")) {
                    role = "LEARNING";
                } else if (upper.includes("OPS")) {
                    role = "PRODUCT_OPS";
                } else {
                    role = "OTHER";
                }
            } else {
                // Default based on category if possible, else PM
                const catUpper = currentCategory.toUpperCase();
                if (catUpper.includes("PRODUCT") || catUpper.includes("FEATURE")) {
                    role = "PM";
                } else if (catUpper.includes("GTM") || catUpper.includes("MARKET") || catUpper.includes("ENABLEMENT")) {
                    role = "PMM";
                } else if (catUpper.includes("REVENUE") || catUpper.includes("EXECUTIVE")) {
                    role = "CPO";
                } else if (catUpper.includes("SUPPORT")) {
                    role = "SUPPORT_LEAD";
                } else {
                    role = "PM";
                }
            }

            // Map Category to Enum if possible, else OTHER
            let category: CriterionCategory = "OTHER";
            const catUpper = currentCategory.toUpperCase();
            if (catUpper.includes("PRODUCT") || catUpper.includes("FEATURE")) {
                category = "PRODUCT_TECH";
            } else if (catUpper.includes("GTM") || catUpper.includes("MARKET")) {
                category = "GTM";
            } else if (catUpper.includes("SUPPORT")) {
                category = "SUPPORT";
            } else if (catUpper.includes("DATA") || catUpper.includes("ANALYTICS")) {
                category = "DATA_ANALYTICS";
            } else if (catUpper.includes("LEGAL") || catUpper.includes("SECURITY")) {
                category = "LEGAL_SECURITY";
            } else if (catUpper.includes("OPS")) {
                category = "OPS";
            } else if (catUpper.includes("ENABLEMENT") || catUpper.includes("TRAINING")) {
                category = "GTM"; // Enablement falls under GTM
            }

            try {
                criteria.push({
                    label: label,
                    description: undefined,
                    category: category,
                    gate: false, // Template doesn't specify gate
                    tier_applicability: "ALL", // Default
                    decision_owner_role: role,
                    status_definition_go: row[4]?.toString() || null,
                    status_definition_conditional: row[5]?.toString() || null,
                    status_definition_no_go: row[6]?.toString() || null,
                    sort_order: sortOrder++,
                    is_active: true
                });
            } catch (e: any) {
                errors.push({ row: rowNumber, label, error: e.message });
                console.error(`[Import] Error processing row ${rowNumber} (${label}):`, e.message);
            }
        }

        console.log(`[Import] Parsed ${criteria.length} criteria from ${rows.length} rows`);

        if (commit) {
            const result = await upsertCriteriaBatch(criteria);
            return NextResponse.json({
                message: "Import successful",
                ...result,
                parseErrors: errors.length > 0 ? errors : undefined
            });
        } else {
            // Dry run preview
            return NextResponse.json({
                preview: criteria,
                count: criteria.length,
                message: "Dry run successful. Pass ?commit=true to save.",
                parseErrors: errors.length > 0 ? errors : undefined
            });
        }

    } catch (e: any) {
        console.error("Import error:", e);
        return NextResponse.json({ error: "Failed to process file", details: e.message, stack: e.stack }, { status: 500 });
    }
}
