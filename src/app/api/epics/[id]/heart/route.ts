/**
 * Epic HEART Metrics API
 * GET - Get HEART dashboard for an epic
 * POST - Setup HEART metrics (auto, ai_assisted, or manual)
 * DELETE - Reset/delete HEART config for an epic
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  getEpicHeartDashboard,
  getEpicHeartConfig,
  setupHeartMetricsWithAI,
  createEpicHeartConfig,
  deleteEpicHeartConfig,
  createInitialSnapshots,
} from '@/lib/heart/service';
import type { HeartSetupMethod } from '@/lib/heart/types';
import type { HeartTrackerWindow } from '@/lib/heart/window';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

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
    
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    const canEdit = canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules);

    const asOf = req.nextUrl.searchParams.get('asOf') ?? undefined;
    const windowParam = req.nextUrl.searchParams.get('window') ?? undefined;
    const validWindow: HeartTrackerWindow | undefined = windowParam && ['7D', '1M', '3M', '6M', '1Y', 'YTD', 'Max'].includes(windowParam) ? windowParam as HeartTrackerWindow : undefined;
    const dashboard = await getEpicHeartDashboard(epicId, {
      asOfDate: asOf,
      window: validWindow,
    });

    if (!dashboard) {
      return NextResponse.json({ 
        configured: false,
        canEdit,
        message: 'HEART metrics not configured for this epic'
      });
    }
    return NextResponse.json({
      configured: true,
      canEdit,
      ...dashboard,
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
    
    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return forbid();
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
    const baseUrl = (process.env.NETLIFY_URL || process.env.URL || '').replace(/\/$/, '');
    const isNetlifyProduction =
      baseUrl &&
      !baseUrl.includes('localhost') &&
      Boolean(process.env.NETLIFY_HEART_SETUP_SECRET);

    if (!isNetlifyProduction) {
      // Local or missing env: run synchronously (no 26s limit in next dev)
      const result = await setupHeartMetricsWithAI(epicId, appUserId, setupMethod, { userContext });
      if (result.error && !result.config) {
        // No Pendo data / integration not ready → 503; AI found no matching metrics → 422
        const isPendoUnavailable =
          /no pendo events|connect pendo|integration (not )?connected|no pendo events, features, or pages/i.test(
            result.error
          );
        const status = isPendoUnavailable ? 503 : 422;
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            recommendations: result.recommendations,
            availableEventNames: result.availableEventNames,
          },
          { status }
        );
      }
      if (result.metrics.length > 0) {
        createInitialSnapshots(epicId)
          .then((snapshotResult) => {
            console.log(`[HEART Setup] Initial snapshots for ${epicId}: ${snapshotResult.created} created`);
            if (snapshotResult.errors.length > 0) {
              console.warn(`[HEART Setup] Snapshot errors:`, snapshotResult.errors);
            }
          })
          .catch((err) => console.error(`[HEART Setup] Failed to create initial snapshots:`, err));
      }
      return NextResponse.json({ success: true, ...result });
    }

    // Netlify production: run in background function (15 min limit), return 202 + job_id
    // Use user's supabase client so RLS allows insert when service_role key is not configured.
    const { data: job, error: jobError } = await supabase
      .from('heart_setup_jobs')
      .insert({
        epic_id: epicId,
        app_user_id: appUserId,
        setup_method: setupMethod,
        user_context: userContext ?? null,
        status: 'pending',
      })
      .select('id')
      .single();

    if (jobError || !job?.id) {
      console.error('Failed to create HEART setup job:', jobError);
      return NextResponse.json(
        {
          error: 'Failed to start HEART setup',
          details: jobError?.message ?? (jobError as { code?: string })?.code ?? null,
        },
        { status: 500 }
      );
    }

    const secret = process.env.NETLIFY_HEART_SETUP_SECRET!;
    const bgUrl = `${baseUrl}/.netlify/functions/heart-setup-background`;
    const triggerRes = await fetch(bgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: job.id,
        epicId,
        appUserId,
        setupMethod,
        userContext: userContext ?? undefined,
        secret,
      }),
    });

    if (!triggerRes.ok) {
      const errText = await triggerRes.text();
      console.error('Failed to trigger HEART background function:', triggerRes.status, errText);
      await supabase
        .from('heart_setup_jobs')
        .update({
          status: 'failed',
          result: { error: 'Failed to start background setup' },
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);
      return NextResponse.json(
        { error: 'Failed to start HEART setup. Try again or use Manual setup.' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        job_id: job.id,
        message: 'HEART setup started. Poll setup-status for completion.',
      },
      { status: 202 }
    );
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
