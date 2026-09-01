/**
 * Guards against a SQL function being rewritten from a stale copy.
 *
 * This has happened twice. 20260630000000 replaced my_items_for_user with a
 * body predating two earlier migrations, silently dropping `rating_timing` and
 * `data_sources` and collapsing every derived due date on My Items to the
 * default stage. 20260717000001 exists because launch_criterion_status was
 * created from an earlier draft of its own migration.
 *
 * Nothing catches this: `CREATE OR REPLACE` is valid SQL, the migration
 * applies cleanly, and the loss only shows up as subtly wrong dates in the UI.
 *
 * So: for each function, find the newest migration that defines it and assert
 * the fields callers depend on are still in it. Pure string matching, no
 * database. Adding a field to a contract is one line here.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * Tokens each function's newest definition must still contain, with the caller
 * that breaks without them.
 */
const CONTRACTS: Record<string, { token: string; neededBy: string }[]> = {
    my_items_for_user: [
        { token: "'rating_timing'", neededBy: 'api/my-items + HomeDashboard derived due dates' },
        { token: "'data_sources'", neededBy: 'HomeDashboard Docs column' },
        { token: "'status_definition_go'", neededBy: 'criterion scoring hints' },
        { token: "'status_definition_conditional'", neededBy: 'criterion scoring hints' },
        { token: "'status_definition_no_go'", neededBy: 'criterion scoring hints' },
        { token: "'sort_order'", neededBy: 'criterion ordering' },
        { token: "'gate'", neededBy: 'gate badge + CONDITIONAL visibility rule' },
        { token: 'pod_product_manager_mapping', neededBy: 'pod-mapped ownership fallback' },
        { token: 'archived = false', neededBy: 'excluding archived epics' },
    ],
};

/** The migration that actually defines the function at HEAD. */
function newestDefinitionOf(fn: string): { file: string; sql: string } {
    // Plain string search on whitespace-collapsed SQL rather than a regex:
    // the needle contains no metacharacters and this is far easier to read.
    const needle = `CREATE OR REPLACE FUNCTION ${fn}`;
    const needleQualified = `CREATE OR REPLACE FUNCTION public.${fn}`;

    const defines = (sql: string) => {
        const flat = sql.replace(/\s+/g, ' ').toUpperCase();
        return flat.includes(needle.toUpperCase()) || flat.includes(needleQualified.toUpperCase());
    };

    const matches = readdirSync(MIGRATIONS)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .filter((f) => defines(readFileSync(join(MIGRATIONS, f), 'utf8')));

    if (matches.length === 0) throw new Error(`No migration defines ${fn}`);
    const file = matches[matches.length - 1];
    return { file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') };
}

describe('SQL function contracts', () => {
    for (const [fn, tokens] of Object.entries(CONTRACTS)) {
        describe(fn, () => {
            const { file, sql } = newestDefinitionOf(fn);

            it.each(tokens.map((t) => [t.token, t.neededBy]))(
                'newest definition still has %s (%s)',
                (token, neededBy) => {
                    if (!sql.includes(String(token))) {
                        throw new Error(
                            `${file} defines ${fn} without ${token}.\n` +
                                `Needed by: ${neededBy}.\n` +
                                `This usually means the function was rewritten from an older ` +
                                `migration. Start from the newest definition instead:\n` +
                                `  grep -l 'FUNCTION ${fn}' supabase/migrations/*.sql | sort | tail -1`
                        );
                    }
                }
            );
        });
    }
});
