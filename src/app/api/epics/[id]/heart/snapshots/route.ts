/**
 * HEART Snapshots API
 * GET - Get snapshots for an epic
 * POST - Trigger snapshot calculation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClient } from '@/lib/db';
import { createEpicSnapshots } from '@/lib/heart/snapshot-calculator';
import { getEpicHeartConfig, getEpicHeartMetrics } from '@/lib/heart/service';

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
    
    // Get config
    const config = await getEpicHeartConfig(epicId);
    if (!config) {
      return NextResponse.json(
        { error: 'HEART config not found for this epic' },
        { status: 404 }
      );
    }
    
    // Parse query params
    const url = new URL(req.url);
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const limit = parseInt(url.searchParams.get('limit') || '30', 10);
    
    // Get metrics
    const metrics = await getEpicHeartMetrics(config.id);
    const metricIds = metrics.map(m => m.id);
    
    if (metricIds.length === 0) {
      return NextResponse.json([]);
    }
    
    // Get snapshots
    const db = getClient();
    let query = db
      .from('epic_heart_snapshots')
      .select(`
        *,
        epic_heart_metrics (
          id,
          heart_category,
          name
        )
      `)
      .in('epic_heart_metric_id', metricIds)
      .order('snapshot_date', { ascending: false })
      .limit(limit);
    
    if (startDate) {
      query = query.gte('snapshot_date', startDate);
    }
    if (endDate) {
      query = query.lte('snapshot_date', endDate);
    }
    
    const { data: snapshots, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch snapshots: ${error.message}`);
    }
    
    return NextResponse.json(snapshots || []);
  } catch (error) {
    console.error('Error fetching HEART snapshots:', error);
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
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Parse body for optional date
    let snapshotDate = new Date();
    try {
      const body = await req.json();
      if (body.snapshot_date) {
        snapshotDate = new Date(body.snapshot_date);
      }
    } catch {
      // No body or invalid JSON - use today
    }
    
    // Create snapshots
    const snapshots = await createEpicSnapshots(epicId, snapshotDate);
    
    return NextResponse.json({
      success: true,
      snapshotDate: snapshotDate.toISOString().split('T')[0],
      snapshotsCreated: snapshots.length,
      snapshots,
    });
  } catch (error) {
    console.error('Error creating HEART snapshots:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
