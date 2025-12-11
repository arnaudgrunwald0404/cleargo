"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

function ResetPasswordForm() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is authenticated (via recovery token)
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Invalid or expired reset link. Please request a new password reset.");
      } else {
        setIsAuthenticated(true);
      }
    }
    checkAuth();
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
      // Update the password (user is already authenticated via recovery token)
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setMessage("Password reset successfully! Redirecting to login...");
      // Sign out after password reset to force re-login
      await supabase.auth.signOut();
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      setError(err?.message || "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthenticated) {
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

