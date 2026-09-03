/**
 * No two migrations may share a version.
 *
 * `supabase_migrations.schema_migrations` has `version` as its PRIMARY KEY, not
 * (version, name). So when two files share one, the first to apply claims it and
 * the second fails with
 *
 *   duplicate key value violates unique constraint "schema_migrations_pkey"
 *
 * AFTER its SQL body has already run -- the failure is on the bookkeeping
 * INSERT, so the push aborts mid-way with the remote in a state the history
 * table does not describe.
 *
 * That happened: 20260902000000 was used by both
 * _add_forecast_engine_tables and _restore_my_items_criterion_fields, on two
 * branches that each hand-picked the same round number. `supabase migration new`
 * stamps YYYYMMDDHHMMSS from the clock and would not have collided.
 *
 * Pure filename check, no database.
 */
import { readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function migrationFiles(): string[] {
    return readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
}

describe('migration versions', () => {
    it('are unique', () => {
        const byVersion = new Map<string, string[]>();

        for (const file of migrationFiles()) {
            const version = file.split('_')[0];
            byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
        }

        const collisions = [...byVersion.entries()].filter(([, files]) => files.length > 1);

        if (collisions.length > 0) {
            throw new Error(
                'Two or more migrations share a version. schema_migrations.version is a ' +
                    'PRIMARY KEY, so the second to apply fails on its bookkeeping INSERT ' +
                    'after its SQL has already run.\n\n' +
                    collisions
                        .map(([version, files]) => `  ${version}\n${files.map((f) => `    ${f}`).join('\n')}`)
                        .join('\n\n') +
                    '\n\nRename the newer one. Use `supabase migration new <name>` so the ' +
                    'version comes from the clock rather than being hand-picked.'
            );
        }
    });

    it('are unique among the timestamped ones too, independent of the legacy prefix', () => {
        // The repo predates the timestamp convention: 0001_initial.sql through
        // 00NN_ are legacy sequence numbers and are fine, because they are still
        // unique versions. Asserting a 14-digit format would only flag history
        // nobody should rename. So this narrows to the timestamped era, where
        // new files land and where a hand-picked round number can collide.
        const timestamped = migrationFiles().filter((f) => /^\d{14}_/.test(f));
        const versions = timestamped.map((f) => f.split('_')[0]);
        expect(versions.length).toBe(new Set(versions).size);
    });
});
