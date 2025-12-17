import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AccessPendingPage() {
  let email: string | null = null;

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email || null;
  } catch {
    // Continue without user data
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Header with icon */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-10 text-center">
            <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-10 h-10 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Access Pending</h1>
            <p className="text-indigo-100 text-sm">
              Your account is ready, but you need access to continue
            </p>
          </div>

          {/* Content */}
          <div className="px-8 py-8">
            <div className="text-center mb-6">
              <p className="text-gray-600 leading-relaxed">
                Welcome to <span className="font-semibold text-gray-900">ClearGO</span>! Your
                account has been created successfully.
              </p>
            </div>

            {email && (
              <div className="bg-gray-50 rounded-lg px-4 py-3 mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Signed in as</p>
                <p className="text-sm font-medium text-gray-900 truncate">{email}</p>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4 mb-6">
              <div className="flex gap-3">
                <svg
                  className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-sm text-amber-800 font-medium mb-1">Access Required</p>
                  <p className="text-sm text-amber-700">
                    Please contact a <span className="font-medium">Product Ops</span> team member to
                    request access to ClearGO.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-500 text-center mb-6">
              Once you&apos;ve been granted access, you can refresh this page or sign in again.
            </p>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Link
                href="/"
                className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors text-center"
              >
                Check Access
              </Link>
              <Link
                href="/auth/signout"
                className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors text-center"
              >
                Sign Out
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Need help? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
