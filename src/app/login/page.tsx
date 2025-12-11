"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // CRITICAL: If OAuth code is present, IMMEDIATELY redirect to callback handler
  // This handles the case where Supabase redirects to /login instead of /auth/callback
  // Using window.location.href for immediate redirect (no React delay)
  useEffect(() => {
    if (code) {
      console.log('🔍 OAuth code detected on /login, immediately redirecting to /auth/callback');
      // Use window.location.href for immediate redirect (faster than router)
      window.location.href = `/auth/callback?code=${code}`;
      return;
    }
  }, [code]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      // Reload so SSR session is picked up by middleware
      window.location.href = "/dashboard";
    } catch (err: any) {
      setMessage(err?.message || "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      // If email confirmations are enabled, Supabase will send a confirmation email
      setMessage("Account created. Check your email to confirm, then sign in.");
    } catch (err: any) {
      setMessage(err?.message || "Sign-up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pt-24 max-w-md mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">{mode === "signin" ? "Sign in" : "Create account"}</h1>

      <div className="mb-4 text-sm text-gray-600">
        <button
          className="underline mr-2"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>

      <form onSubmit={mode === "signin" ? handleSignIn : handleSignUp} className="space-y-3">
        <label className="block">
          <div className="text-sm mb-1">Email</div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded"
          />
        </label>
        <label className="block">
          <div className="text-sm mb-1">Password</div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border rounded"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>

      {message && <p className="mt-4 text-sm text-red-600">{message}</p>}

      <div className="mt-6 text-sm text-gray-600">
        <p>Or continue with Google OAuth from the header avatar if configured.</p>
      </div>
    </main>
  );
}
