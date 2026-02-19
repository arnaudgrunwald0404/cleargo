/**
 * Epic HEART Metrics CRUD API
 * GET - Get all metrics for an epic's HEART config
 * POST - Create a new metric
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import {
  getEpicHeartConfig,
  getEpicHeartMetrics,
  createMetricMilestones,
} from '@/lib/heart/service';
import type { HeartCategoryId } from '@/lib/heart/types';

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    
    // Get config
    const config = await getEpicHeartConfig(epicId);
    if (!config) {
      return NextResponse.json(
        { error: 'HEART config not found for this epic' },
        { status: 404 }
      );
    }
    
    // Get metrics
    const metrics = await getEpicHeartMetrics(config.id);
    
    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error fetching HEART metrics:', error);
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
    
    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return forbid();
    }
    
    const config = await getEpicHeartConfig(epicId);
    if (!config) {
      return NextResponse.json(
        { error: 'HEART config not found for this epic. Create config first.' },
        { status: 404 }
      );
    }
    
    // Parse body
    const body = await req.json();
    const isCustom = body.is_custom === true;
    
    // Determine if this is a manual (non-Pendo) metric via explicit data_source flag
    // or by checking if pendo_event_ids are provided
    const isManualDataSource = body.data_source === 'manual' || 
      (!body.pendo_event_ids || body.pendo_event_ids.length === 0);
    
    // Validate required fields
    if (!body.name || !body.measurement_type) {
      return NextResponse.json(
        { error: 'Missing required fields: name, measurement_type' },
        { status: 400 }
      );
    }
    
    // Pendo event IDs are required only for explicitly Pendo-sourced metrics
    if (body.data_source === 'pendo' && (!body.pendo_event_ids || body.pendo_event_ids.length === 0)) {
      return NextResponse.json(
        { error: 'Pendo-sourced metrics require at least one event or feature in pendo_event_ids' },
        { status: 400 }
      );
    }
    
    if (isCustom) {
      // Custom metric - requires custom_category_label
      if (!body.custom_category_label) {
        return NextResponse.json(
          { error: 'Custom metrics require custom_category_label' },
          { status: 400 }
        );
      }
    } else {
      // HEART metric - requires heart_category
      if (!body.heart_category) {
        return NextResponse.json(
          { error: 'HEART metrics require heart_category' },
          { status: 400 }
        );
      }
      
      // Validate heart_category
      const validCategories: HeartCategoryId[] = ['happiness', 'engagement', 'adoption', 'retention', 'task_success'];
      if (!validCategories.includes(body.heart_category)) {
        return NextResponse.json(
          { error: `Invalid heart_category. Must be one of: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }
      
      // Check for duplicate - only one metric per HEART category
      const existingMetrics = await getEpicHeartMetrics(config.id);
      const duplicate = existingMetrics.find(m => m.heart_category === body.heart_category && !m.is_custom);
      if (duplicate) {
        return NextResponse.json(
          { error: `A metric is already configured for ${body.heart_category}. Use Edit Metrics to modify it.` },
          { status: 409 }
        );
      }
    }
    
    // Build the insert object - use direct supabase insert to support custom fields
    const insertData: Record<string, any> = {
      epic_heart_config_id: config.id,
      name: body.name,
      description: body.description || null,
      measurement_type: body.measurement_type,
      pendo_event_ids: body.pendo_event_ids || [],
      pendo_segment_id: body.pendo_segment_id || null,
      pendo_app_id: body.pendo_app_id || null,
      target_value: body.target_value || null,
      target_timeframe_days: body.target_timeframe_days || null,
      target_unit: body.target_unit || '%',
      ai_suggested: body.ai_suggested || false,
      ai_rationale: body.ai_rationale || null,
    };
    
    if (isCustom) {
      insertData.is_custom = true;
      insertData.custom_category_label = body.custom_category_label;
      insertData.custom_icon = body.custom_icon || '📊';
      insertData.template_id = body.template_id || null;
      insertData.heart_category = null; // Custom metrics don't have a HEART category
    } else {
      insertData.is_custom = false;
      insertData.heart_category = body.heart_category;
    }
    
    // Insert directly to support new custom fields
    const { data: metric, error: insertError } = await supabase
      .from('epic_heart_metrics')
      .insert(insertData)
      .select()
      .single();
    
    if (insertError) {
      console.error('Error creating metric:', insertError);
      return NextResponse.json(
        { error: insertError.message || 'Failed to create metric' },
        { status: 500 }
      );
    }
    
    // Create milestones if provided
    if (body.milestones && Array.isArray(body.milestones) && body.milestones.length > 0) {
      try {
        await createMetricMilestones(metric.id, body.milestones);
      } catch (milestoneError) {
        console.error('Error creating milestones:', milestoneError);
        // Don't fail the request, just log the error
      }
    }
    
    return NextResponse.json(metric, { status: 201 });
  } catch (error) {
    console.error('Error creating HEART metric:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
