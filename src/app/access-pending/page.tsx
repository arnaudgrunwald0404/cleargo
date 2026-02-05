import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Access pending feature removed: anyone from approved domains can access.
 * Redirect legacy /access-pending links to home.
 */
export default function AccessPendingPage() {
  redirect('/');
}
