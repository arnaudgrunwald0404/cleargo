import { redirect } from 'next/navigation';

export default function PendoRedirectPage() {
  // Redirect to the new admin location
  redirect('/admin/settings/integrations/pendo');
}
