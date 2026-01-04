import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getEpics } from '@/lib/epics';
import EpicsClient from './EpicsClient';
import { PurpleLoader } from '@/components/PurpleLoader';

export const dynamic = 'force-dynamic';

export default async function EpicsTestPage() {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            console.error('EpicsTestPage - Auth error:', authError);
            if (authError.message.includes('fetch failed') || authError.message.includes('Failed to connect')) {
                console.error('EpicsTestPage - Supabase connection failed, redirecting to login');
                redirect('/login?error=connection');
            }
        }

        if (!user) {
            redirect('/');
        }

        const epics = await getEpics();

        return (
            <Suspense fallback={
                <div className="pt-24 p-8 flex items-center justify-center min-h-screen">
                    <PurpleLoader size="md" />
                </div>
            }>
                <EpicsClient initialEpics={epics || []} />
            </Suspense>
        );
    } catch (error: any) {
        console.error('EpicsTestPage - Unexpected error:', error);
        if (error.message?.includes('Missing Supabase') || error.message?.includes('NEXT_PUBLIC_SUPABASE')) {
            console.error('EpicsTestPage - Configuration error:', error.message);
            redirect('/login?error=config');
        }
        redirect('/login?error=unknown');
    }
}

