import { getEpics } from '@/lib/epics';
import EpicDashboard from '@/components/EpicDashboard';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // AUTH DISABLED: Render dashboard directly instead of redirecting
  // This avoids any redirect-related errors
  let epics: any[] = [];
  
  try {
    epics = await getEpics() || [];
  } catch (error: any) {
    console.warn('HomePage: Failed to load epics:', error?.message);
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <EpicDashboard initialEpics={epics || []} />
      </div>
    </div>
  );
}
