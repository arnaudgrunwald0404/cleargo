import { createClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/roles";
import { WelcomePage } from "@/components/WelcomePage";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createClient();

  // Check for auth errors from OAuth callback
  const error = searchParams?.error;
  const errorMessage = searchParams?.message;
  if (error) {
    console.error('❌ Auth error from callback:', error, errorMessage);
  }

  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;
  const role = email ? await resolveRole(email) : null;

  if (!email) {
    return <WelcomePage />;
  }

  // Fetch user profile to get first_name
  let firstName = null;
  if (email) {
    const { data: profile } = await supabase
      .from('app_user')
      .select('first_name')
      .eq('email', email)
      .single();
    firstName = profile?.first_name;
  }

  // Use first_name if available, otherwise fall back to email prefix
  const displayName = firstName || email.split('@')[0];

  const navigationCards = [
    {
      title: "Epics",
      description: "View and manage all epics",
      href: "/epics",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      gradient: "from-blue-500 to-cyan-500",
    },
    {
      title: "My Items",
      description: "Track your assigned criteria and tasks",
      href: "/my-items",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
      gradient: "from-purple-500 to-pink-500",
    },
    {
      title: "Settings",
      description: "Manage application settings",
      href: "/admin/settings",
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      gradient: "from-emerald-500 to-teal-500",
    },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-8">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome back, <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{displayName}</span>
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl">
            Manage your epics, track readiness criteria, and ensure successful go-to-market execution.
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
          {navigationCards.map((card) => (
            <a
              key={card.href}
              href={card.href}
              className="group relative bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100 hover:border-transparent hover:-translate-y-1 w-full"
            >
              {/* Gradient overlay on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />

              <div className="relative p-6">
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <div className="text-white">
                    {card.icon}
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                  {card.title}
                </h3>

                <p className="text-sm text-gray-600 mb-4">
                  {card.description}
                </p>

                <div className="flex items-center text-sm font-medium text-indigo-600 group-hover:text-indigo-700">
                  <span>Open</span>
                  <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </a>
          ))}
        </div>

        {/* Quick Stats Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Epics</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">My Pending Items</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">High Risk Epics</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">—</p>
              </div>
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
