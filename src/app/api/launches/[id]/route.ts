import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRateLimit, RATE_LIMITS } from '@/lib/middleware/rate-limit-middleware';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import { resolveRole } from '@/lib/roles';
import { calculateLaunchReadiness } from '@/lib/launch-readiness';
import { launchCriterionApplies, runwayDueDate, resolveCriterionOwner, gateStatusFromItems, type CriterionScheduleNode } from '@/lib/launchCriteria';
import { isLaunchStatus, withLaunchStatus, LAUNCH_STATUSES } from '@/lib/launch-status';

export const dynamic = 'force-dynamic';

async function getHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: launch, error } = await supabase
            .from('launch')
            .select(`
                *,
                launch_epic(id, epic_id, epic:epic(id, name, tier, readiness_score, readiness_status, status, target_launch_date)),
                launch_criterion_status(
                    id, criterion_id, status, owner_id, owner_email, due_date, notes, links, last_updated_at,
                    criterion:criterion(id, label, description, phase, category, gate, tier_applicability, sort_order, is_active, default_due_offset_days, tier_offset_days)
                )
            `)
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Launch not found' }, { status: 404 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // `is_active` has always been selected here and never used, so retiring a
        // criterion template left it on every launch that had already instantiated
        // it. The 44 pre-workback rows retired in 20260821000600 depend on this
        // filter actually being applied.
        const activeStatuses = (launch.launch_criterion_status || []).filter(
            (s: any) => s.criterion?.is_active !== false
        );

        // Gate checklist items, and the co-signatures collected so far. Queried
        // separately and tolerant of failure: until the 2026-08-21 bundle is run
        // in Supabase these tables do not exist, and a missing table must degrade
        // to "no items" rather than 500 the launch page.
        let items: any[] = [];
        let signoffs: any[] = [];
        const [itemRes, signoffRes] = await Promise.all([
            supabase
                .from('launch_criterion_item')
                .select(`
                    id, item_id, label, status, owner_email, notes, links, optional, sort_order, last_updated_at,
                    template:criterion_item(id, criterion_id, description, owner_role, kind)
                `)
                .eq('launch_id', id),
            supabase
                .from('launch_criterion_signoff')
                .select('id, criterion_id, role, signer_user_id, signer_name, signer_email, signed_at, notes')
                .eq('launch_id', id),
        ]);

        if (itemRes.error) {
            console.warn('[launches/:id] gate items unavailable:', itemRes.error.message);
        } else {
            items = (itemRes.data || []).map((row: any) => ({
                ...row,
                criterion_id: row.template?.criterion_id ?? null,
                owner_role: row.template?.owner_role ?? null,
                kind: row.template?.kind ?? 'check',
                description: row.template?.description ?? null,
            }));
        }
        if (signoffRes.error) {
            console.warn('[launches/:id] sign-offs unavailable:', signoffRes.error.message);
        } else {
            signoffs = signoffRes.data || [];
        }

        // A gate is no longer voted on directly: it clears when the items inside
        // it clear. Gates with no items keep whatever status they carry, so a
        // criterion that has not been decomposed still behaves as it always did.
        const itemsByCriterion = new Map<string, any[]>();
        for (const it of items) {
            if (!it.criterion_id) continue;
            const list = itemsByCriterion.get(it.criterion_id) || [];
            list.push(it);
            itemsByCriterion.set(it.criterion_id, list);
        }

        // A gate with items clears when its items clear. Nothing else is derived:
        // a launch requires explicit action, so a sign-off is answered here rather
        // than inherited from the epics it bundles.
        const resolvedStatuses = activeStatuses.map((s: any) => {
            const own = itemsByCriterion.get(s.criterion_id);
            const fromItems = own ? gateStatusFromItems(own) : null;
            return {
                ...s,
                status: fromItems ?? s.status,
                // Kept so the UI can explain why a status is not editable here.
                status_source: fromItems ? 'items' : 'direct',
                items: own ?? [],
                signoffs: signoffs.filter((so: any) => so.criterion_id === s.criterion_id),
            };
        });

        return NextResponse.json({
            // Derives `status` from the target date unless an override is pinned.
            ...withLaunchStatus(launch),
            launch_criterion_status: resolvedStatuses,
        });
    } catch (error: any) {
        console.error('Error in GET /api/launches/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function patchHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const roles = [await resolveRole(user.email)];
        const rules = await getEffectivePermissionRules();
        const canManage = canRolesPerformWithRules(roles, 'launches.manage', rules);
        // Status is gated separately from the rest of the launch record. PMM owns
        // the record (launches.manage) while Product Ops / CPO carry
        // launch.status.update, and putting a launch On Hold or Cancelled has to
        // be open to both -- so either capability admits a status-only change.
        const canSetStatus =
            canManage || canRolesPerformWithRules(roles, 'launch.status.update', rules);
        if (!canManage && !canSetStatus) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const allowedFields = ['name', 'tier', 'target_launch_date', 'status', 'owner_email', 'schedule_id', 'brief_url', 'feg_url', 'archived'];
        const requestedFields = allowedFields.filter((key) => key in body);

        if (!canManage && requestedFields.some((key) => key !== 'status')) {
            return NextResponse.json(
                { error: 'Your role can change launch status only' },
                { status: 403 }
            );
        }

        if ('tier' in body && body.tier !== null && body.tier !== 'TIER_1' && body.tier !== 'TIER_2') {
            return NextResponse.json({ error: 'tier must be TIER_1 or TIER_2' }, { status: 400 });
        }

        // null is meaningful: it clears the override so the launch tracks its
        // dates again. Anything outside the vocabulary is rejected here rather
        // than left to the column's CHECK constraint.
        if ('status' in body && body.status !== null && !isLaunchStatus(body.status)) {
            return NextResponse.json(
                { error: `status must be null or one of: ${LAUNCH_STATUSES.join(', ')}` },
                { status: 400 }
            );
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };

        for (const key of requestedFields) {
            updates[key] = body[key];
        }

        // Resolve owner_id if email changed
        if ('owner_email' in body) {
            if (body.owner_email) {
                const { data: ownerUser } = await supabase
                    .from('app_user')
                    .select('id')
                    .eq('email', body.owner_email.toLowerCase())
                    .single();
                updates.owner_id = ownerUser?.id || null;
                updates.owner_email = body.owner_email.toLowerCase();
            } else {
                updates.owner_id = null;
                updates.owner_email = null;
            }
        }

        // Snapshot the pre-update launch so tier/date changes can sync the checklist
        const { data: before } = await supabase
            .from('launch')
            .select('tier, target_launch_date')
            .eq('id', id)
            .single();

        const { data, error } = await supabase
            .from('launch')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Tier drives the checklist: on tier change, add newly-applicable
        // criteria and drop no-longer-applicable ones that are still untouched.
        if (before && 'tier' in updates && data.tier !== before.tier) {
            const { data: templates } = await supabase
                .from('criterion')
                .select('id, tier_applicability, default_owner_email, default_due_offset_days, tier_offset_days, depends_on_criterion_id')
                .eq('context', 'launch')
                .eq('is_active', true);
            const { data: tasks } = await supabase
                .from('launch_criterion_status')
                .select('id, criterion_id, status')
                .eq('launch_id', id);

            const applicableIds = new Set(
                (templates || [])
                    .filter((t) => launchCriterionApplies(t.tier_applicability, data.tier))
                    .map((t) => t.id)
            );
            const haveIds = new Set((tasks || []).map((t) => t.criterion_id));

            const toAdd = (templates || [])
                .filter((t) => applicableIds.has(t.id) && !haveIds.has(t.id))
                .map((t) => ({
                    launch_id: id,
                    criterion_id: t.id,
                    status: 'NOT_STARTED',
                    owner_email: resolveCriterionOwner(t.default_owner_email, data.owner_email),
                    due_date: runwayDueDate(data.target_launch_date, t, templates || [], data.tier),
                }));
            if (toAdd.length > 0) {
                await supabase.from('launch_criterion_status').insert(toAdd);
            }

            const toRemove = (tasks || [])
                .filter((t) => !applicableIds.has(t.criterion_id) && t.status === 'NOT_STARTED')
                .map((t) => t.id);
            if (toRemove.length > 0) {
                await supabase.from('launch_criterion_status').delete().in('id', toRemove);

            // Assets were never reconciled when tier changed: the checklist
            // reflowed and the asset list did not, so a launch retiered from T1 to
            // T2 kept assets its tier no longer calls for. Same add/remove shape
            // as the checklist above.
            const { data: assetTemplates } = await supabase
                .from('launch_asset_template')
                .select('id, label, tier_applicability, optional, default_owner_email, sort_order')
                .eq('is_active', true);

            const { data: existingAssets } = await supabase
                .from('launch_asset')
                .select('id, template_id, status')
                .eq('launch_id', id);

            if (assetTemplates && existingAssets) {
                const applicableAssetIds = new Set(
                    assetTemplates
                        .filter((t) => launchCriterionApplies(t.tier_applicability, data.tier))
                        .map((t) => t.id)
                );
                const heldAssetIds = new Set(
                    existingAssets.map((a) => a.template_id).filter(Boolean) as string[]
                );

                const assetsToAdd = assetTemplates
                    .filter((t) => applicableAssetIds.has(t.id) && !heldAssetIds.has(t.id))
                    .map((t) => ({
                        launch_id: id,
                        template_id: t.id,
                        label: t.label,
                        status: 'NOT_STARTED',
                        owner_email: resolveCriterionOwner(t.default_owner_email, data.owner_email ?? null),
                        optional: t.optional,
                        sort_order: t.sort_order,
                    }));
                if (assetsToAdd.length > 0) {
                    await supabase.from('launch_asset').insert(assetsToAdd);
                }

                // Only drop untouched templated rows. An ad-hoc asset (template_id
                // null) belongs to this launch alone and is never reflowed away,
                // and work already recorded is never silently discarded.
                const assetsToRemove = existingAssets
                    .filter(
                        (a) =>
                            a.template_id &&
                            !applicableAssetIds.has(a.template_id) &&
                            a.status === 'NOT_STARTED'
                    )
                    .map((a) => a.id);
                if (assetsToRemove.length > 0) {
                    await supabase.from('launch_asset').delete().in('id', assetsToRemove);
                }
            }
            }
        }

        // T-minus reflow: recompute due dates for tasks still sitting at their
        // derived value (or empty). Manually overridden dates are left alone.
        //
        // Both the launch date AND the tier can move a derived date now: lead
        // time scales with tier (T1 ~8wk vs T2 ~5wk for the same artifact), so a
        // T1 -> T2 retier compresses the whole workback even when GA is fixed.
        const dateMoved =
            'target_launch_date' in updates &&
            !!before &&
            data.target_launch_date !== before.target_launch_date;
        const tierMoved = 'tier' in updates && !!before && data.tier !== before.tier;

        if (before && data.target_launch_date && (dateMoved || tierMoved)) {
            // The whole template set is needed, not just each task's own criterion:
            // a due date is now derived from where the SUCCESSOR artifact starts,
            // so resolving one row means looking across the runway.
            const [{ data: tasks }, { data: allTemplates }] = await Promise.all([
                supabase
                    .from('launch_criterion_status')
                    .select(
                        'id, due_date, criterion:criterion(id, tier_applicability, default_due_offset_days, tier_offset_days, depends_on_criterion_id)'
                    )
                    .eq('launch_id', id),
                supabase
                    .from('criterion')
                    .select('id, tier_applicability, default_due_offset_days, tier_offset_days, depends_on_criterion_id')
                    .eq('context', 'launch')
                    .eq('is_active', true),
            ]);
            const templateSet = (allTemplates || []) as CriterionScheduleNode[];

            const groups = new Map<string, string[]>();
            for (const t of tasks || []) {
                const criterion = t.criterion as unknown as CriterionScheduleNode | null;
                if (!criterion) continue;
                const oldDerived = runwayDueDate(before.target_launch_date, criterion, templateSet, before.tier);
                if (t.due_date !== null && t.due_date !== oldDerived) continue;
                const newDerived = runwayDueDate(data.target_launch_date, criterion, templateSet, data.tier);
                if (!newDerived || newDerived === t.due_date) continue;
                const ids = groups.get(newDerived) || [];
                ids.push(t.id);
                groups.set(newDerived, ids);
            }
            for (const [due, ids] of groups) {
                await supabase
                    .from('launch_criterion_status')
                    .update({ due_date: due })
                    .in('id', ids);
            }
        }

        return NextResponse.json(withLaunchStatus(data));
    } catch (error: any) {
        console.error('Error in PATCH /api/launches/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function deleteHandler(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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

        const { error } = await supabase.from('launch').delete().eq('id', id);
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error in DELETE /api/launches/[id]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export const GET = withRateLimit(getHandler, RATE_LIMITS.default);
export const PATCH = withRateLimit(patchHandler, RATE_LIMITS.default);
export const DELETE = withRateLimit(deleteHandler, RATE_LIMITS.default);
