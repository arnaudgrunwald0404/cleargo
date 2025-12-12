import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // AUTH DISABLED: Always redirect to dashboard as superadmin
  // Use redirect() which throws, so wrap in try-catch is not needed
  redirect('/dashboard');
}
