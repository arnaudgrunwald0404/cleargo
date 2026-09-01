/**
 * Consent screen for the MCP connector.
 *
 * Deliberately a server component with a plain HTML form. Client registration is
 * open, so this page is the one place a human confirms that the application
 * asking for access is the one they just set up — and a form that submits without
 * JavaScript cannot be defeated by a script failing to load.
 *
 * The `request` field is a signed token minted by /api/oauth/authorize holding
 * the already-validated parameters. Nothing on this page can change what is being
 * approved; it only carries the decision back.
 */
import { redirect } from 'next/navigation';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { verifyAuthorizationRequest } from '@/lib/oauth/tokens';
import { SCOPES } from '@/lib/oauth/config';

export const dynamic = 'force-dynamic';

const SCOPE_DESCRIPTIONS: Record<string, string> = {
    [SCOPES.read]: 'Read your launches, artifacts, criteria, and readiness data',
    [SCOPES.write]: 'Draft and edit artifact content, and record review decisions',
};

export default async function ConsentPage({
    searchParams,
}: {
    searchParams: Promise<{ request?: string; client_name?: string }>;
}) {
    const params = await searchParams;
    const requestToken = params.request ?? '';
    const clientName = params.client_name || 'An application';

    const authzRequest = await verifyAuthorizationRequest(requestToken);
    if (!authzRequest) {
        redirect('/oauth/error?message=' + encodeURIComponent('This request expired. Start the connection again.'));
    }

    const email = await getAuthenticatedUserEmail();
    if (!email) {
        // Back to this screen, not the dashboard: the signed request is still
        // good for the rest of its two minutes, so signing in resumes the flow
        // instead of silently abandoning it.
        const returnTo = `/oauth/consent?request=${encodeURIComponent(requestToken)}&client_name=${encodeURIComponent(clientName)}`;
        redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
    }

    const scopes = authzRequest.scope.split(/\s+/).filter(Boolean);

    return (
        <main
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                background: '#f8f9fa',
            }}
        >
            <div
                style={{
                    maxWidth: 460,
                    width: '100%',
                    background: '#fff',
                    borderRadius: 12,
                    padding: '2rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,.12)',
                }}
            >
                <h1 style={{ fontSize: 20, margin: '0 0 .5rem' }}>Connect to ClearGO</h1>

                <p style={{ color: '#555', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
                    <strong>{clientName}</strong> is asking to access ClearGO as{' '}
                    <strong>{email}</strong>.
                </p>

                <ul style={{ margin: '0 0 1.5rem', paddingLeft: '1.1rem', lineHeight: 1.7 }}>
                    {scopes.map((scope) => (
                        <li key={scope} style={{ color: '#333' }}>
                            {SCOPE_DESCRIPTIONS[scope] ?? scope}
                        </li>
                    ))}
                </ul>

                <p style={{ color: '#777', fontSize: 13, margin: '0 0 1.5rem', lineHeight: 1.5 }}>
                    It will act with your own permissions — it cannot do anything in ClearGO that
                    you cannot do yourself.
                </p>

                <form method="POST" action="/api/oauth/authorize" style={{ display: 'flex', gap: '.75rem' }}>
                    <input type="hidden" name="request" value={requestToken} />
                    <button
                        type="submit"
                        name="decision"
                        value="deny"
                        style={{
                            flex: 1,
                            padding: '.65rem 1rem',
                            borderRadius: 8,
                            border: '1px solid #ced4da',
                            background: '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        name="decision"
                        value="allow"
                        style={{
                            flex: 1,
                            padding: '.65rem 1rem',
                            borderRadius: 8,
                            border: 'none',
                            background: '#228be6',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: 14,
                            fontWeight: 600,
                        }}
                    >
                        Allow
                    </button>
                </form>
            </div>
        </main>
    );
}
