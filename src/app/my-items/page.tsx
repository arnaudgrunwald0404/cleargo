import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { MyTasks } from '@/components/MyTasks';
import { PurpleLoader } from '@/components/PurpleLoader';

export const dynamic = 'force-dynamic';

export default async function MyItemsPage() {
    try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
            console.error('MyItemsPage - Auth error:', authError);
            if (authError.message.includes('fetch failed') || authError.message.includes('Failed to connect')) {
                console.error('MyItemsPage - Supabase connection failed, redirecting to login');
                redirect('/login?error=connection');
            } else {
                redirect('/login?error=auth');
            }
        }

        if (!user) {
            redirect('/');
        }

        return (
            <Suspense fallback={
                <div className="pt-24 p-8 flex items-center justify-center min-h-screen">
                    <PurpleLoader size="md" />
                </div>
            }>
                <div className="pt-24 p-8">
                    <MyTasks />
                </div>
            </Suspense>
        );
    } catch (error: any) {
        if (error.digest?.startsWith('NEXT_REDIRECT')) {
            throw error;
        }
        console.error('MyItemsPage - Unexpected error:', error);
        if (error.message?.includes('Missing Supabase') || error.message?.includes('NEXT_PUBLIC_SUPABASE')) {
            console.error('MyItemsPage - Configuration error:', error.message);
            redirect('/login?error=config');
        }
        redirect('/login?error=unknown');
    }
}
