/**
 * Apply AI Recommendations API
 * POST - Apply specific recommendations to create metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  getEpicHeartConfig,
  applyRecommendations,
  updateEpicHeartConfigStatus,
} from '@/lib/heart/service';
import { getClient } from '@/lib/db';
import type { HeartAgentRecommendation } from '@/lib/heart/types';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: epicId } = await params;
    
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return forbid();
    }
    
    // Get config
    const config = await getEpicHeartConfig(epicId);
    if (!config) {
      return NextResponse.json(
        { error: 'HEART config not found for this epic. Create config first.' },
        { status: 404 }
      );
    }
    
    // Parse body - expects recommendations object
    const body = await req.json();
    const recommendations = body.recommendations as HeartAgentRecommendation;
    
    if (!recommendations) {
      return NextResponse.json(
        { error: 'Missing recommendations in request body' },
        { status: 400 }
      );
    }
    
    // Get epic name for metric naming
    const db = getClient();
    const { data: epic } = await db
      .from('epic')
      .select('name')
      .eq('id', epicId)
      .single();
    
    const epicName = epic?.name || 'Feature';
    
    // Apply recommendations
    const metrics = await applyRecommendations(config.id, recommendations, epicName);
    
    // Activate the config if it was in draft
    if (config.status === 'draft') {
      await updateEpicHeartConfigStatus(config.id, 'active', user.id);
    }
    
    return NextResponse.json({
      success: true,
      metrics,
      metricsCreated: metrics.length,
    });
  } catch (error) {
    console.error('Error applying recommendations:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
