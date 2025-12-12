import { getEpics } from '@/lib/epics';
import EpicDashboard from '@/components/EpicDashboard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    // AUTH DISABLED: Skip auth check
    // Always render the page, even if data fetch fails
    let epics: any[] = [];
    
    try {
        // Filter to show epics launching in the next 90 days
        epics = await getEpics(90) || [];
    } catch (error: any) {
        // Silently fail - page will render with empty list
        console.warn('Dashboard: Failed to load epics, continuing with empty list');
    }

    return (
        <div className="min-h-screen bg-gray-50 pt-24 pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <EpicDashboard initialEpics={epics} />
            </div>
        </div>
    );
}
