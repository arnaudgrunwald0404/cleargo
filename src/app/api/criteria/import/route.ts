import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { resolveRole } from "@/lib/roles";
import { upsertCriteriaBatch, CreateCriterionInput } from "@/lib/db/criteria";
import * as XLSX from "xlsx";
import { CriterionCategory, DecisionOwnerRole, TierApplicability } from "@/types/criteria";

const POD_PM_PLACEHOLDER = "[name of pod's product manager]";

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

        // Start from row 19 (index 18) - row 18 is headers
        const startRowIndex = 18; // Row 19 in Excel (0-indexed), skipping header row 18

        console.log(`[Import] Starting data parse from row ${startRowIndex + 1} (row 19, skipping header row 18)`);

        for (let i = startRowIndex; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 1; // 1-indexed for user-friendly error messages

            // Skip completely empty rows
            if (!row || (row.length === 0)) {
                continue;
            }

            // Get values from columns, handling undefined/null/empty strings
            const colA = row[0] ? row[0].toString().trim() : "";
            const colB = row[1] ? row[1].toString().trim() : "";
            const colC = row[2] ? row[2].toString().trim() : "";
            // Columns E, F, G: Status definitions (GO, CONDITIONAL GO, NO GO)
            const colE = row[4] ? row[4].toString().trim() : "";
            const colF = row[5] ? row[5].toString().trim() : "";
            const colG = row[6] ? row[6].toString().trim() : "";

            // Update category if present in Column A (index 0)
            // Only update if column A has a value AND column B also has a value (actual data row)
            // OR if column A has a value but column B is empty (category header row)
            if (colA) {
                // If column B is empty, this is likely a category header row
                if (!colB) {
                    currentCategory = colA;
                    console.log(`[Import] Row ${rowNumber}: Found category header: "${colA}"`);
                    continue; // Skip category header rows
                } else {
                    // Both A and B have values - A is category, B is label
                    currentCategory = colA;
                }
            }
            // If column A is empty but column B has a value, use previous category

            // Label should be in column B (index 1), skip if empty
            if (!colB) {
                continue;
            }

            const label = colB;

            // Validate: skip rows with empty labels
            if (!label) {
                console.log(`[Import] Skipping row ${rowNumber}: empty label`);
                continue;
            }

            // Email/role is in Column C (index 2)
            const emailOrRoleRaw = colC;
            
            // Check if it's the placeholder for pod product manager
            const isPodPmPlaceholder = emailOrRoleRaw.toLowerCase().includes("pod") && 
                                      emailOrRoleRaw.toLowerCase().includes("product manager");
            
            let decisionOwnerEmail: string | null = null;
            let role: DecisionOwnerRole = "PM";
            
            if (isPodPmPlaceholder || emailOrRoleRaw === POD_PM_PLACEHOLDER) {
                // Store the placeholder
                decisionOwnerEmail = POD_PM_PLACEHOLDER;
                role = "PM"; // Default role for pod product managers
            } else if (emailOrRoleRaw.includes("@")) {
                // It's an email address
                decisionOwnerEmail = emailOrRoleRaw;
                // Try to infer role from email or default to PM
                const emailUpper = emailOrRoleRaw.toUpperCase();
                if (emailUpper.includes("PMM") || emailUpper.includes("MARKETING")) {
                    role = "PMM";
                } else if (emailUpper.includes("ENG") || emailUpper.includes("ENGINEERING")) {
                    role = "ENG_LEAD";
                } else if (emailUpper.includes("SUPPORT")) {
                    role = "SUPPORT_LEAD";
                } else if (emailUpper.includes("SECURITY")) {
                    role = "SECURITY";
                } else if (emailUpper.includes("LEARNING") || emailUpper.includes("ENABLEMENT")) {
                    role = "LEARNING";
                } else if (emailUpper.includes("OPS")) {
                    role = "PRODUCT_OPS";
                } else {
                    role = "PM"; // Default
                }
            } else if (emailOrRoleRaw) {
                // It's a role name, not an email
                const upper = emailOrRoleRaw.toUpperCase();
                if (upper === "SAM") {
                    role = "LEARNING";
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
            
            // More comprehensive category mapping
            if (catUpper.includes("PRODUCT") || catUpper.includes("FEATURE") || 
                catUpper.includes("DOCUMENTATION") || catUpper.includes("PM DOCUMENTATION")) {
                category = "PRODUCT_DOCUMENTATION";
            } else if (catUpper.includes("GTM") || catUpper.includes("MARKET") || 
                       catUpper.includes("GO-TO-MARKET") || catUpper.includes("MARKETING")) {
                category = "GTM";
            } else if (catUpper.includes("SUPPORT")) {
                category = "SUPPORT";
            } else if (catUpper.includes("DATA") || catUpper.includes("ANALYTICS") || 
                       catUpper.includes("METRICS") || catUpper.includes("MEASUREMENT")) {
                category = "ANALYTICS_AND_METRICS";
            } else if (catUpper.includes("LEGAL") || catUpper.includes("SECURITY") || 
                       catUpper.includes("COMPLIANCE") || catUpper.includes("PRIVACY")) {
                category = "LEGAL_SECURITY";
            } else if (catUpper.includes("OPS") || catUpper.includes("OPERATIONS")) {
                category = "OPS";
            } else if (catUpper.includes("ENABLEMENT") || catUpper.includes("TRAINING") || 
                       catUpper.includes("LEARNING")) {
                category = "GTM"; // Enablement falls under GTM
            } else if (catUpper.includes("EXECUTIVE") || catUpper.includes("STRATEGIC") || 
                       catUpper.includes("BUSINESS") || catUpper.includes("REVENUE") ||
                       catUpper.includes("FOUNDATION")) {
                // Executive/Strategic/Business categories could map to PRODUCT_TECH or OTHER
                // Defaulting to PRODUCT_TECH for now, but could be adjusted
                category = "STRATEGY";
            }

            // Convert empty strings to null for status definitions
            const statusGo = colE || null;
            const statusConditional = colF || null;
            const statusNoGo = colG || null;

            try {
                criteria.push({
                    label: label,
                    description: undefined,
                    category: category,
                    gate: false, // Template doesn't specify gate
                    tier_applicability: "ALL", // Default
                    decision_owner_role: role,
                    decision_owner_email: decisionOwnerEmail,
                    status_definition_go: statusGo,
                    status_definition_conditional: statusConditional,
                    status_definition_no_go: statusNoGo,
                    sort_order: sortOrder++,
                    is_active: true
                });
                const statusDefs = [statusGo ? "GO" : "", statusConditional ? "CONDITIONAL" : "", statusNoGo ? "NO_GO" : ""].filter(Boolean).join(", ");
                console.log(`[Import] Row ${rowNumber}: Added "${label}" with category "${currentCategory}" -> "${category}"${statusDefs ? `, status definitions: ${statusDefs}` : ""}`);
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
