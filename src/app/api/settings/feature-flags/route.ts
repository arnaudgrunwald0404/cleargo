import { NextResponse } from 'next/server';
import { getFeatureFlags } from '@/lib/settings-db';
import { getAuthenticatedUserEmail } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const userEmail = await getAuthenticatedUserEmail();
    if (!userEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient();
    const { error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', userEmail)
      .single();

    if (userError) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const flags = await getFeatureFlags();
    return NextResponse.json({ flags });
  } catch (error: unknown) {
    console.error('Error fetching feature flags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feature flags', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
