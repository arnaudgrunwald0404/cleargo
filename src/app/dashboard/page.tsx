import { getEpics } from '@/lib/epics';
import EpicDashboard from '@/components/EpicDashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    // AUTH DISABLED: Skip auth check
    // const supabase = createClient();
    // const { data: { user } } = await supabase.auth.getUser();
    // if (!user) {
    //     redirect('/login');
    // }

    let epics = [];
    try {
        epics = await getEpics() || [];
    } catch (error) {
        console.error('Error fetching epics:', error);
        // Continue with empty array if there's an error
    }

    return (
        <div className="min-h-screen bg-gray-50 pt-24 pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <EpicDashboard initialEpics={epics || []} />
            </div>
        </div>
    );
}
