import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

export interface UserWithRoles {
  email: string;
  roles: string[];
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Use new publishable key, fallback to legacy anon key for backward compatibility
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!publishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables'
    );
  }

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        console.log(
          '🔄 Middleware - Cookies being set/updated:',
          cookiesToSet.map((c) => ({
            name: c.name,
            hasValue: !!c.value,
            action: c.value ? 'set' : 'clear',
          }))
        );
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
          if (!value) {
            console.log('⚠️ Middleware - Cookie being cleared:', name);
          }
        });
      },
    },
  });

  // CRITICAL: Always call getUser() to refresh/sync the session
  // This ensures that sessions stored in localStorage (from createBrowserClient)
  // are synced to cookies (for createServerClient) on the next request
  // Supabase SSR handles the sync automatically when getUser() is called
  //
  // Note: getUser() reads from cookies, but Supabase SSR will automatically
  // sync sessions from the request if they exist. For signInWithPassword,
  // the session is in localStorage client-side, so we need to ensure it's
  // synced via a request that includes the session token.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    // Only log if it's not a "missing session" error (which is normal for unauthenticated requests)
    if (!error.message.includes('Auth session missing') && !error.message.includes('JWTExpired')) {
      console.log('⚠️ Middleware - getUser() error:', error.message);
    }
  } else if (user) {
    console.log('✅ Middleware - User session valid:', user.email);
    // Session is valid - Supabase SSR has synced it to cookies automatically
  }

  return response;
}

/**
 * Get the current user's email and roles from the database.
 * Used in middleware to check if user has only the OTHER role (pending access).
 * Uses service role key to bypass RLS since we need to read roles for authorization.
 */
export async function getUserWithRoles(request: NextRequest): Promise<UserWithRoles | null> {
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!publishableKey) {
    return null;
  }

  // First, get the authenticated user using the publishable key
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // We don't need to set cookies in this read-only function
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    return null;
  }

  // Query app_user table to get roles
  // Use lowercase email for consistency
  const emailLower = user.email.toLowerCase();

  // Use service role key to bypass RLS for role lookup (if available)
  // This is necessary because RLS might prevent users from reading their own roles
  let appUser = null;
  let userError = null;

  if (serviceRoleKey) {
    // Use service role to bypass RLS - use createClient from supabase-js directly
    // createServerClient from @supabase/ssr doesn't properly bypass RLS with service role
    const adminSupabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey
    );

    const result = await adminSupabase
      .from('app_user')
      .select('roles, role')
      .eq('email', emailLower)
      .single();

    appUser = result.data;
    userError = result.error;
  } else {
    // Fallback to regular client (may fail due to RLS)
    const result = await supabase
      .from('app_user')
      .select('roles, role')
      .eq('email', emailLower)
      .single();

    appUser = result.data;
    userError = result.error;
  }

  console.log(
    '🔍 getUserWithRoles - email:',
    emailLower,
    'appUser:',
    appUser,
    'error:',
    userError?.message
  );

  if (userError || !appUser) {
    // User exists in auth but not in app_user table - treat as OTHER
    console.log('⚠️ getUserWithRoles - No app_user found, defaulting to OTHER');
    return { email: user.email, roles: ['OTHER'] };
  }

  // Handle both 'roles' array and legacy 'role' string field
  const roles = appUser.roles || (appUser.role ? [appUser.role] : ['OTHER']);

  console.log('✅ getUserWithRoles - Resolved roles:', roles);
  return { email: user.email, roles };
}
