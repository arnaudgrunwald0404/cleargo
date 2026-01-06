"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";

function SetupPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    async function validateToken() {
      const token = searchParams.get("token");
      if (!token) {
        setError("Invalid or missing token");
        setIsValidating(false);
        return;
      }

      // Validate token by calling API
      try {
        const response = await fetch("/api/auth/validate-session-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (!response.ok) {
          setError(result.error || "Invalid or expired token");
          setIsValidating(false);
          return;
        }

        setEmail(result.email);
        setIsValidToken(true);
      } catch (err) {
        setError("Failed to validate token");
      } finally {
        setIsValidating(false);
      }
    }
    validateToken();
  }, [searchParams]);

  async function handleSetupPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!email) {
      setError("Email not found");
      return;
    }

    setLoading(true);

    try {
      const token = searchParams.get("token");
      if (!token) {
        setError("Missing token");
        setLoading(false);
        return;
      }

      // Call API to set up password
      const response = await fetch("/api/auth/setup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to set up password");
      }

      // Show success notification
      notifications.show({
        title: "Success",
        message: "Password successfully set up",
        color: "green",
        autoClose: 5000,
      });

      // Redirect to login page with email pre-filled
      router.push(`/login?email=${encodeURIComponent(email!)}`);
    } catch (err: any) {
      console.error("Password setup error:", err);
      setError(err?.message || "Failed to set up password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50" style={{ marginTop: '-64px', paddingTop: 0 }}>
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Validating token...</p>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 p-4" style={{ marginTop: '-64px', paddingTop: 0 }}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Token</h1>
          <p className="text-gray-600 mb-6">{error || "This link is invalid or has expired."}</p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50 p-4" style={{ marginTop: '-64px', paddingTop: 0 }}>
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <div className="mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Set Up Your Password</h1>
          <p className="text-gray-600 text-center">
            Welcome to ClearGO! Please create a password to secure your account.
          </p>
        </div>

        {email && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 mb-6">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Account</p>
            <p className="text-sm font-medium text-gray-900">{email}</p>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSetupPassword} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
            />
            <p className="mt-1.5 text-xs text-gray-400">Must be at least 8 characters</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Setting up...
              </span>
            ) : (
              "Set Password & Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50 to-purple-50">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    }>
      <SetupPasswordForm />
    </Suspense>
  );
}

