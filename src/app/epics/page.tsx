import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getEpics } from '@/lib/epics';
import { getActiveReleaseScheduleRows } from '@/lib/release-schedule';
import { getReleaseStagesForTimeline } from '@/lib/release-stages-server';
import EpicsClient from './EpicsClient';
export const dynamic = 'force-dynamic';

export default async function EpicsPage() {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            console.error('EpicsPage - Auth error:', authError);
            if (authError.message.includes('fetch failed') || authError.message.includes('Failed to connect')) {
                console.error('EpicsPage - Supabase connection failed, redirecting to login');
                redirect('/login?error=connection');
            } else {
                redirect('/login?error=auth');
            }
        }

        if (!user) {
            redirect('/');
        }

        const [epics, initialReleaseSchedule, initialReleaseStages] = await Promise.all([
            getEpics(),
            getActiveReleaseScheduleRows(),
            getReleaseStagesForTimeline(),
        ]);

        return (
            <Suspense fallback={
                <div style={{ minHeight: "100vh", background: "var(--color-platinum)", fontFamily: "var(--font-body)" }}>
                    <div style={{ maxWidth: "var(--page-container-max-width)", margin: "0 auto", paddingLeft: "var(--page-container-padding-x)", paddingRight: "var(--page-container-padding-x)", paddingTop: "var(--page-container-padding-top)", paddingBottom: "var(--spacing-8)" }} className="sm:px-6 lg:px-8">
                        <div className="h-9 bg-gray-200 rounded w-32 mb-2 animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded w-full max-w-xl mb-6 animate-pulse" style={{ maxWidth: "36rem" }} />
                        <div className="flex gap-4 overflow-x-auto pb-4 mb-6">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex-shrink-0 w-64 p-4 rounded-lg border-2 border-gray-200 bg-white animate-pulse">
                                    <div className="h-6 bg-gray-300 rounded w-3/4 mb-2" />
                                    <div className="h-4 bg-gray-300 rounded w-1/2 mb-3" />
                                    <div className="pt-2 border-t border-gray-200 space-y-2">
                                        <div className="flex justify-between"><div className="h-4 bg-gray-300 rounded w-24" /><div className="h-4 bg-gray-300 rounded w-12" /></div>
                                        <div className="flex justify-between"><div className="h-4 bg-gray-300 rounded w-20" /><div className="h-4 bg-gray-300 rounded w-8" /></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm">
                            <table className="min-w-full" style={{ borderCollapse: "collapse", minWidth: "800px" }}>
                                <thead style={{ backgroundColor: "#F9FAFB", borderBottom: "2px solid #E5E7EB" }}>
                                    <tr>
                                        {["Name", "Tier", "Module", "PM", "Date", "Status"].map((col) => (
                                            <th key={col} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[1, 2, 3, 4, 5].map((i) => (
                                        <tr key={i} className="border-b border-gray-200">
                                            <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: '80%' }} /></td>
                                            <td className="px-4 py-3 w-24"><div className="h-6 bg-gray-200 rounded animate-pulse w-14" /></td>
                                            <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-gray-200 rounded animate-pulse w-20" /></td>
                                            <td className="px-4 py-3 hidden md:table-cell w-28"><div className="h-4 bg-gray-200 rounded animate-pulse w-20" /></td>
                                            <td className="px-4 py-3 hidden md:table-cell w-32"><div className="h-4 bg-gray-200 rounded animate-pulse w-16" /></td>
                                            <td className="px-4 py-3 hidden md:table-cell w-24"><div className="h-6 bg-gray-200 rounded animate-pulse w-14" /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            }>
                <EpicsClient
                    initialEpics={epics || []}
                    initialReleaseSchedule={initialReleaseSchedule}
                    initialReleaseScheduleStages={initialReleaseStages.releaseSchedule}
                    initialUiRolloutStages={initialReleaseStages.uiRollout}
                />
            </Suspense>
        );
    } catch (error: any) {
        if (error.digest?.startsWith('NEXT_REDIRECT')) {
            throw error;
        }
        console.error('EpicsPage - Unexpected error:', error);
        if (error.message?.includes('Missing Supabase') || error.message?.includes('NEXT_PUBLIC_SUPABASE')) {
            console.error('EpicsPage - Configuration error:', error.message);
            redirect('/login?error=config');
        }
        redirect('/login?error=unknown');
    }
}

