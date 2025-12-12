import { HomeDashboard } from '@/components/HomeDashboard';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // AUTH DISABLED: Use mock user profile
  let email: string | null = null;
  let firstName: string | null = null;
  let enableActivityFeed = true;
  
  try {
    const { getMockSuperAdminProfile } = await import('@/lib/auth-mock');
    const profile = getMockSuperAdminProfile();
    email = profile?.email || 'agrunwald@clearcompany.com';
    firstName = profile?.first_name || null;
  } catch (error: any) {
    email = 'agrunwald@clearcompany.com';
    firstName = null;
  }

  // Try to fetch real profile from database if available
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const { data: profile } = await supabase
        .from('app_user')
        .select('email, first_name')
        .eq('email', user.email)
        .single();
      
      if (profile) {
        email = profile.email || email;
        firstName = profile.first_name || firstName;
      }
    }
  } catch (error) {
    // Silently fail - use mock data
  }

  // Fetch settings to check if activity feed is enabled
  try {
    const settings = await getSettings();
    enableActivityFeed = settings.enable_activity_feed !== false;
  } catch (error) {
    // Silently fail - default to enabled
    console.warn('Failed to fetch settings for activity feed:', error);
  }

  return <HomeDashboard userEmail={email} firstName={firstName} enableActivityFeed={enableActivityFeed} />;
}
