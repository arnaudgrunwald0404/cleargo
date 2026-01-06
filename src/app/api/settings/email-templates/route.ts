import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRole } from '@/lib/roles';
import { updateSettings, getSettings } from '@/lib/settings-db';
import { z } from 'zod';
import { debugLog } from '@/lib/debug';

const emailTemplateSchema = z.object({
  email_template_invite_subject: z.string().optional().nullable(),
  email_template_invite_html: z.string().optional().nullable(),
  email_template_remind_subject: z.string().optional().nullable(),
  email_template_remind_html: z.string().optional().nullable(),
  email_template_update_criteria_subject: z.string().optional().nullable(),
  email_template_update_criteria_html: z.string().optional().nullable(),
});

function forbid() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return new NextResponse('Unauthorized', { status: 401 });
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) return forbid();
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();

    // Handle case where user doesn't exist in app_user table
    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }

    const { canRolesPerform } = await import('@/lib/permissions');
    const canRead = await canRolesPerform(
      (me?.roles as string[]) || [],
      'settings.emailTemplates.read'
    );
    if (!canRead) return forbid();

    const settings = await getSettings();

    return NextResponse.json({
      invite_subject: settings.email_template_invite_subject,
      invite_html: settings.email_template_invite_html,
      remind_subject: settings.email_template_remind_subject,
      remind_html: settings.email_template_remind_html,
      update_criteria_subject: settings.email_template_update_criteria_subject,
      update_criteria_html: settings.email_template_update_criteria_html,
    });
  } catch (error: any) {
    console.error('Error fetching email templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email templates', details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    debugLog({
      location: 'email-templates/route.ts:PATCH',
      message: 'PATCH API START',
      data: { hasUser: !!user, userEmail: user?.email },
      hypothesisId: 'B,E',
    });
    if (!user?.email) return new NextResponse('Unauthorized', { status: 401 });
    const role = await resolveRole(user.email);
    if (!(role === 'SUPERADMIN' || role === 'PRODUCT_OPS' || role === 'CPO')) return forbid();
    const { data: me, error: userError } = await supabase
      .from('app_user')
      .select('roles')
      .eq('email', user.email)
      .single();

    // Handle case where user doesn't exist in app_user table
    if (userError && userError.code === 'PGRST116') {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }
    if (userError) {
      throw userError;
    }

    const { canRolesPerform } = await import('@/lib/permissions');
    const canUpdate = await canRolesPerform(
      (me?.roles as string[]) || [],
      'settings.emailTemplates.update'
    );
    debugLog({
      location: 'email-templates/route.ts:PATCH',
      message: 'Permission check',
      data: { canUpdate, userRoles: me?.roles },
      hypothesisId: 'E',
    });
    if (!canUpdate) return forbid();

    const body = await req.json();
    debugLog({
      location: 'email-templates/route.ts:PATCH',
      message: 'Request body parsed',
      data: { bodyKeys: Object.keys(body), hasInviteSubject: !!body.email_template_invite_subject },
      hypothesisId: 'B',
    });
    const parsed = emailTemplateSchema.safeParse(body);
    if (!parsed.success) {
      debugLog({
        location: 'email-templates/route.ts:PATCH',
        message: 'Validation FAILED',
        data: { errors: parsed.error.flatten() },
        hypothesisId: 'B',
      });
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    debugLog({
      location: 'email-templates/route.ts:PATCH',
      message: 'Calling updateSettings',
      data: { parsedDataKeys: Object.keys(parsed.data) },
      hypothesisId: 'E',
    });

    const updated = await updateSettings(parsed.data);
    debugLog({
      location: 'email-templates/route.ts:PATCH',
      message: 'updateSettings SUCCESS',
      data: { updatedId: updated?.id },
      hypothesisId: 'E',
    });
    return NextResponse.json({
      invite_subject: updated.email_template_invite_subject,
      invite_html: updated.email_template_invite_html,
      remind_subject: updated.email_template_remind_subject,
      remind_html: updated.email_template_remind_html,
      update_criteria_subject: updated.email_template_update_criteria_subject,
      update_criteria_html: updated.email_template_update_criteria_html,
    });
  } catch (error: any) {
    debugLog({
      location: 'email-templates/route.ts:PATCH',
      message: 'PATCH API ERROR',
      data: { errorMessage: error?.message, errorCode: error?.code, errorDetails: error?.details },
      hypothesisId: 'B,E',
    });
    console.error('Error updating email templates:', error);
    return NextResponse.json(
      { error: 'Failed to update email templates', details: error.message },
      { status: 500 }
    );
  }
}
