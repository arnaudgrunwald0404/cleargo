import { redirect } from 'next/navigation';

export default function DashboardsRedirectPage() {
  redirect('/admin/settings/success-measurement/dashboards');
}
