import { Suspense } from 'react';
import { PurpleLoader } from '@/components/PurpleLoader';
import AnalyticsDashboardClient from './AnalyticsDashboardClient';

export default function AnalyticsDashboardPage() {
  return (
    <Suspense fallback={<PurpleLoader fullPage />}>
      <AnalyticsDashboardClient />
    </Suspense>
  );
}
