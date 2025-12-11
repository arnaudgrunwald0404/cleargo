import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getEpics } from '@/lib/epics';
import EpicsClient from './EpicsClient';

export const dynamic = 'force-dynamic';

export default async function EpicsPage() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/');
    }

    const epics = await getEpics();

    return <EpicsClient initialEpics={epics || []} />;
}
