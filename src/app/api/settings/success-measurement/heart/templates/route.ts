/**
 * API Routes for Custom Metric Templates
 * GET /api/settings/success-measurement/heart/templates - List all templates
 * POST /api/settings/success-measurement/heart/templates - Create a new template
 */
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import type { HeartCustomMetricTemplate, CreateCustomMetricTemplateDTO } from '@/lib/heart/types';

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active_only') === 'true';

    let query = supabase
      .from('heart_custom_metric_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      // Handle table not existing or permission denied gracefully
      if (error.code === 'PGRST205' || error.code === '42501' || error.message?.includes('does not exist') || error.message?.includes('permission denied')) {
        console.warn(`Table heart_custom_metric_templates not accessible (${error.code}): ${error.message}. Returning empty array.`);
        return NextResponse.json([]);
      }
      console.error('Error fetching custom metric templates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch templates', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as HeartCustomMetricTemplate[]);
  } catch (error: any) {
    console.error('Error fetching custom metric templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin role
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as CreateCustomMetricTemplateDTO;

    // Validate required fields
    if (!body.name || !body.category_label || !body.measurement_type) {
      return NextResponse.json(
        { error: 'name, category_label, and measurement_type are required' },
        { status: 400 }
      );
    }

    // Get app_user ID for created_by
    const { data: appUser } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email)
      .single();

    if (!appUser) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('heart_custom_metric_templates')
      .insert({
        name: body.name,
        description: body.description || null,
        category_label: body.category_label,
        icon: body.icon || '📊',
        measurement_type: body.measurement_type,
        pendo_event_pattern: body.pendo_event_pattern || null,
        default_target_value: body.default_target_value || null,
        default_target_timeframe_days: body.default_target_timeframe_days || null,
        created_by: appUser.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating custom metric template:', error);
      return NextResponse.json(
        { error: 'Failed to create template', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as HeartCustomMetricTemplate, { status: 201 });
  } catch (error: any) {
    console.error('Error creating custom metric template:', error);
    return NextResponse.json(
      { error: 'Failed to create template', details: error.message },
      { status: 500 }
    );
  }
}
