/**
 * HEART AI Recommendations API
 * POST - Get AI recommendations without applying them
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runHeartAgent } from '@/lib/heart/agent';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Run the AI agent
    const result = await runHeartAgent(epicId);
    
    if (!result.success) {
      return NextResponse.json(
        { 
          success: false,
          error: result.error,
          context: result.context,
        },
        { status: result.error?.includes('not connected') ? 400 : 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      recommendations: result.recommendations,
      context: {
        epic: result.context?.epic,
        pendoEventCount: result.context?.pendo.events.length || 0,
        pendoSegmentCount: result.context?.pendo.segments.length || 0,
      },
      modelVersion: result.modelVersion,
    });
  } catch (error) {
    console.error('Error getting AI recommendations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
