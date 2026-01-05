import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveProductManagerUserId } from '@/lib/services/successMeasurementService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = await resolveProductManagerUserId(epicId);
    if (!userId) {
      return NextResponse.json({ error: 'Product manager not found for this epic' }, { status: 404 });
    }

    return NextResponse.json({ userId });
  } catch (error: any) {
    console.error('Error fetching product manager:', error);
    return NextResponse.json(
      { error: 'Failed to fetch product manager', details: error.message },
      { status: 500 }
    );
  }
}

