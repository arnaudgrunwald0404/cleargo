"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";

function TokenExpiredForm() {
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get("email");
  const [email, setEmail] = useState(emailFromUrl || "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleResendInvitation(e?: React.FormEvent) {
    if (e) e.preventDefault();
    
    if (!email || !email.includes("@")) {
      notifications.show({
        title: "Invalid Email",
        message: "Please enter a valid email address",
        color: "red",
        autoClose: 3000,
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/resend-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to resend invitation");
      }

      setSent(true);
      notifications.show({
        title: "Invitation Sent",
        message: "A new invitation has been sent to your email address.",
        color: "green",
        autoClose: 5000,
      });
    } catch (error: any) {
      notifications.show({
        title: "Error",
        message: error.message || "Failed to resend invitation. Please try again.",
        color: "red",
        autoClose: 5000,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 p-4" style={{ marginTop: '-64px', paddingTop: 0 }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Invitation Link Expired</h1>
        <p className="text-gray-600 mb-6">
          This invitation link has expired. We can send you a new one right away.
        </p>

        {emailFromUrl ? (
          <div className="bg-gray-50 rounded-lg px-4 py-3 mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Email Address</p>
            <p className="text-sm font-medium text-gray-900">{emailFromUrl}</p>
          </div>
        ) : (
          <div className="mb-6">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Enter the email address where you received the invitation
            </p>
          </div>
        )}

        {sent ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 text-sm font-medium">
                ✓ New invitation sent!
              </p>
              <p className="text-green-700 text-sm mt-1">
                Please check your email for the new invitation link.
              </p>
            </div>
            <a
              href="/login"
              className="inline-block w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Go to Login
            </a>
          </div>
        ) : (
          <form onSubmit={handleResendInvitation} className="space-y-4">
            <button
              type="submit"
              disabled={loading || !email || !email.includes("@")}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending...
                </span>
              ) : (
                "Send New Invitation"
              )}
            </button>
            <a
              href="/login"
              className="inline-block w-full px-6 py-3 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors border border-gray-200 text-center"
            >
              Go to Login Instead
            </a>
          </form>
        )}
      </div>
    </div>
  );
}

export default function TokenExpiredPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <TokenExpiredForm />
    </Suspense>
  );
}
