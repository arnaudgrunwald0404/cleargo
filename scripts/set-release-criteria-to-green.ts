#!/usr/bin/env tsx
/**
 * One-off: set all not-yet-set criteria of all epics in a release to Green (GO).
 * Already-set criteria (GO, CONDITIONAL_GO, NO_GO, NOT_APPLICABLE) are left unchanged.
 * Updates every criterion in the release, regardless of decision owner.
 *
 * Usage: npx tsx scripts/set-release-criteria-to-green.ts [releaseName]
 * Default release: 2026.1
 */
import * as dotenv from 'dotenv';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { getEpicsForRelease } from '../src/lib/services/releaseAnalyticsService';

dotenv.config({ path: join(process.cwd(), '.env.local') });

const RELEASE_NAME = process.argv[2] ?? '2026.1';

async function main() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
        process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Missing Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const epics = await getEpicsForRelease(RELEASE_NAME, supabase);
    if (epics.length === 0) {
        console.log(`No (non-archived) epics found for release "${RELEASE_NAME}".`);
        process.exit(0);
    }

    const epicIds = epics.map((e) => e.id);
    console.log(`Release "${RELEASE_NAME}": ${epics.length} epic(s). Setting all NOT_SET criteria to GO...`);

    const { data: updated, error } = await supabase
        .from('epic_criterion_status')
        .update({
            status: 'GO',
            last_updated_at: new Date().toISOString(),
        })
        .in('epic_id', epicIds)
        .or('status.is.null,status.eq.NOT_SET')
        .select('id, epic_id, status');

    if (error) {
        console.error('Update failed:', error);
        process.exit(1);
    }

    const count = updated?.length ?? 0;
    console.log(`Updated ${count} criterion row(s) to GO.`);
    if (count > 0) {
        console.log('Readiness scores will refresh when epics are opened or when Admin recalculates readiness.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
