import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Let the database filter items using pod->PM mapping and indexes
    const { data, error } = await supabase.rpc('my_items_for_user', { p_email: user.email });

    if (error) throw error;

    // data already contains epic and criterion JSON fragments per row
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error fetching my items:', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}
