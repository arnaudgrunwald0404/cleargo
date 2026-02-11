import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function MyItemsPage() {
    // Redirect to home page since MyTasks is now merged into HomeDashboard
    redirect('/');
}
