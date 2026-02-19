/**
 * API Routes for HEART Category Defaults
 * GET /api/settings/success-measurement/heart/defaults - List all category defaults
 * PUT /api/settings/success-measurement/heart/defaults - Update a category default
 */
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { getEffectivePermissionRules } from '@/lib/settings-db';
import { canRolesPerformWithRules } from '@/lib/permissions';
import type { HeartCategoryDefault, UpdateHeartCategoryDefaultDTO } from '@/lib/heart/types';

export async function GET() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('heart_category_defaults')
      .select('*')
      .order('heart_category');

    if (error) {
      // Handle table not existing gracefully
      if (error.code === 'PGRST205' || error.message?.includes('does not exist')) {
        console.warn('Table heart_category_defaults does not exist. Migration may not have been applied.');
        return NextResponse.json([]);
      }
      console.error('Error fetching HEART defaults:', error);
      return NextResponse.json(
        { error: 'Failed to fetch HEART defaults', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as HeartCategoryDefault[]);
  } catch (error: any) {
    console.error('Error fetching HEART defaults:', error);
    return NextResponse.json(
      { error: 'Failed to fetch HEART defaults', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: me } = await supabase.from('app_user').select('roles').eq('email', user.email).single();
    const rules = await getEffectivePermissionRules();
    if (!canRolesPerformWithRules((me?.roles as string[]) || [], 'settings.successMeasurement.update', rules)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { heart_category, ...updates } = body as { heart_category: string } & UpdateHeartCategoryDefaultDTO;

    if (!heart_category) {
      return NextResponse.json(
        { error: 'heart_category is required' },
        { status: 400 }
      );
    }

    // Get app_user ID for updated_by
    const { data: appUser } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email)
      .single();

    const { data, error } = await supabase
      .from('heart_category_defaults')
      .update({
        ...updates,
        updated_by: appUser?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('heart_category', heart_category)
      .select()
      .single();

    if (error) {
      console.error('Error updating HEART default:', error);
      return NextResponse.json(
        { error: 'Failed to update HEART default', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data as HeartCategoryDefault);
  } catch (error: any) {
    console.error('Error updating HEART default:', error);
    return NextResponse.json(
      { error: 'Failed to update HEART default', details: error.message },
      { status: 500 }
    );
  }
}
