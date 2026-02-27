import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { resolveRole } from "@/lib/roles";
import { upsertCriteriaBatch, CreateCriterionInput } from "@/lib/db/criteria";
import { getEffectivePermissionRules } from "@/lib/settings-db";
import { canRolesPerformWithRules } from "@/lib/permissions";
import * as XLSX from "xlsx";
import { CriterionCategory, TierApplicability } from "@/types/criteria";

const POD_PM_PLACEHOLDER = "[name of pod's product manager]";

export async function POST(req: NextRequest) {
    // Debug header
    const debugHeaders = { 'X-Debug-Handler': 'CriteriaImport' };

    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) {
            return NextResponse.json({
                error: "Unauthorized (No User)"
            }, { status: 401, headers: debugHeaders });
        }
        const role = await resolveRole(user.email);
        if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return new NextResponse("Forbidden", { status: 403 });
        // Capability: criteria.import
        const { data: me, error: userError } = await supabase
          .from('app_user')
          .select('roles')
          .eq('email', user.email)
          .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError && userError.code === 'PGRST116') {
          return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError) {
          throw userError;
        }
        
        const rules = await getEffectivePermissionRules();
        const ok = canRolesPerformWithRules((me?.roles as string[]) || [], 'criteria.import', rules);
        if (!ok) return new NextResponse('Forbidden', { status: 403 });
    } catch (authError) {
        console.error('[Import] Auth error:', authError);
        return NextResponse.json({
            error: "Unauthorized"
        }, { status: 401 });
    }
    try {
        const cookieStore = await cookies();
        // Use new publishable key, fallback to legacy anon key for backward compatibility
        const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!publishableKey) {
            throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
        }
        
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            publishableKey,
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
        if (!(role === "SUPERADMIN" || role === "PRODUCT_OPS" || role === "CPO")) return new NextResponse("Forbidden", { status: 403 });
        const { data: me2, error: userError2 } = await supabase
          .from('app_user')
          .select('roles')
          .eq('email', user.email)
          .single();
        
        // Handle case where user doesn't exist in app_user table
        if (userError2 && userError2.code === 'PGRST116') {
          return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
        }
        if (userError2) {
          throw userError2;
        }
        
        const { canRolesPerform: can } = await import('@/lib/permissions');
        const ok2 = await can((me2?.roles as string[]) || [], 'criteria.import');
        if (!ok2) return new NextResponse('Forbidden', { status: 403 });

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const commit = req.nextUrl.searchParams.get("commit") === "true";

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        const fileName = (file.name || "").toLowerCase();
        const isCsv = fileName.endsWith(".csv");
        let rows: any[] = [];

        if (isCsv) {
            const text = await file.text();
            const workbook = XLSX.read(text, { type: "string", raw: true });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        } else {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array" });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        }

        // Fetch launch stages to map names to IDs
        const { data: launchStages, error: stagesError } = await supabase
            .from('launch_stages')
            .select('id, name');
        
        if (stagesError) {
            console.error('[Import] Error fetching launch stages:', stagesError);
            return NextResponse.json({ error: "Failed to fetch launch stages", details: stagesError.message }, { status: 500 });
        }

        // Create a map from launch stage name to ID
        const launchStageMap = new Map<string, number>();
        (launchStages || []).forEach((stage: { id: number; name: string }) => {
            launchStageMap.set(stage.name.toLowerCase().trim(), stage.id);
        });
        
        console.log(`[Import] Loaded ${launchStageMap.size} launch stages for mapping`);

        const criteria: CreateCriterionInput[] = [];
        const errors: Array<{ row: number; label: string; error: string }> = [];
        let currentCategory: string = "";
        let sortOrder = 0;

        // Detect start row: if first row looks like a header (contains "category", "criteria", or "label"), start from row 1
        let startRowIndex = 0;
        const firstCell = rows[0] && rows[0][0] ? String(rows[0][0]).toLowerCase().trim() : "";
        const looksLikeHeader = /category|criteria|label/.test(firstCell);
        if (looksLikeHeader && rows.length > 1) {
            startRowIndex = 1;
            console.log(`[Import] Detected header row; data starts at row 2 (index 1)`);
        } else {
            console.log(`[Import] Data starts at row 1 (index 0)`);
        }
        console.log(`[Import] Column mapping: A=Category, B=Label, C=Decision Owner, D=Ready By, E=GO, F=CONDITIONAL GO, G=NO GO, H=UI Framework Only, I=Gate, J=Tier`);

        for (let i = startRowIndex; i < rows.length; i++) {
            const row = rows[i];
            const rowNumber = i + 1; // 1-indexed for user-friendly error messages

            // Skip completely empty rows
            if (!row || (row.length === 0)) {
                continue;
            }

            // Get values from columns, handling undefined/null/empty strings
            // Column A (index 0): Category
            const colA = row[0] ? row[0].toString().trim() : "";
            // Column B (index 1): Criteria/Label
            const colB = row[1] ? row[1].toString().trim() : "";
            // Column C (index 2): Stakeholder/Decision Owner Email
            const colC = row[2] ? row[2].toString().trim() : "";
            // Column D (index 3): Ready By - the timing by which the criteria needs to be rated
            const colD = row[3] ? row[3].toString().trim() : "";
            // Column E (index 4): GO definition
            const colE = row[4] ? row[4].toString().trim() : "";
            // Column F (index 5): CONDITIONAL GO definition
            const colF = row[5] ? row[5].toString().trim() : "";
            // Column G (index 6): NO GO definition
            const colG = row[6] ? row[6].toString().trim() : "";
            // Column H (index 7, optional): UI Framework Only
            const colH = row[7] ? row[7].toString().trim().toLowerCase() : "";
            const uiFrameworkOnly = /^(true|yes|1)$/.test(colH);
            // Column I (index 8, optional): Gate - blocks launch if NO_GO
            const colI = row[8] ? row[8].toString().trim().toLowerCase() : "";
            const gate = /^(true|yes|1)$/.test(colI);
            // Column J (index 9, optional): Tier applicability - ALL, TIER_1_ONLY, TIER_1_AND_2, TIER_2_ONLY, TIER_3_ONLY
            const colJ = row[9] ? row[9].toString().trim().toUpperCase().replace(/\s/g, "_") : "";
            const tierRaw = colJ || "ALL";
            const tierApplicability: TierApplicability =
                tierRaw === "TIER_1_ONLY" ? "TIER_1_ONLY" :
                tierRaw === "TIER_1_AND_2" ? "TIER_1_AND_2" :
                tierRaw === "TIER_2_ONLY" ? "TIER_2_ONLY" :
                tierRaw === "TIER_3_ONLY" ? "TIER_3_ONLY" : "ALL";

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

            // Column D (index 3): Ready By - Rating timing (look up launch stage ID by name)
            let ratingTimingId: number | null = null;
            if (colD) {
                const stageNameLower = colD.toLowerCase().trim();
                const stageId = launchStageMap.get(stageNameLower);
                if (stageId) {
                    ratingTimingId = stageId;
                } else {
                    console.warn(`[Import] Row ${rowNumber}: Launch stage "${colD}" not found in launch_stages table`);
                    // Still continue, but rating_timing will be null
                }
            }
            
            // Status definitions: GO (E/4), CONDITIONAL GO (F/5), NO GO (G/6)
            const statusGo = colE || null;
            const statusConditional = colF || null;
            const statusNoGo = colG || null;
            
            console.log(`[Import] Row ${rowNumber}: Ready By="${colD}" -> rating_timing_id=${ratingTimingId}, Gate=${gate}, Tier=${tierApplicability}, UI Fwk=${uiFrameworkOnly}, GO/Cond/NoGo`);

            try {
                criteria.push({
                    label: label,
                    description: undefined,
                    category: category,
                    gate,
                    tier_applicability: tierApplicability,
                    ui_framework_only: uiFrameworkOnly,
                    decision_owner_email: decisionOwnerEmail,
                    rating_timing: ratingTimingId,
                    status_definition_go: statusGo,
                    status_definition_conditional: statusConditional,
                    status_definition_no_go: statusNoGo,
                    sort_order: sortOrder++,
                    is_active: true
                });
                const statusDefs = [statusGo ? "GO" : "", statusConditional ? "CONDITIONAL" : "", statusNoGo ? "NO_GO" : ""].filter(Boolean).join(", ");
                console.log(`[Import] Row ${rowNumber}: Added "${label}" with category "${currentCategory}" -> "${category}", rating_timing_id=${ratingTimingId}${statusDefs ? `, status definitions: ${statusDefs}` : ""}`);
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
