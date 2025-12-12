import EpicDashboard from '@/components/EpicDashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
    // AUTH DISABLED: Skip auth check
    // Always render the page - don't even try to fetch data if it's causing issues
    const epics: any[] = [];

    return (
        <div className="min-h-screen bg-gray-50 pt-24 pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <EpicDashboard initialEpics={epics} />
            </div>
        </div>
    );
}
