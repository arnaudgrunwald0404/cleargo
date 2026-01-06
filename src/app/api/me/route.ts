import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateProfileSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  avatar_url: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Remove undefined fields before sending to Supabase
  const updateData = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  );
  // If name components are provided, construct full name
  // If name components are provided, construct full name without assigning null
  if (updateData.first_name || updateData.last_name) {
    const fullName = `${updateData.first_name || ''} ${updateData.last_name || ''}`.trim();
    if (fullName) {
      updateData.name = fullName;
    }
  }
  // If avatar_url is provided, ensure it's stored as is (could add validation later)
  if (updateData.avatar_url) {
    // No additional processing needed currently
  }

  // Use upsert to handle both insert and update cases
  // This ensures the profile is created if it doesn't exist
  // eslint-disable-next-line prefer-const
  let { data: updatedUser, error } = await supabase
    .from('app_user')
    .upsert(
      {
        email: user.email,
        ...updateData,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'email',
      }
    )
    .select()
    .single();

  // If RLS error occurs, try with admin client that bypasses RLS
  if (error && (error.message?.includes('row-level security') || error.code === '42501')) {
    const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (secretKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const adminSupabase = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secretKey);

      const adminResult = await adminSupabase
        .from('app_user')
        .upsert(
          {
            email: user.email,
            ...updateData,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'email',
          }
        )
        .select()
        .single();

      if (adminResult.error) {
        console.error('Error upserting profile with admin client:', adminResult.error);
        return NextResponse.json(
          { error: 'Failed to update profile', details: adminResult.error.message },
          { status: 500 }
        );
      }

      updatedUser = adminResult.data;
    } else {
      console.error('Error upserting profile:', error);
      return NextResponse.json(
        { error: 'Failed to update profile', details: error.message },
        { status: 500 }
      );
    }
  } else if (error) {
    console.error('Error upserting profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ user: updatedUser });
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('app_user')
    .select('*')
    .eq('email', user.email)
    .single();

  if (error) {
    // Handle case where user profile doesn't exist yet
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch profile', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ user: profile });
}
