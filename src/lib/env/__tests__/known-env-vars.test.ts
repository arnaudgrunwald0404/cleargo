import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { KNOWN_ENV_VARS } from '@/lib/env/known-env-vars';

/**
 * Guards the registry against drift.
 *
 * KNOWN_ENV_VARS is only useful to the near-miss check if it is complete: a
 * variable the code reads but the registry omits gets reported as a typo of
 * something else, which is exactly the false positive that would train people
 * to ignore the warning.
 */

const ROOTS = ['src', 'netlify'];
const ENV_READ = /process\.env\.([A-Z][A-Z0-9_]+)/g;

/** Reached via process.env[def.templateEnvVar], so the regex above cannot see them. */
const DYNAMIC = /templateEnvVar: '([A-Z0-9_]+)'/g;

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walk(full, out);
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            out.push(full);
        }
    }
    return out;
}

function collectReadNames(): Set<string> {
    const repoRoot = path.resolve(__dirname, '../../../..');
    const names = new Set<string>();

    for (const root of ROOTS) {
        const dir = path.join(repoRoot, root);
        if (!fs.existsSync(dir)) continue;
        for (const file of walk(dir)) {
            const source = fs.readFileSync(file, 'utf8');
            for (const m of source.matchAll(ENV_READ)) names.add(m[1]);
            for (const m of source.matchAll(DYNAMIC)) names.add(m[1]);
        }
    }

    return names;
}

describe('KNOWN_ENV_VARS', () => {
    it('lists every variable the code reads', () => {
        const read = collectReadNames();
        const known = new Set(KNOWN_ENV_VARS);
        const missing = [...read].filter((name) => !known.has(name)).sort();

        expect(missing).toEqual([]);
    });

    it('has no duplicates', () => {
        expect(KNOWN_ENV_VARS.length).toBe(new Set(KNOWN_ENV_VARS).size);
    });

    it('found something, so the scan itself is not silently broken', () => {
        // A regex or path mistake would make the first test pass vacuously.
        const read = collectReadNames();
        expect(read.size).toBeGreaterThan(50);
        expect(read.has('CLAUDE_API_KEY')).toBe(true);
        expect(read.has('GOOGLE_TEMPLATE_MARKETING_BRIEF_ID')).toBe(true);
    });
});
