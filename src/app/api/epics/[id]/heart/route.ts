/**
 * Epic HEART Metrics API
 * GET - Get HEART dashboard for an epic
 * POST - Setup HEART metrics (auto, ai_assisted, or manual)
 * DELETE - Reset/delete HEART config for an epic
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import {
  getEpicHeartDashboard,
  getEpicHeartConfig,
  setupHeartMetricsWithAI,
  createEpicHeartConfig,
  deleteEpicHeartConfig,
  createInitialSnapshots,
} from '@/lib/heart/service';
import type { HeartSetupMethod } from '@/lib/heart/types';

/**
 * Get app_user.id from email
 */
async function getAppUserId(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('app_user')
    .select('id')
    .eq('email', email)
    .single();
  
  if (error || !data) {
    console.error('Error fetching app_user by email:', error);
    return null;
  }
  
  return data.id;
}

export async function GET(
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
    
    // Get dashboard data
    const dashboard = await getEpicHeartDashboard(epicId);
    
    if (!dashboard) {
      return NextResponse.json({ 
        configured: false,
        message: 'HEART metrics not configured for this epic'
      });
    }
    
    return NextResponse.json({
      configured: true,
      ...dashboard
    });
  } catch (error) {
    console.error('Error fetching HEART dashboard:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
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
    if (authError || !user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get app_user.id from email (not auth user id)
    const appUserId = await getAppUserId(user.email);
    if (!appUserId) {
      return NextResponse.json(
        { error: 'User not found in app_user table' },
        { status: 403 }
      );
    }
    
    // Parse body
    const body = await req.json();
    const setupMethod = body.setup_method as HeartSetupMethod;
    const userContext = typeof body.user_context === 'string' ? body.user_context.trim() || undefined : undefined;

    if (!['auto', 'ai_assisted', 'manual'].includes(setupMethod)) {
      return NextResponse.json(
        { error: 'Invalid setup_method. Must be: auto, ai_assisted, or manual' },
        { status: 400 }
      );
    }
    
    // Check if config already exists
    const existingConfig = await getEpicHeartConfig(epicId);
    if (existingConfig) {
      return NextResponse.json(
        { error: 'HEART metrics already configured for this epic' },
        { status: 409 }
      );
    }
    
    // Setup based on method
    if (setupMethod === 'manual') {
      // Manual setup - just create empty config
      const config = await createEpicHeartConfig({
        epic_id: epicId,
        setup_method: 'manual',
      }, appUserId);
      
      return NextResponse.json({
        success: true,
        config,
        metrics: [],
        recommendations: null,
      });
    }
    
    // AI-powered setup (auto or ai_assisted)
    const result = await setupHeartMetricsWithAI(epicId, appUserId, setupMethod, { userContext });
    
    // If AI couldn't find metrics, return error (config was not created)
    if (result.error && !result.config) {
      return NextResponse.json({
        success: false,
        error: result.error,
        recommendations: result.recommendations,
        availableEventNames: result.availableEventNames,
      }, { status: 422 }); // Unprocessable - AI couldn't find data
    }
    
    // Create initial snapshots in the background (don't wait)
    // This establishes baseline data for trend tracking
    if (result.metrics.length > 0) {
      createInitialSnapshots(epicId).then((snapshotResult) => {
        console.log(`[HEART Setup] Initial snapshots for ${epicId}: ${snapshotResult.created} created`);
        if (snapshotResult.errors.length > 0) {
          console.warn(`[HEART Setup] Snapshot errors:`, snapshotResult.errors);
        }
      }).catch((err) => {
        console.error(`[HEART Setup] Failed to create initial snapshots:`, err);
      });
    }
    
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error setting up HEART metrics:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
    
    // Delete the config (cascades to metrics, snapshots, etc.)
    await deleteEpicHeartConfig(epicId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting HEART config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
