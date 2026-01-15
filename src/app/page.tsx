import { HomeDashboard } from '@/components/HomeDashboard';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings-db';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { OAuthCodeHandler } from '@/components/OAuthCodeHandler';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ code?: string; [key: string]: string | string[] | undefined }>;
}) {
  // Await searchParams as it's now a Promise in Next.js 15+
  const params = await searchParams;
  
  // Check if OAuth code is present in URL - if so, redirect to callback route
  const code = params?.code;
  if (code && typeof code === 'string') {
    console.log('🔍 Root page: OAuth code detected, redirecting to callback');
    // Redirect to callback route to handle code exchange
    redirect(`/auth/callback?code=${encodeURIComponent(code)}`);
  }
  
  // Avoid enumerating searchParams (which is a dynamic API).
  // We already handle the only key we care about (code) above.
  // If needed for debugging in development, prefer logging specific keys explicitly.
  
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  // Check for custom lr_session cookie (used by magic link)
  const session = await getSession();
  const sessionEmail = session?.email;
  
  // Redirect to login if user is not authenticated
  // Do this BEFORE any try-catch so redirect always happens
  // Check both Supabase auth and custom lr_session cookie
  if ((error || !user?.email) && !sessionEmail) {
    const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL;
    if (marketingUrl) {
      // External marketing website
      redirect(marketingUrl);
    } else {
      // Internal login page
      redirect('/login');
    }
  }
  
  // Use email from Supabase auth or from lr_session cookie
  const userEmail = user?.email || sessionEmail;
  
  let email: string | null = userEmail || null;
  let firstName: string | null = null;
  let enableActivityFeed = true;
  let isFirstTime = false;
  
  try {
    
    if (userEmail) {
      email = userEmail;
      
      // Check if this is the user's first login
      // If account was created recently (within last hour) and this is their first sign-in, show welcome message
      if (user?.created_at) {
        const createdAt = new Date(user.created_at).getTime();
        const now = Date.now();
        const accountAge = now - createdAt;
        
        // If account was created within the last hour, it's likely their first time
        // Also check if last_sign_in_at is null or very close to created_at
        if (accountAge < 60 * 60 * 1000) { // Within 1 hour
          if (!user.last_sign_in_at) {
            // No previous sign-in means first time
            isFirstTime = true;
          } else {
            const lastSignIn = new Date(user.last_sign_in_at).getTime();
            // If last sign-in is within 10 minutes of account creation, it's first time
            isFirstTime = Math.abs(lastSignIn - createdAt) < 10 * 60 * 1000;
          }
        }
      } else if (user && !user.last_sign_in_at) {
        // No created_at and no last_sign_in_at means first time
        isFirstTime = true;
      }
      
      // Fetch profile data
      const { data: profile } = await supabase
        .from('app_user')
        .select('email, first_name, name')
        .eq('email', userEmail)
        .single();
      
      if (profile) {
        email = profile.email || email;
        firstName = profile.first_name || profile.name?.split(' ')[0] || null;
      }
    }
  } catch (error) {
    // Continue without user data
    console.warn('Failed to fetch user profile:', error);
  }

  // Fetch settings to check if activity feed is enabled
  try {
    const settings = await getSettings();
    enableActivityFeed = settings.enable_activity_feed !== false;
  } catch (error) {
    // Silently fail - default to enabled
    console.warn('Failed to fetch settings for activity feed:', error);
  }

  return (
    <>
      <OAuthCodeHandler />
      <HomeDashboard userEmail={email} firstName={firstName} enableActivityFeed={enableActivityFeed} isFirstTime={isFirstTime} />
    </>
  );
}
