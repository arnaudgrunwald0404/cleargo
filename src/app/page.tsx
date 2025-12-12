import { redirect } from "next/navigation";
import DashboardPage from './dashboard/page';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // AUTH DISABLED: Always redirect to dashboard as superadmin
  // Use redirect() which throws internally (expected in Next.js)
  try {
    redirect('/dashboard');
  } catch (error: any) {
    // redirect() throws a special error - this is normal, but if it fails, render dashboard directly
    return <DashboardPage />;
  }
}
