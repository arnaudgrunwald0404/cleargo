#!/usr/bin/env tsx
/**
 * Verify the Google setup end to end — through the SAME auth path the app uses.
 *
 * The earlier JS version hand-rolled a service-account JWT, which meant it kept
 * reporting failure after the app moved to OAuth. A checker that tests a
 * different code path than production is worse than no checker: it produces
 * confident false negatives.
 *
 * Usage: npx tsx scripts/verify-google-setup.ts
 */
import 'dotenv/config';

process.on('unhandledRejection', (reason) => {
    const m = reason instanceof Error ? reason.message : String(reason);
    if (m.includes('was called outside a request scope')) return;
    console.error('\nUnhandled rejection:', m);
    process.exit(1);
});

import { getGoogleAccessToken, hasServiceAccountCredentials } from '../src/lib/google/auth';
import { getConnection, isOAuthConfigured } from '../src/lib/google/oauth';
import { getFile } from '../src/lib/google/client';
import { ARTIFACT_REGISTRY, getTemplateId } from '../src/lib/artifacts/registry';
import { ARTIFACT_TYPES } from '../src/types/artifacts';

const ok = (m: string) => console.log(`  ✓ ${m}`);
const info = (m: string) => console.log(`    ${m}`);

let failures = 0;
function fail(message: string, hint?: string) {
    failures += 1;
    console.log(`  ✗ ${message}`);
    if (hint) info(hint);
}

/** Drive answers 404 for anything you cannot see, so say what that means. */
function accessHint(err: unknown, actingAs: string): string {
    const message = err instanceof Error ? err.message : String(err);
    return message.includes('404')
        ? `Drive returns 404 for files you cannot see — share it with ${actingAs}.`
        : message;
}

(async () => {
    console.log('\nGoogle setup check\n');

    // ── Which route is live ─────────────────────────────────────────────────
    console.log('Connection');
    const connection = await getConnection();
    let actingAs = 'the configured account';

    if (connection.refreshToken) {
        ok(`OAuth connected as ${connection.connectedEmail ?? 'unknown account'}`);
        actingAs = connection.connectedEmail ?? actingAs;
        if (connection.connectedBy) info(`authorised by ${connection.connectedBy}`);
        // The single most common cause of a connection that keeps dying.
        info('Consent screen must be Internal and published, or tokens expire every 7 days.');
    } else if (hasServiceAccountCredentials()) {
        ok('service account (no OAuth connection)');
        actingAs = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? actingAs;
    } else {
        fail(
            'Nothing is connected',
            isOAuthConfigured()
                ? 'Connect at Admin > Settings > Integrations > Google.'
                : 'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, then connect in Admin > Settings.'
        );
        console.log('\nStopping: nothing else can be checked.\n');
        process.exit(1);
    }

    let token: string;
    try {
        token = await getGoogleAccessToken();
        ok(`access token minted (${token.slice(0, 6)}…)`);
    } catch (err) {
        fail(`could not mint a token: ${err instanceof Error ? err.message : String(err)}`);
        console.log('\nStopping: nothing else can be checked without a token.\n');
        process.exit(1);
    }

    // ── Destination ─────────────────────────────────────────────────────────
    console.log('\nLaunch folder');
    const folderId = process.env.GOOGLE_LAUNCH_DRIVE_FOLDER_ID?.trim();
    if (!folderId) {
        fail('GOOGLE_LAUNCH_DRIVE_FOLDER_ID is not set', 'Per-launch folders are created inside it.');
    } else {
        try {
            const folder = await getFile(folderId);
            if (folder.mimeType !== 'application/vnd.google-apps.folder') {
                fail(`"${folder.name}" is not a folder (${folder.mimeType})`);
            } else {
                ok(`readable: ${folder.name}`);
            }
        } catch (err) {
            fail('folder not reachable', accessHint(err, actingAs));
        }
    }

    // ── Templates ───────────────────────────────────────────────────────────
    console.log('\nTemplates');
    for (const type of ARTIFACT_TYPES) {
        const def = ARTIFACT_REGISTRY[type];
        const id = getTemplateId(def);
        if (!id) {
            fail(`${def.label}: ${def.templateEnvVar} is not set`);
            continue;
        }
        try {
            const file = await getFile(id);
            if (file.mimeType !== 'application/vnd.google-apps.document') {
                fail(`${def.label}: not a Google Doc (${file.mimeType})`);
            } else {
                ok(`${def.label}: ${file.name}`);
            }
        } catch (err) {
            fail(`${def.label}`, accessHint(err, actingAs));
        }
    }

    console.log(
        failures === 0
            ? '\nAll checks passed. The doc factory can run.\n'
            : `\n${failures} check${failures === 1 ? '' : 's'} failed — see the hints above.\n`
    );
    process.exit(failures === 0 ? 0 : 1);
})().catch((err) => {
    console.error('\nUnexpected error:', err);
    process.exit(1);
});
