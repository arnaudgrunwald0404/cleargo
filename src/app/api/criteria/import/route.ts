                                                                                            import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { resolveRole } from "@/lib/roles";
import { upsertCriteriaBatch, CreateCriterionInput } from "@/lib/db/criteria";
import * as XLSX from "xlsx";
import { CriterionCategory, TierApplicability } from "@/types/criteria";

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
        let currentCategory: string = "";
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

            // Label should be in column B (index 1), skip if empty
            if (!colB) {
                continue;
            }

            const label = colB;

            // Always read category from column A
            if (colA) {
                currentCategory = colA;
                console.log(`[Import] Row ${rowNumber}: Category from column A: "${currentCategory}"`);
            } else if (!currentCategory) {
                // If column A is empty and we don't have a category yet, skip this row
                console.log(`[Import] Row ${rowNumber}: Skipping - no category in column A and no previous category`);
                continue;
            } else {
                // Column A is empty but we have a previous category - use it
                console.log(`[Import] Row ${rowNumber}: Using previous category: "${currentCategory}"`);
            }
            // Use currentCategory (either from this row's column A or from previous row)

            // Validate: skip rows with empty labels
            if (!label) {
                console.log(`[Import] Skipping row ${rowNumber}: empty label`);
                continue;
            }

            // Email is in Column C (index 2) - store exactly as provided
            const emailOrRoleRaw = colC ? colC.trim() : "";
            
            let decisionOwnerEmail: string | null = null;
            
            if (emailOrRoleRaw) {
                // Check if it's the placeholder for pod product manager
                const isPodPmPlaceholder = emailOrRoleRaw.toLowerCase().includes("pod") && 
                                          emailOrRoleRaw.toLowerCase().includes("product manager");
                
                if (isPodPmPlaceholder || emailOrRoleRaw === POD_PM_PLACEHOLDER) {
                    // Store the placeholder exactly as provided
                    decisionOwnerEmail = POD_PM_PLACEHOLDER;
                } else if (emailOrRoleRaw.includes("@")) {
                    // It's an email address - store it exactly as provided
                    decisionOwnerEmail = emailOrRoleRaw;
                } else {
                    // It's not an email or placeholder - store as null
                    decisionOwnerEmail = null;
                }
            }
            
            console.log(`[Import] Row ${rowNumber}: Column C="${emailOrRoleRaw}" -> email="${decisionOwnerEmail}"`);

            // Use the exact text from column A as category (no mapping)
            // If no category has been set yet, use "OTHER" as fallback
            const category = (currentCategory || "OTHER") as CriterionCategory;

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
            console.log(`[Import] Committing ${criteria.length} criteria to database...`);
            if (criteria.length === 0) {
                console.warn(`[Import] Warning: No criteria to import!`);
            }
            const result = await upsertCriteriaBatch(criteria);
            console.log(`[Import] Result: created=${result.created}, updated=${result.updated}, errors=${result.errors.length}`);
            if (result.errors.length > 0) {
                console.error(`[Import] Errors during upsert:`, result.errors);
            }
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
