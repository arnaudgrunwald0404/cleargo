import { requirePageAuth } from '@/lib/auth/requirePageAuth';

// Auth gate for every route under this segment (client pages included).
// Runs server-side; see requirePageAuth for why this is not in proxy.ts.
export const dynamic = 'force-dynamic';

export default async function EpicsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageAuth('/epics');
    return <>{children}</>;
}
