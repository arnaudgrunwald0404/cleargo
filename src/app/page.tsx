import { HomeDashboard } from '@/components/HomeDashboard';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/settings-db';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let email: string | null = null;
  let firstName: string | null = null;
  let enableActivityFeed = true;
  
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user?.email) {
      email = user.email;
      
      // Fetch profile data
      const { data: profile } = await supabase
        .from('app_user')
        .select('email, first_name, name')
        .eq('email', user.email)
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

  return <HomeDashboard userEmail={email} firstName={firstName} enableActivityFeed={enableActivityFeed} />;
}
