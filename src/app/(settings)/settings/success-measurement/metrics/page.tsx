import { redirect } from 'next/navigation';

export default function MetricsRedirectPage() {
  redirect('/admin/settings/success-measurement/metrics');
}
