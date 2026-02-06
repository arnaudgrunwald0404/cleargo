import { getSettings } from '@/lib/settings-db';
import { PortfolioContent } from './PortfolioContent';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  let enableActivityFeed = true;
  try {
    const settings = await getSettings();
    enableActivityFeed = settings.enable_activity_feed !== false;
  } catch {
    // default enabled
  }

  return (
    <PortfolioContent enableActivityFeed={enableActivityFeed} />
  );
}
