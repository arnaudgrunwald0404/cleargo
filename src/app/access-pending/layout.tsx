import { requirePageAuth } from '@/lib/auth/requirePageAuth';

// Reachable only once signed in; role-based gating happens on the page itself.
export const dynamic = 'force-dynamic';

export default async function AccessPendingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageAuth('/access-pending');
    return <>{children}</>;
}
