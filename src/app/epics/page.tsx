import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getEpics } from '@/lib/epics';
import EpicsClient from './EpicsClient';
import { PurpleLoader } from '@/components/PurpleLoader';

export const dynamic = 'force-dynamic';

export default async function EpicsPage() {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            console.error('EpicsPage - Auth error:', authError);
            // If it's a network/connection error, redirect to login
            if (authError.message.includes('fetch failed') || authError.message.includes('Failed to connect')) {
                console.error('EpicsPage - Supabase connection failed, redirecting to login');
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
        console.error('EpicsPage - Unexpected error:', error);
        // If it's a configuration error, redirect to login with error message
        if (error.message?.includes('Missing Supabase') || error.message?.includes('NEXT_PUBLIC_SUPABASE')) {
            console.error('EpicsPage - Configuration error:', error.message);
            redirect('/login?error=config');
        }
        // For other errors, redirect to login
        redirect('/login?error=unknown');
    }
}
