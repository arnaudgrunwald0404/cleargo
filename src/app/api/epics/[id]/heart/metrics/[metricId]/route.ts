/**
 * Individual HEART Metric API
 * GET - Get metric details with snapshots
 * PATCH - Update metric
 * DELETE - Delete metric
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  updateEpicHeartMetric,
  deleteEpicHeartMetric,
  getLatestSnapshot,
  getSnapshots,
  getMetricMilestones,
  updateMetricMilestones,
} from '@/lib/heart/service';
import { getClient } from '@/lib/db';
import type { UpdateEpicHeartMetricDTO } from '@/lib/heart/types';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { metricId } = await params;
    
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get metric
    const db = getClient();
    const { data: metric, error } = await db
      .from('epic_heart_metrics')
      .select('*')
      .eq('id', metricId)
      .single();
    
    if (error || !metric) {
      return NextResponse.json(
        { error: 'Metric not found' },
        { status: 404 }
      );
    }
    
    // Get snapshots
    const url = new URL(req.url);
    const startDate = url.searchParams.get('start_date') || undefined;
    const endDate = url.searchParams.get('end_date') || undefined;
    
    const snapshots = await getSnapshots(metricId, startDate, endDate);
    const latestSnapshot = await getLatestSnapshot(metricId);
    const milestones = await getMetricMilestones(metricId);
    
    return NextResponse.json({
      metric: { ...metric, milestones },
      latestSnapshot,
      snapshots,
    });
  } catch (error) {
    console.error('Error fetching HEART metric:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { metricId } = await params;
    
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
    
    // Parse body
    const body = await req.json();
    
    // Build update DTO (only include provided fields)
    const dto: UpdateEpicHeartMetricDTO = {};
    if (body.name !== undefined) dto.name = body.name;
    if (body.description !== undefined) dto.description = body.description;
    if (body.measurement_type !== undefined) dto.measurement_type = body.measurement_type;
    if (body.pendo_event_ids !== undefined) dto.pendo_event_ids = body.pendo_event_ids;
    if (body.pendo_segment_id !== undefined) dto.pendo_segment_id = body.pendo_segment_id;
    if (body.pendo_app_id !== undefined) dto.pendo_app_id = body.pendo_app_id;
    if (body.target_value !== undefined) dto.target_value = body.target_value;
    if (body.target_timeframe_days !== undefined) dto.target_timeframe_days = body.target_timeframe_days;
    if (body.target_unit !== undefined) dto.target_unit = body.target_unit;
    if (body.is_active !== undefined) dto.is_active = body.is_active;
    // Custom metric fields
    if (body.custom_category_label !== undefined) dto.custom_category_label = body.custom_category_label;
    if (body.custom_icon !== undefined) dto.custom_icon = body.custom_icon;
    if (body.composite_config !== undefined) dto.composite_config = body.composite_config;
    
    // Update metric
    const metric = await updateEpicHeartMetric(metricId, dto);
    
    // Update milestones if provided
    if (body.milestones !== undefined && Array.isArray(body.milestones)) {
      try {
        await updateMetricMilestones(metricId, body.milestones);
      } catch (milestoneError) {
        console.error('Error updating milestones:', milestoneError);
      }
    }
    
    return NextResponse.json(metric);
  } catch (error) {
    console.error('Error updating HEART metric:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; metricId: string }> }
) {
  try {
    const { metricId } = await params;
    
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
    
    // Delete metric
    await deleteEpicHeartMetric(metricId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting HEART metric:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
