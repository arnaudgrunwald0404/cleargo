import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // AUTH DISABLED: Always redirect to dashboard as superadmin
  // redirect() throws internally which is expected behavior in Next.js
  redirect('/dashboard');
}
