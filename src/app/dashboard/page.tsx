import { getLaunches } from '@/lib/launches';
import LaunchDashboard from '@/components/LaunchDashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const launches = await getLaunches();

    return (
        <div className="min-h-screen bg-gray-50 pt-24 pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <LaunchDashboard initialLaunches={launches || []} />
            </div>
        </div>
    );
}
