/**
 * Where authorization failures land when redirecting back to the client would be
 * unsafe.
 *
 * A bad client_id or an unregistered redirect_uri cannot be reported to the
 * client, because doing so means redirecting to a URI nobody has validated —
 * that is an open redirector. Those failures are shown to the person instead.
 */
export const dynamic = 'force-dynamic';

export default async function OAuthErrorPage({
    searchParams,
}: {
    searchParams: Promise<{ message?: string }>;
}) {
    const params = await searchParams;
    const message = params.message || 'The authorization request could not be completed.';

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
                <h1 style={{ fontSize: 20, margin: '0 0 .75rem', color: '#c92a2a' }}>
                    Could not connect
                </h1>
                <p style={{ color: '#333', margin: '0 0 1.5rem', lineHeight: 1.5 }}>{message}</p>
                <p style={{ color: '#777', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                    You can close this window. If this keeps happening, remove the connector in
                    Claude Desktop and add it again.
                </p>
            </div>
        </main>
    );
}
