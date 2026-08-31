import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureLaunchArtifacts } from '@/lib/artifacts/docFactory';
import {
    dispatchLaunchArtifactSetup,
    launchArtifactSetupTarget,
} from '@/lib/artifacts/backgroundSetup';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';
import { launchCriterionApplies, runwayDueDate, resolveCriterionOwner } from '@/lib/launchCriteria';
import { withLaunchStatus } from '@/lib/launch-status';

export const dynamic = 'force-dynamic';

async function getHandler(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const url = new URL(req.url);
        const includeArchived = url.searchParams.get('include_archived') === 'true';
        const scheduleId = url.searchParams.get('schedule_id');

        let query = supabase
            .from('launch')
            .select('*, launch_epic(id, epic_id, epic:epic(id, name, tier, readiness_score, readiness_status, status))')
            .order('created_at', { ascending: false });

        if (!includeArchived) {
            query = query.eq('archived', false);
        }
        if (scheduleId) {
            query = query.eq('schedule_id', parseInt(scheduleId));
        }

        const { data, error } = await query;
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Status is derived from the target date; the stored column holds only a
        // manual override. Deriving here means every launch consumer reads one
        // `status` field and none of them can serve a stale one.
        const now = new Date();
        const launches = (data || []).map((launch) => withLaunchStatus(launch, now));

        return NextResponse.json({ launches });
    } catch (error: any) {
        console.error('Error in GET /api/launches:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function postHandler(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const roles = [await resolveRole(user.email)];
        const rules = await getEffectivePermissionRules();
        if (!canRolesPerformWithRules(roles, 'launches.manage', rules)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { name, tier, target_launch_date, owner_email, schedule_id } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        if (tier && tier !== 'TIER_1' && tier !== 'TIER_2') {
            return NextResponse.json({ error: 'Launches must be Tier 1 or Tier 2' }, { status: 400 });
        }

        // Resolve owner_id from email if provided
        let owner_id = null;
        if (owner_email) {
            const { data: ownerUser } = await supabase
                .from('app_user')
                .select('id')
                .eq('email', owner_email.toLowerCase())
                .single();
            owner_id = ownerUser?.id || null;
        }

        const { data: launch, error } = await supabase
            .from('launch')
            .insert({
                name: name.trim(),
                tier: tier || null,
                target_launch_date: target_launch_date || null,
                // status is deliberately not set: the column stores overrides
                // only, and a new launch has none, so it derives from its dates.
                owner_id,
                owner_email: owner_email?.toLowerCase() || null,
                schedule_id: schedule_id || null,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Auto-instantiate launch criteria from criterion templates where context = 'launch'.
        // Tier drives the checklist: only templates applicable to the launch tier load.
        const { data: templates } = await supabase
            .from('criterion')
            .select('id, tier_applicability, default_owner_email, default_due_offset_days, tier_offset_days, depends_on_criterion_id')
            .eq('context', 'launch')
            .eq('is_active', true);

        const applicable = (templates || []).filter((t) =>
            launchCriterionApplies(t.tier_applicability, launch.tier)
        );

        if (applicable.length > 0) {
            const statusRows = applicable.map((t) => ({
                launch_id: launch.id,
                criterion_id: t.id,
                status: 'NOT_STARTED',
                owner_email: resolveCriterionOwner(t.default_owner_email, launch.owner_email),
                // Start date drives nothing stored yet; the due date is where the
                // successor artifact has to begin (see runwayDueOffsetDays).
                due_date: runwayDueDate(target_launch_date, t, templates || [], launch.tier),
            }));

            await supabase.from('launch_criterion_status').insert(statusRows);
        }

        // Gate checklist items. A gate is a set of items owned by different
        // functions (Beta alone spans PM, SE, UX, PMM and RevOps), so the items
        // instantiate alongside the criteria that contain them. Tolerant of a
        // missing table: until the 2026-08-21 bundle is applied in Supabase,
        // creating a launch must still work.
        if (applicable.length > 0) {
            const { data: itemTemplates, error: itemError } = await supabase
                .from('criterion_item')
                .select('id, criterion_id, label, default_owner_email, optional, sort_order')
                .in('criterion_id', applicable.map((t) => t.id))
                .eq('is_active', true);

            if (itemError) {
                console.warn('[launches] gate items not instantiated:', itemError.message);
            } else if (itemTemplates && itemTemplates.length > 0) {
                await supabase.from('launch_criterion_item').insert(
                    itemTemplates.map((t) => ({
                        launch_id: launch.id,
                        item_id: t.id,
                        // Copied, not joined, for the same reason launch_asset
                        // copies its label: a later template rename must not
                        // relabel items on launches that already shipped.
                        label: t.label,
                        status: 'NOT_STARTED',
                        // Deliberately NOT defaulted to the launch owner. An item's
                        // point is that it belongs to a specific function -- SE, UX,
                        // Legal, RevOps -- so an unassigned one shows that role until
                        // a real person takes it. Defaulting to the PMM made all 39
                        // items read as one person's work.
                        owner_email: t.default_owner_email?.startsWith('[')
                            ? null
                            : (t.default_owner_email ?? null),
                        optional: t.optional,
                        sort_order: t.sort_order,
                    }))
                );
            }
        }

        // Supporting assets (Marketing Brief Part 6) instantiate the same way the
        // checklist does, filtered by the same tier rule.
        const { data: assetTemplates } = await supabase
            .from('launch_asset_template')
            .select('id, label, tier_applicability, optional, default_owner_email, sort_order')
            .eq('is_active', true);

        const applicableAssets = (assetTemplates || []).filter((t) =>
            launchCriterionApplies(t.tier_applicability, launch.tier)
        );

        if (applicableAssets.length > 0) {
            await supabase.from('launch_asset').insert(
                applicableAssets.map((t) => ({
                    launch_id: launch.id,
                    template_id: t.id,
                    // Copied, not joined: renaming a template must not relabel
                    // assets on launches that already shipped.
                    label: t.label,
                    status: 'NOT_STARTED',
                    owner_email: resolveCriterionOwner(t.default_owner_email, launch.owner_email),
                    optional: t.optional,
                    sort_order: t.sort_order,
                }))
            );
        }

        // Launch artifacts: a row per document the tier calls for, and where
        // Google is configured, the Doc itself copied from Kristin's template.
        // Deliberately last and deliberately non-fatal -- a Drive outage must
        // not stop a launch being created, and ensureLaunchArtifacts is
        // idempotent so a later retry fills in whatever was missed.
        //
        // Handed to a background function on Netlify. For a Tier 1/2 launch this
        // is ~20 sequential Google calls, and netlify.toml caps a synchronous
        // function at 26s -- running it inline is what made this endpoint answer
        // a fully successful create with a timeout. Everything above is plain DB
        // work, so the response now goes back in about a second.
        let artifactsPending = false;
        const target = launchArtifactSetupTarget();

        if (target) {
            artifactsPending = await dispatchLaunchArtifactSetup(launch.id, target);
            if (!artifactsPending) {
                // Nothing will run, but the launch is real and the documents are
                // still one button press away, so this is logged rather than
                // failing a create that otherwise worked.
                console.warn(
                    `[launches] artifact setup not started for ${launch.id}; use "Create missing documents"`
                );
            }
        } else {
            try {
                const artifacts = await ensureLaunchArtifacts(launch.id, supabase);
                if (artifacts.errors.length > 0) {
                    console.warn('[launches] artifact setup partial:', artifacts.errors.join('; '));
                }
            } catch (artifactError) {
                console.warn('[launches] artifacts not instantiated:', artifactError);
            }
        }

        // artifacts_pending tells the client whether the documents exist yet, so
        // the toast can say "being set up" instead of implying it is all done.
        return NextResponse.json(
            { ...withLaunchStatus(launch), artifacts_pending: artifactsPending },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Error in POST /api/launches:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const POST = withRateLimit(postHandler, RATE_LIMITS.default);
