/**
 * Drive and Docs REST calls.
 *
 * Raw fetch against the REST APIs, matching how every other external client in
 * this repo works, wrapped in the exponential backoff CLAUDE.md claims all of
 * them have (the deleted Calendar integration did not, in fact, have any).
 */
import { getGoogleAccessToken } from './auth';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DOCS_API = 'https://docs.googleapis.com/v1';

const MAX_RETRIES = 3;

/** Retry on transport errors, rate limits, and Google's transient 5xx. */
function isRetryableStatus(status: number): boolean {
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Single request helper. Re-mints the token on each attempt via
 * getGoogleAccessToken(), which is cached — so a retry after a 401 that was
 * caused by expiry picks up a fresh token for free.
 */
async function googleFetch(
    url: string,
    init: RequestInit & { body?: string } = {}
): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            // 1s, 2s, 4s — capped, matching SlackClient.postMessage's shape.
            await sleep(Math.min(1000 * 2 ** (attempt - 1), 10_000));
        }

        try {
            const token = await getGoogleAccessToken();
            const res = await fetch(url, {
                ...init,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    ...(init.headers || {}),
                },
            });

            if (res.ok) {
                // Some Drive endpoints (delete) return an empty body.
                const text = await res.text();
                return text ? JSON.parse(text) : {};
            }

            const detail = await res.text().catch(() => '');
            const message = `Google API ${res.status} for ${url}: ${detail.slice(0, 300)}`;

            if (!isRetryableStatus(res.status)) {
                throw new Error(message);
            }
            lastError = new Error(message);
        } catch (err) {
            // A thrown non-retryable error must not be swallowed by the loop.
            if (err instanceof Error && err.message.startsWith('Google API ') && !/(429|5\d\d)/.test(err.message)) {
                throw err;
            }
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError ?? new Error(`Google API request failed: ${url}`);
}

// ── Drive ───────────────────────────────────────────────────────────────────

export interface DriveFile {
    id: string;
    name: string;
    mimeType?: string;
    webViewLink?: string;
    parents?: string[];
}

/**
 * Every Drive call sets supportsAllDrives — without it, files on a shared drive
 * are invisible and copies silently land in My Drive instead.
 */
const SHARED_DRIVE_PARAMS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

export async function createFolder(name: string, parentId: string): Promise<DriveFile> {
    return (await googleFetch(
        `${DRIVE_API}/files?${SHARED_DRIVE_PARAMS}&fields=id,name,webViewLink,parents`,
        {
            method: 'POST',
            body: JSON.stringify({
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId],
            }),
        }
    )) as DriveFile;
}

/** Copy a template Doc into a folder under a new name. */
export async function copyFile(
    fileId: string,
    name: string,
    parentId: string
): Promise<DriveFile> {
    return (await googleFetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}/copy?${SHARED_DRIVE_PARAMS}&fields=id,name,webViewLink,parents`,
        { method: 'POST', body: JSON.stringify({ name, parents: [parentId] }) }
    )) as DriveFile;
}

export async function getFile(fileId: string): Promise<DriveFile> {
    return (await googleFetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${SHARED_DRIVE_PARAMS}&fields=id,name,mimeType,webViewLink,parents`
    )) as DriveFile;
}

/** List a folder's immediate children. Used to make doc creation idempotent. */
export async function listFolderChildren(folderId: string): Promise<DriveFile[]> {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const data = (await googleFetch(
        `${DRIVE_API}/files?q=${q}&${SHARED_DRIVE_PARAMS}&fields=files(id,name,mimeType,webViewLink)`
    )) as { files?: DriveFile[] };
    return data.files ?? [];
}

/**
 * Grant a person access to a file. Launch artifacts are created by the bot
 * identity, so the owner would otherwise be unable to open their own document.
 */
export async function shareFile(
    fileId: string,
    email: string,
    role: 'writer' | 'commenter' | 'reader' = 'writer'
): Promise<void> {
    await googleFetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?${SHARED_DRIVE_PARAMS}&sendNotificationEmail=false`,
        {
            method: 'POST',
            body: JSON.stringify({ type: 'user', role, emailAddress: email }),
        }
    );
}

// ── Docs ────────────────────────────────────────────────────────────────────

export interface DocsDocument {
    documentId: string;
    title?: string;
    body?: { content?: unknown[] };
}

export async function getDocument(documentId: string): Promise<DocsDocument> {
    return (await googleFetch(
        `${DOCS_API}/documents/${encodeURIComponent(documentId)}`
    )) as DocsDocument;
}

/**
 * Replace `{{token}}` placeholders throughout a document.
 *
 * One batchUpdate carries every replacement so the whole fill is atomic — a
 * partial fill would leave a document that looks finished but is not.
 *
 * Empty values are still replaced (with a visible marker rather than nothing):
 * a leftover `{{token}}` in a document a PMM is about to circulate is worse
 * than an explicit blank.
 */
export async function replaceTokens(
    documentId: string,
    tokens: Record<string, string>
): Promise<void> {
    await replaceAllText(
        documentId,
        Object.entries(tokens).map(([token, value]) => ({
            find: `{{${token}}}`,
            replace: value.trim() || '[to be completed]',
        }))
    );
}

/**
 * Raw find-and-replace across a document.
 *
 * Replacements are applied in the order given, in ONE batchUpdate, which
 * matters when one search string is a substring of another — put the longer,
 * more specific string first.
 *
 * Replacement text inherits the formatting of the text it replaces, which is
 * what makes tokenising a template non-destructive: an amber-highlighted
 * placeholder becomes an amber-highlighted token.
 */
export async function replaceAllText(
    documentId: string,
    replacements: Array<{ find: string; replace: string; matchCase?: boolean }>
): Promise<void> {
    const requests = replacements
        .filter((r) => r.find)
        .map((r) => ({
            replaceAllText: {
                containsText: { text: r.find, matchCase: r.matchCase ?? true },
                replaceText: r.replace,
            },
        }));

    if (requests.length === 0) return;

    await googleFetch(
        `${DOCS_API}/documents/${encodeURIComponent(documentId)}:batchUpdate`,
        { method: 'POST', body: JSON.stringify({ requests }) }
    );
}

/**
 * Flatten a Docs document to plain text.
 *
 * Needed because the Doc is the system of record: drafting the Messaging Brief
 * means reading back the APPROVED Story Brief, and trusting ClearGO's snapshot
 * instead would reintroduce exactly the drift this architecture avoids.
 */
export function extractDocumentText(doc: DocsDocument): string {
    const out: string[] = [];

    const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const rec = node as Record<string, unknown>;

        if (typeof rec.content === 'string') {
            out.push(rec.content);
        }
        for (const value of Object.values(rec)) {
            if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') walk(value);
        }
    };

    walk(doc.body ?? {});
    return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
