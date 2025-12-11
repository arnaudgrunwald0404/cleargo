"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Standard Supabase password reset flow:
    // 1. User clicks link → redirected with tokens in URL
    // 2. Extract tokens and set session
    // 3. Then user can update password
    
    async function setupSession() {
      // Check if we have tokens in the URL (from Supabase redirect)
      const accessToken = searchParams.get('access_token');
      const refreshToken = searchParams.get('refresh_token');
      
      if (accessToken && refreshToken) {
        // Set session from URL tokens (standard Supabase pattern)
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        
        if (sessionError) {
          setError("Invalid or expired reset link. Please request a new password reset.");
          return;
        }
        
        if (data.session) {
          setIsReady(true);
          return;
        }
      }
      
      // Fallback: check if session already exists (from callback route)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsReady(true);
        return;
      }
      
      // No session found
      setError("Invalid or expired reset link. Please request a new password reset.");
    }
    
    setupSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      // Simple: update password (session should already be set from URL tokens)
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setMessage("Password reset successfully! Redirecting to login...");
      
      // Sign out and redirect to login (user can log in with new password)
      await supabase.auth.signOut();
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!isReady) {
    return (
      <main className="pt-24 max-w-md mx-auto px-4">
        <h1 className="text-2xl font-bold mb-4">Reset Password</h1>
        <div className="bg-red-100 text-red-700 p-4 rounded">
          <p className="text-sm">{error || "Invalid or expired reset link. Please request a new password reset."}</p>
        </div>
        <div className="mt-4">
          <a href="/login" className="text-indigo-600 hover:text-indigo-700 underline">
            Back to login
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="pt-24 max-w-md mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">Reset Password</h1>
      <p className="text-sm text-gray-600 mb-6">
        Enter your new password below.
      </p>

      <form onSubmit={handleResetPassword} className="space-y-4">
        <label className="block">
          <div className="text-sm mb-1">New Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Enter new password (min. 6 characters)"
            className="w-full px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <div className="text-sm mb-1">Confirm Password</div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Confirm new password"
            className="w-full px-3 py-2 border rounded"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded disabled:opacity-50"
        >
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-red-100 text-red-700 p-4 rounded text-sm">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-4 bg-green-100 text-green-700 p-4 rounded text-sm">
          {message}
        </div>
      )}

      <div className="mt-6 text-sm text-gray-600">
        <a href="/login" className="text-indigo-600 hover:text-indigo-700 underline">
          Back to login
        </a>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="pt-24 p-8">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

