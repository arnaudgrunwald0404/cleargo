import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin (you may want to add a role check here)
    // For now, we'll allow any authenticated user

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      // Initiate OAuth flow
      const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/integrations/google-calendar/oauth`;
      const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
      const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly',
      ].join(' ');

      if (!clientId) {
        return NextResponse.json(
          { error: 'Google Calendar client ID not configured' },
          { status: 500 }
        );
      }

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        access_type: 'offline',
        prompt: 'consent',
      })}`;

      return NextResponse.redirect(authUrl);
    }

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/integrations/google-calendar/oauth`;
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Google Calendar credentials not configured' },
        { status: 500 }
      );
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Token exchange error:', error);
      return NextResponse.json({ error: 'Failed to exchange authorization code' }, { status: 500 });
    }

    const tokens = await tokenResponse.json();

    // Validate that we have required tokens
    if (!tokens.access_token) {
      console.error('No access token received from Google');
      return NextResponse.json(
        { error: 'Failed to obtain access token from Google' },
        { status: 500 }
      );
    }

    // Get user ID from app_user table
    const { data: appUser, error: userError } = await supabase
      .from('app_user')
      .select('id')
      .eq('email', user.email)
      .single();

    if (userError || !appUser) {
      console.error('Error fetching user:', userError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 3600));

    // Prepare data for upsert
    const integrationData: any = {
      user_id: appUser.id,
      access_token: tokens.access_token,
      token_expires_at: expiresAt.toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Handle refresh_token - Google may not return one on re-authorization
    if (tokens.refresh_token) {
      // New refresh token received - use it
      integrationData.refresh_token = tokens.refresh_token;
    } else {
      // No refresh token in response - try to preserve existing one
      const { data: existing } = await supabase
        .from('google_calendar_integrations')
        .select('refresh_token')
        .eq('user_id', appUser.id)
        .maybeSingle();

      if (existing?.refresh_token) {
        // Preserve existing refresh token
        integrationData.refresh_token = existing.refresh_token;
      } else {
        // No refresh token available - this is OK, access token will work until expiration
        // User can re-authorize if needed
        console.warn(
          'No refresh token received and none exists in database. Access token will work until expiration.'
        );
      }
    }

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('google_calendar_integrations')
      .upsert(integrationData, {
        onConflict: 'user_id',
      });

    if (dbError) {
      console.error('Error storing tokens:', dbError);
      console.error('Database error details:', JSON.stringify(dbError, null, 2));
      return NextResponse.json(
        {
          error: 'Failed to store integration',
          details: dbError.message || 'Database error occurred',
        },
        { status: 500 }
      );
    }

    // Redirect to meetings page
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/meetings?connected=true`
    );
  } catch (error: any) {
    console.error('Error in Google Calendar OAuth:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
