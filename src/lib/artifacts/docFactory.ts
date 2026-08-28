/**
 * Creating and filling the launch's Google Docs.
 *
 * Runs on launch creation, and is idempotent: re-running must never produce a
 * second copy of a document someone is already editing. Idempotency is enforced
 * twice — by the UNIQUE(launch_id, artifact_type) row and by checking the Drive
 * folder before copying, because a row could be lost while the file survives.
 *
 * Degrades cleanly when Google is unconfigured: rows are still created with
 * null doc ids so the runway, ownership, and review workflow all work, and a
 * later `backfillArtifactDocs` fills the documents in once credentials land.
 */
import { createAdminClient } from '@/lib/supabase/server';
import { isGoogleConfigured } from '@/lib/google/auth';
import { copyFile, createFolder, listFolderChildren, shareFile, replaceTokens } from '@/lib/google/client';
import {
    ARTIFACT_FILENAME_PART,
    ARTIFACT_FOLDER_PREFIX,
    type ArtifactType,
} from '@/types/artifacts';
import type { LaunchTier } from '@/types/launches';
import { artifactsForTier, getTemplateId, resolveArtifactOwner, type ArtifactDefinition } from './registry';

type Supabase = ReturnType<typeof createAdminClient>;

/** Root folder that per-launch folders are created inside. */
function getRootFolderId(): string | null {
    return process.env.GOOGLE_LAUNCH_DRIVE_FOLDER_ID?.trim() || null;
}

/**
 * Words that identify the company rather than the launch.
 *
 * Stripped before deriving a code, because almost every launch here is named
 * "ClearCo Something" and coding the first five characters would file all of
 * them as CLEAR — colliding on the one part of the name that carries no
 * information.
 */
const COMPANY_PREFIXES = ['clearcompany', 'clearco', 'clear'];

/**
 * A short code for filenames, per Kristin's `[CODE]_Story-Brief_v0.1`
 * convention. Launches have no code column, so it is derived from the name.
 *
 * The rule is the first five alphanumeric characters of the DISTINCTIVE part of
 * the name, uppercased — not initials, and not the company prefix. Her own
 * filed documents settle both halves: she coded "ClearCo Agent Platform" as
 * AGENT (dropping the company, so not first-five-of-everything) and "Copy
 * Requisition" as COPYR (leading characters, so not initials — those would give
 * AP and CR).
 *
 * A display convention, not an identifier: two launches can still collide, and
 * that is harmless because documents are addressed by Drive id.
 */
