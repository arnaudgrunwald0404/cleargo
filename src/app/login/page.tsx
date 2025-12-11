"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
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
      
      // CRITICAL: Wait for session to be persisted and verify it exists
      if (!data.session) {
        throw new Error("No session returned from sign in");
      }
      
      // Verify session is accessible
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Session not available after sign in");
      }
      
      console.log('✅ Login successful, session available:', {
        accessToken: session.access_token ? 'present' : 'missing',
        refreshToken: session.refresh_token ? 'present' : 'missing',
        expiresAt: session.expires_at
      });
      
      // CRITICAL: Supabase SSR requires sessions to be in cookies for server-side access
      // After signInWithPassword, session is in localStorage but needs to be in cookies
      // We need to manually sync the session to cookies so middleware/server can read it
      // This works on both localhost (HTTP) and production (HTTPS)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
      
      if (projectRef && session.access_token) {
        // Manually set the session cookie that Supabase SSR expects
        // Format: sb-{project-ref}-auth-token
        const cookieName = `sb-${projectRef}-auth-token`;
        const isSecure = window.location.protocol === 'https:';
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        
        // Supabase stores session as JSON in the cookie
        const sessionData = {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user
        };
        
        const cookieValue = encodeURIComponent(JSON.stringify(sessionData));
        const maxAge = 60 * 60 * 24 * 365; // 1 year
        
        // Set cookie - secure flag only in production (not localhost)
        const secureFlag = isSecure && !isLocalhost ? 'Secure;' : '';
        document.cookie = `${cookieName}=${cookieValue}; path=/; SameSite=Lax; ${secureFlag} max-age=${maxAge}`;
        
        console.log('🍪 Manually set session cookie:', {
          cookieName,
          isSecure: !!secureFlag,
          isLocalhost,
          expiresAt: session.expires_at
        });
      }
      
      // Small delay to ensure cookie is set
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Use full page reload - middleware will now read the session from cookies
      window.location.href = "/dashboard";
    } catch (err: any) {
      console.error('❌ Login error:', err);
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
      
      // Check if email confirmation is required
      if (data.user && !data.session) {
        // Email confirmation required
        setMessage("Account created! Check your email to confirm, then sign in.");
      } else if (data.session) {
        // No email confirmation required - auto signed in
        setMessage("Account created! Redirecting...");
        window.location.href = "/dashboard";
      } else {
        setMessage("Account created! You can now sign in.");
      }
    } catch (err: any) {
      setMessage(err?.message || "Sign-up failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      // Standard Supabase password reset: redirect directly to reset-password page
      // Supabase will append access_token and refresh_token to the URL
      // 
      // CRITICAL: Use current origin so it works for both localhost and production
      // For localhost: http://localhost:3000/reset-password
      // For production: https://cleargo.netlify.app/reset-password
      const redirectTo = `${window.location.origin}/reset-password`;
      
      console.log('🔍 Password reset redirectTo:', redirectTo);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
      
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        setMessage("Password reset email sent! To test locally: In the email link, change 'redirect_to=https://cleargo.netlify.app' to 'redirect_to=http://localhost:3000/reset-password' before clicking. Or test on production - it will work there.");
      } else {
        setMessage("Password reset email sent! Check your email for the reset link.");
      }
      // Clear email after successful request
      setEmail("");
    } catch (err: any) {
      setMessage(err?.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pt-24 max-w-md mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">
        {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}
      </h1>

      <div className="mb-4 text-sm text-gray-600 flex flex-wrap gap-2">
        {mode !== "reset" && (
          <>
            <button
              className="underline"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
            </button>
            {mode === "signin" && (
              <>
                <span>•</span>
                <button
                  className="underline"
                  onClick={() => setMode("reset")}
                >
                  Forgot password?
                </button>
              </>
            )}
          </>
        )}
        {mode === "reset" && (
          <button
            className="underline"
            onClick={() => setMode("signin")}
          >
            Back to sign in
          </button>
        )}
      </div>

      {mode === "reset" ? (
        <form onSubmit={handleResetPassword} className="space-y-3">
          <label className="block">
            <div className="text-sm mb-1">Email</div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email address"
              className="w-full px-3 py-2 border rounded"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      ) : (
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
      )}

      {message && (
        <p className={`mt-4 text-sm ${message.includes("error") || message.includes("failed") || message.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
          {message}
        </p>
      )}

      {mode !== "reset" && (
        <div className="mt-6 text-sm text-gray-600">
          <p>Or continue with Google OAuth from the header avatar if configured.</p>
        </div>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
