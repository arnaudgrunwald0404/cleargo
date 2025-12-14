"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";

const ALLOWED_DOMAIN = "clearcompany.com";

function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) {
    return { valid: false, error: "Email is required" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Please enter a valid email address" };
  }
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain !== ALLOWED_DOMAIN) {
    return { valid: false, error: `Only @${ALLOWED_DOMAIN} email addresses are allowed` };
  }
  return { valid: true };
}

function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirect") || "/";

  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  // Handle OAuth code redirect
  useEffect(() => {
    if (code) {
      window.location.href = `/auth/callback?code=${code}`;
    }
  }, [code]);

  // Check if already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push(redirectTo);
      }
    };
    checkAuth();
  }, [supabase, router, redirectTo]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validation = validateEmail(email);
    if (!validation.valid) {
      setMessage({ type: "error", text: validation.error! });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (!data.session) {
        throw new Error("No session returned from sign in");
      }

      // Navigate to intended destination
      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      console.error("Login error:", err);
      setMessage({ type: "error", text: err?.message || "Sign-in failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validation = validateEmail(email);
    if (!validation.valid) {
      setMessage({ type: "error", text: validation.error! });
      return;
    }

    if (password.length < 8) {
      setMessage({ type: "error", text: "Password must be at least 8 characters" });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    setLoading(true);
    try {
      // Call our signup API to create user and provision account
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Sign-up failed");
      }

      if (result.requiresConfirmation) {
        setMessage({ type: "success", text: "Account created! Check your email to confirm, then sign in." });
        setMode("signin");
      } else {
        setMessage({ type: "success", text: "Account created! Redirecting..." });
        // Sign in automatically
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setMessage({ type: "success", text: "Account created! You can now sign in." });
          setMode("signin");
        } else {
          router.push(redirectTo);
          router.refresh();
        }
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Sign-up failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validation = validateEmail(email);
    if (!validation.valid) {
      setMessage({ type: "error", text: validation.error! });
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      if (error) throw error;

      setMessage({ type: "success", text: "Password reset email sent! Check your inbox." });
      setEmail("");
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to send reset email" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-500 rounded-full blur-[128px]" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-purple-600 rounded-full blur-[128px]" />
          <div className="absolute top-1/2 left-1/3 w-64 h-64 bg-blue-500 rounded-full blur-[100px]" />
        </div>
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 py-12">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">ClearGO</span>
          </div>

          {/* Tagline */}
          <h1 className="text-5xl font-bold text-white leading-tight mb-6">
            Launch with
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Confidence
            </span>
          </h1>
          
          <p className="text-xl text-slate-300 leading-relaxed max-w-md mb-12">
            Your intelligent launch readiness console. Replace spreadsheet chaos with real-time insights and automated gates.
          </p>

          {/* Feature highlights */}
          <div className="space-y-4">
            {[
              { icon: "📊", text: "Portfolio-wide visibility" },
              { icon: "🎯", text: "Automated readiness scoring" },
              { icon: "🔔", text: "Smart alerts & accountability" },
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-slate-300">
                <span className="text-xl">{feature.icon}</span>
                <span className="text-lg">{feature.text}</span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-auto pt-12">
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} ClearCompany. Internal Use Only.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-gray-900">ClearGO</span>
          </div>

          {/* Form Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {mode === "signin" && "Welcome back"}
              {mode === "signup" && "Create your account"}
              {mode === "reset" && "Reset your password"}
            </h2>
            <p className="text-gray-500">
              {mode === "signin" && "Sign in to access the launch console"}
              {mode === "signup" && "Join your team on ClearGO"}
              {mode === "reset" && "We'll send you a reset link"}
            </p>
          </div>

          {/* Message */}
          {message && (
            <div
              className={`mb-6 p-4 rounded-lg text-sm ${
                message.type === "error"
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700 border border-green-200"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Form */}
          <form onSubmit={mode === "signin" ? handleSignIn : mode === "signup" ? handleSignUp : handleResetPassword}>
            <div className="space-y-5">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Work Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@clearcompany.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400"
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Only @clearcompany.com addresses allowed
                </p>
              </div>

              {/* Password */}
              {mode !== "reset" && (
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
                  {mode === "signup" && (
                    <p className="mt-1.5 text-xs text-gray-400">
                      Must be at least 8 characters
                    </p>
                  )}
                </div>
              )}

              {/* Confirm Password (signup only) */}
              {mode === "signup" && (
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
              )}

              {/* Forgot password link */}
              {mode === "signin" && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Please wait...
                  </span>
                ) : (
                  <>
                    {mode === "signin" && "Sign in"}
                    {mode === "signup" && "Create account"}
                    {mode === "reset" && "Send reset link"}
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Mode toggle */}
          <div className="mt-8 text-center">
            {mode === "signin" && (
              <p className="text-gray-600">
                Don&apos;t have an account?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setMessage(null);
                  }}
                  className="text-indigo-600 hover:text-indigo-700 font-semibold"
                >
                  Sign up
                </button>
              </p>
            )}
            {mode === "signup" && (
              <p className="text-gray-600">
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("signin");
                    setMessage(null);
                  }}
                  className="text-indigo-600 hover:text-indigo-700 font-semibold"
                >
                  Sign in
                </button>
              </p>
            )}
            {mode === "reset" && (
              <button
                onClick={() => {
                  setMode("signin");
                  setMessage(null);
                }}
                className="text-indigo-600 hover:text-indigo-700 font-semibold"
              >
                ← Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