export function deriveStoryCode(launchName: string): string {
    const words = launchName
        .replace(/[^A-Za-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    // Drop leading company words, but never everything: a launch actually
    // called "ClearCo" should still get a code.
    let start = 0;
    while (start < words.length - 1 && COMPANY_PREFIXES.includes(words[start].toLowerCase())) {
        start += 1;
    }

    const alphanumeric = words.slice(start).join('');
    if (!alphanumeric) return 'LAUNCH';
    return alphanumeric.slice(0, 5).toUpperCase();
}

export function artifactFileName(
    code: string,
    type: ArtifactType,
    version = 'v0.1'
): string {
    return `${code}_${ARTIFACT_FILENAME_PART[type]}_${version}`;
}

export interface HeaderFacts {
    launchName: string;
    tier: LaunchTier | null;
    targetLaunchDate: string | null;
    pmEmail: string | null;
    pmmEmail: string | null;
}

/**
 * The header block every template carries.
 *
 * MUST cover every token the templates use outside a body section. A token
 * filled by neither this map nor render.ts survives into a circulated document
 * as a literal `{{tier}}`, which is the most embarrassing possible failure —
 * so this errs toward "Not set" over omission.
 */
export function buildHeaderTokens(
    def: ArtifactDefinition,
    code: string,
    ownerEmail: string | null,
    facts: HeaderFacts
): Record<string, string> {
    const tierLabel = facts.tier === 'TIER_1' ? '1' : facts.tier === 'TIER_2' ? '2' : 'Not set';
    return {
        story_code: code,
        artifact_label: def.label,
        version: 'v0.1',
        owner: ownerEmail ?? 'Unassigned',
        launch_name: facts.launchName,
        tier: tierLabel,
        target_window: facts.targetLaunchDate ?? 'TBD',
        // Story goes to the PM, everything downstream to PMM; the header names
        // both regardless of which one owns this particular document.
        pm_owner: facts.pmEmail ?? 'Unassigned',
        pmm_owner: facts.pmmEmail ?? 'Unassigned',
        prod_ed_owner: 'Unassigned',
    };
}

export interface EnsureArtifactsResult {
    created: number;
    docsCreated: number;
    skipped: number;
    googleConfigured: boolean;
    errors: string[];
}

/**
 * Ensure a launch has an artifact row — and where possible a Google Doc — for
 * every artifact its tier calls for.
 */
export async function ensureLaunchArtifacts(
    launchId: string,
    supabase: Supabase = createAdminClient()
): Promise<EnsureArtifactsResult> {
    const result: EnsureArtifactsResult = {
        created: 0,
        docsCreated: 0,
        skipped: 0,
        googleConfigured: await isGoogleConfigured(),
        errors: [],
    };

    const { data: launch, error } = await supabase
        .from('launch')
        .select('id, name, tier, owner_email, target_launch_date')
        .eq('id', launchId)
        .single();

    if (error || !launch) {
        result.errors.push(`Launch ${launchId} not found`);
        return result;
    }

    const tier = (launch.tier as LaunchTier) ?? null;
    const definitions = artifactsForTier(tier);

    const { data: existingRows } = await supabase
        .from('launch_artifact')
        .select('artifact_type, doc_id')
        .eq('launch_id', launchId);
    const existing = new Map(
        ((existingRows ?? []) as Array<{ artifact_type: ArtifactType; doc_id: string | null }>).map(
            (r) => [r.artifact_type, r]
        )
    );

    // The runway criteria this launch already has, so each document can point
    // at the checklist row it satisfies.
    const criterionIdByLabel = await loadCriterionIds(supabase);
    const pmEmail = await loadPrimaryPmEmail(launchId, supabase);

    let folderId: string | null = null;
    if (result.googleConfigured && getRootFolderId()) {
        try {
            folderId = await ensureLaunchFolder(launch.name as string, launchId, supabase);
        } catch (err) {
            result.errors.push(`Drive folder: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    const code = deriveStoryCode(launch.name as string);

    for (const def of definitions) {
        const prior = existing.get(def.type);
        if (prior?.doc_id) {
            result.skipped += 1;
            continue;
        }

        const ownerEmail = resolveArtifactOwner(def, {
            launchOwnerEmail: launch.owner_email as string | null,
            pmEmail,
            criterionDefaultOwner: null,
        });

        let doc: { id: string; url: string } | null = null;
        if (folderId) {
            try {
                doc = await createArtifactDoc(def, code, folderId, ownerEmail, {
                    launchName: launch.name as string,
                    tier,
                    targetLaunchDate: (launch.target_launch_date as string) ?? null,
                    pmEmail,
                    pmmEmail: (launch.owner_email as string) ?? null,
                });
            } catch (err) {
                result.errors.push(
                    `${def.label}: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        }

        const row = {
            launch_id: launchId,
            artifact_type: def.type,
            criterion_id: resolveCriterionId(def, criterionIdByLabel),
            doc_id: doc?.id ?? null,
            doc_url: doc?.url ?? null,
            folder_id: folderId,
            owner_email: ownerEmail,
        };

        // Upsert rather than insert: a prior run may have made the row without a
        // document, and this run is filling the document in.
        const { error: upsertError } = await supabase
            .from('launch_artifact')
            .upsert(row, { onConflict: 'launch_id,artifact_type' });

        if (upsertError) {
            result.errors.push(`${def.label}: ${upsertError.message}`);
            continue;
        }

        if (!prior) result.created += 1;
        if (doc) {
            result.docsCreated += 1;
            await linkDocToCriterion(launchId, row.criterion_id, def.label, doc.url, supabase);
        }
    }

    return result;
}

/**
 * Copy one template into the launch folder and stamp its header tokens.
 *
 * Header-only for now: the section tokens are filled by the drafting agent,
 * because a document created at launch time has nothing to say yet.
 */
async function createArtifactDoc(
    def: ArtifactDefinition,
    code: string,
    folderId: string,
    ownerEmail: string | null,
    header: HeaderFacts
): Promise<{ id: string; url: string }> {
    const templateId = getTemplateId(def);
    if (!templateId) {
        throw new Error(`No template configured (set ${def.templateEnvVar})`);
    }

    const name = `${ARTIFACT_FOLDER_PREFIX[def.type]} ${artifactFileName(code, def.type)}`;

    // Second idempotency guard: a row can be lost while the file survives, and
    // creating a duplicate of a document someone is editing is unrecoverable.
    const siblings = await listFolderChildren(folderId);
    const already = siblings.find((f) => f.name === name);
    if (already) {
        return { id: already.id, url: already.webViewLink ?? docUrl(already.id) };
    }

    const copied = await copyFile(templateId, name, folderId);

    await replaceTokens(copied.id, buildHeaderTokens(def, code, ownerEmail, header));

    if (ownerEmail) {
        // The bot created the file, so without this the owner cannot open the
        // document they are about to be asked to review.
        try {
            await shareFile(copied.id, ownerEmail, 'writer');
        } catch (err) {
            console.warn(`Could not share ${name} with ${ownerEmail}`, err);
        }
    }

    return { id: copied.id, url: copied.webViewLink ?? docUrl(copied.id) };
}

function docUrl(id: string): string {
    return `https://docs.google.com/document/d/${id}/edit`;
}

/** One Drive folder per launch, reused across runs. */
async function ensureLaunchFolder(
    launchName: string,
    launchId: string,
    supabase: Supabase
): Promise<string> {
    const { data: existing } = await supabase
        .from('launch_artifact')
        .select('folder_id')
        .eq('launch_id', launchId)
        .not('folder_id', 'is', null)
        .limit(1);

    const known = (existing ?? [])[0] as { folder_id?: string } | undefined;
    if (known?.folder_id) return known.folder_id;

    const root = getRootFolderId();
    if (!root) throw new Error('GOOGLE_LAUNCH_DRIVE_FOLDER_ID is not set');

    const folderName = `${deriveStoryCode(launchName)} — ${launchName}`;
    const siblings = await listFolderChildren(root);
    const match = siblings.find((f) => f.name === folderName);
    if (match) return match.id;

    const folder = await createFolder(folderName, root);
    return folder.id;
}

/**
 * Find the criterion this document satisfies, falling back to any label it used
 * to carry. Without the fallback a renamed artifact links to nothing in an
 * environment where the rename migration has not been applied — and it fails
 * silently, since a null criterion_id is legal.
 */
export function resolveCriterionId(
    def: Pick<ArtifactDefinition, 'criterionLabel' | 'legacyCriterionLabels'>,
    byLabel: Map<string, string>
): string | null {
    if (!def.criterionLabel) return null;
    const current = byLabel.get(def.criterionLabel);
    if (current) return current;

    for (const legacy of def.legacyCriterionLabels ?? []) {
        const found = byLabel.get(legacy);
        if (found) return found;
    }
    return null;
}

/** criterion.label -> id for launch-context rows. Labels are the only stable key. */
async function loadCriterionIds(supabase: Supabase): Promise<Map<string, string>> {
    const { data } = await supabase
        .from('criterion')
        .select('id, label')
        .eq('context', 'launch');

    return new Map(
        ((data ?? []) as Array<{ id: string; label: string }>).map((c) => [c.label, c.id])
    );
}

/** The PM who owns the launch's first epic — Story Brief goes to them, not PMM. */
async function loadPrimaryPmEmail(launchId: string, supabase: Supabase): Promise<string | null> {
    const { data } = await supabase
        .from('launch_epic')
        .select('epic:epic(owner_email)')
        .eq('launch_id', launchId)
        .limit(1);

    const row = (data ?? [])[0] as { epic?: { owner_email?: string } | { owner_email?: string }[] } | undefined;
    if (!row?.epic) return null;
    const epic = Array.isArray(row.epic) ? row.epic[0] : row.epic;
    return epic?.owner_email ?? null;
}

/**
 * Write the doc URL into the runway row's links array.
 *
 * This is what makes existing readiness keep working: "Story Brief delivered"
 * has always been satisfied by a link in launch_criterion_status.links, and the
 * checklist UI already renders it. Rather than replace that, the factory fills
 * it in automatically.
 */
async function linkDocToCriterion(
    launchId: string,
    criterionId: string | null,
    label: string,
    url: string,
    supabase: Supabase
): Promise<void> {
    if (!criterionId) return;

    const { data: row } = await supabase
        .from('launch_criterion_status')
        .select('id, links')
        .eq('launch_id', launchId)
        .eq('criterion_id', criterionId)
        .maybeSingle();

    if (!row) return;

    const existing = Array.isArray(row.links) ? (row.links as Array<{ url?: string }>) : [];
    if (existing.some((l) => l?.url === url)) return;

    await supabase
        .from('launch_criterion_status')
        .update({ links: [...existing, { url, label }] })
        .eq('id', row.id);
}
