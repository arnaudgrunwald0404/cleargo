import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Guards against reading a React event inside a functional state updater.
 *
 * WHY: `setX((prev) => ({ ...prev, k: e.currentTarget.value }))` looks correct
 * and typechecks, but React invokes the updater during the RENDER phase --
 * after the event handler has returned and `currentTarget` has been reset to
 * null. The field throws `Cannot read properties of null (reading 'value')` the
 * first time someone types in it, and nothing catches it before a user does.
 *
 * It bit twice in this repo: the launch artifacts source-notes field, and the
 * GTM module field in PlanVsActualTable. Capture the value in a `const` first,
 * then use that in the updater.
 *
 * The scan is a heuristic on source text, so it is deliberately narrow: it only
 * fires when an event property is read inside a setter's arrow body with no
 * intervening `const`, which is exactly the broken shape.
 */

const COMPONENT_ROOTS = ['components', 'app'];

/** `setFoo((prev) => ...` — the start of a functional state update. */
const FUNCTIONAL_UPDATER = /set[A-Z]\w*\(\s*\(\s*\w+\s*\)\s*=>/g;

/** Event fields that are only valid synchronously. */
const LAZY_EVENT_READ = /\be\.(currentTarget|target|nativeEvent)\b/;

function sourceFiles(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
            sourceFiles(full, out);
        } else if (entry.name.endsWith('.tsx')) {
            out.push(full);
        }
    }
    return out;
}

/**
 * The updater's body, by brace/paren balance from the arrow. Returns null when
 * the region cannot be determined, so an unparseable file is skipped rather
 * than reported.
 */
function updaterBody(source: string, arrowEnd: number): string | null {
    let depth = 0;
    for (let i = arrowEnd; i < source.length && i < arrowEnd + 2000; i += 1) {
        const ch = source[i];
        if (ch === '(' || ch === '{' || ch === '[') depth += 1;
        else if (ch === ')' || ch === '}' || ch === ']') {
            depth -= 1;
            if (depth <= 0) return source.slice(arrowEnd, i);
        }
    }
    return null;
}

function findLazyEventReads(source: string): string[] {
    const offenders: string[] = [];

    for (const match of source.matchAll(FUNCTIONAL_UPDATER)) {
        const body = updaterBody(source, match.index! + match[0].length);
        if (body === null) continue;

        // A `const` inside the updater means the value was almost certainly
        // captured properly; this is what keeps the check quiet on correct code.
        if (/\bconst\b/.test(body)) continue;

        if (LAZY_EVENT_READ.test(body)) {
            const line = source.slice(0, match.index!).split('\n').length;
            offenders.push(`line ${line}: ${match[0].trim()} ... ${body.trim().slice(0, 60)}`);
        }
    }

    return offenders;
}

describe('no React event reads inside functional state updaters', () => {
    it('finds none in components or app', () => {
        const srcRoot = path.resolve(__dirname, '../..');
        const problems: string[] = [];

        for (const root of COMPONENT_ROOTS) {
            for (const file of sourceFiles(path.join(srcRoot, root))) {
                const source = fs.readFileSync(file, 'utf8');
                for (const offender of findLazyEventReads(source)) {
                    problems.push(`${path.relative(srcRoot, file)} ${offender}`);
                }
            }
        }

        expect(problems).toEqual([]);
    });

    it('detects the broken shape, so the scan is not vacuous', () => {
        const broken = `
            onChange={(e) =>
                setNotes((prev) => ({ ...prev, k: e.currentTarget.value }))
            }
        `;
        expect(findLazyEventReads(broken)).toHaveLength(1);
    });

    it('accepts the corrected shape', () => {
        const fixed = `
            onChange={(e) => {
                const value = e.currentTarget.value;
                setNotes((prev) => ({ ...prev, k: value }));
            }}
        `;
        expect(findLazyEventReads(fixed)).toEqual([]);
    });

    it('does not flag an updater that never touches an event', () => {
        const fine = `setOpen((prev) => !prev); setRows((prev) => [...prev, row]);`;
        expect(findLazyEventReads(fine)).toEqual([]);
    });
});
