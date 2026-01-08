"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams, useRouter } from "next/navigation";
import { PurpleLoader } from "@/components/PurpleLoader";
import { HeroVideo } from "@/components/auth/HeroVideo";
import { FeatureGrid } from "@/components/auth/FeatureGrid";
import { TimelineVisualization } from "@/components/auth/TimelineVisualization";
import { SSOButton } from "@/components/auth/SSOButton";
import { Container, Title, Text, Stack, Group } from "@mantine/core";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const token = searchParams.get("token");
  const redirectTo = searchParams.get("redirect") || "/";
  
  // Only create Supabase client if we don't have a code (to prevent it from trying to exchange)
  // If we have a code, we'll redirect immediately before the client initializes
  const supabase = code ? null : createClient();

  const [selectedMethod, setSelectedMethod] = useState<"sso" | "email" | "magic" | null>(null);
  const [emailFormExpanded, setEmailFormExpanded] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [tokenRedirected, setTokenRedirected] = useState(false);

  // Pre-fill email from query params
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  // Handle magic link token redirect - only once
  useEffect(() => {
    if (token && !tokenRedirected) {
      setTokenRedirected(true);
      // Use replace instead of href to avoid adding to history
      window.location.replace(`/api/auth/verify?token=${encodeURIComponent(token)}`);
    }
  }, [token, tokenRedirected]);

  // Handle OAuth code redirect - must happen IMMEDIATELY before client tries to process it
  // This runs synchronously on mount if code is present
  useEffect(() => {
    if (code) {
      // CRITICAL: Use replace (not href) and do it immediately
      // This prevents the Supabase client from seeing the code and trying to exchange it
      const callbackUrl = `/auth/callback?code=${encodeURIComponent(code)}${redirectTo !== '/' ? `&next=${encodeURIComponent(redirectTo)}` : ''}`;
      console.log('🔄 Redirecting OAuth code to callback:', callbackUrl);
      window.location.replace(callbackUrl);
      return; // Exit early to prevent any other code from running
    }
  }, [code, redirectTo]);

  // Check if already authenticated - but skip if we have a code (let callback handle it)
  useEffect(() => {
    if (code || !supabase) {
      // Don't check auth if we have a code or if supabase client wasn't created
      return;
    }
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push(redirectTo);
      }
    };
    checkAuth();
  }, [supabase, router, redirectTo, code]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validation = validateEmail(email);
    if (!validation.valid) {
      setMessage({ type: "error", text: validation.error! });
      return;
    }

    if (!supabase) {
      setMessage({ type: "error", text: "Authentication service unavailable" });
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
        if (!supabase) {
          setMessage({ type: "success", text: "Account created! You can now sign in." });
          setMode("signin");
          return;
        }
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

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const validation = validateEmail(email);
    if (!validation.valid) {
      setMessage({ type: "error", text: validation.error! });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      let result: any;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error(`Server error (${response.status}): ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(result.error || "Failed to send magic link");
      }

      setMessage({
        type: "success",
        text: "Magic link sent! Check your email (including spam folder) and click the link to sign in. The link expires in 30 minutes.",
      });
      setEmail(""); // Clear email field for security
    } catch (err: any) {
      setMessage({ type: "error", text: err?.message || "Failed to send magic link" });
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

    if (!supabase) {
      setMessage({ type: "error", text: "Authentication service unavailable" });
      return;
    }

    setLoading(true);
    try {
      // Use current origin to ensure localhost links work correctly
      // This will use whatever host you're accessing (localhost:3000 or 127.0.0.1:3000)
      const redirectUrl = `${window.location.origin}/reset-password`;
      console.log('Password reset redirect URL:', redirectUrl);
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-white lg:bg-transparent">
      {/* Left Panel - Marketing Content with Dark Theme (60%) */}
      <div className="hidden lg:flex lg:w-3/6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 relative overflow-y-auto">
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
        <div className="relative z-10 w-full px-12 py-16">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">ClearGO</span>
          </div>
     
          {/* Hero Section */}
          <div className="mb-16">
            <Title order={1} style={{ fontSize: '44px', fontWeight: 800, lineHeight: 1.2, color: '#FFFFFF', marginBottom: '24px' }}>
            Launch with <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Confidence.
              </span>
            </Title>
             <div style={{ color: '#CBD5E1', lineHeight: 1.8, marginBottom: '12px', fontSize: '22px' }}>
               <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                 <li style={{ marginBottom: '12px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                   <span style={{ fontSize: '24px', lineHeight: '1' }}>🎯</span>
                   <span style={{ fontSize: '18px' }}>Replace static spreadsheets with an intelligent portfolio-wide control tower</span>
                 </li>
                  <li style={{ marginBottom: '12px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ fontSize: '24px', lineHeight: '1' }}>🤝</span>
                    <span style={{ fontSize: '18px' }}>Align all stakeholders on a single set of readiness criteria</span>
                  </li>
                 <li style={{ marginBottom: '12px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ fontSize: '24px', lineHeight: '1' }}>🔔</span>
                    <span style={{ fontSize: '18px' }}>Drive accountability & highlight blockers before it's too late</span>
                  </li>
               </ul>
             </div>
 
          </div>

          {/* Hero Video */}
          <div className="mb-12">
            <HeroVideo />
          </div>

         

         

          {/* Footer */}
          <div className="mt-auto pt-12 border-t border-slate-700/50">
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} ClearCompany. Internal Use Only.
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form (40%, Sticky) */}
      <div className="w-full lg:w-2/4 flex flex-col lg:items-center lg:justify-center p-4 sm:p-6 lg:p-8 bg-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        {/* Mobile Header - Compact */}
        <div className="lg:hidden mb-6 sm:mb-8 pt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-gray-900 tracking-tight">ClearGO</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Launch with <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Confidence.</span>
          </h1>
          <p className="text-sm text-gray-600">
            Sign in to access your launch readiness dashboard
          </p>
        </div>

        <div className="w-full max-w-md lg:mx-auto">

          {/* Three Choice Boxes */}
          {!selectedMethod && (
            <div className="space-y-3 sm:space-y-4 w-full mt-0 lg:mt-0">
              {/* Choice 1: Google SSO */}
              <button
                onClick={async () => {
                  try {
                    // Verify Supabase URL is configured
                    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
                    if (!supabaseUrl) {
                      setMessage({ 
                        type: 'error', 
                        text: 'Supabase configuration error: NEXT_PUBLIC_SUPABASE_URL is not set' 
                      });
                      console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
                      return;
                    }

                    // Verify URL format
                    if (!supabaseUrl.match(/^https:\/\/[^.]+\.supabase\.co$/)) {
                      setMessage({ 
                        type: 'error', 
                        text: `Invalid Supabase URL format: ${supabaseUrl}` 
                      });
                      console.error('❌ Invalid Supabase URL format:', supabaseUrl);
                      return;
                    }

                    // Create a fresh Supabase client for OAuth (don't use the conditional one)
                    const oauthClient = createClient();
                    // CRITICAL: Use current origin (including branch previews) for redirect
                    // This ensures the redirect URL matches the current deployment
                    // For Netlify preview branches, use the actual current origin
                    const currentOrigin = window.location.origin;
                    const redirectTo = `${currentOrigin}/auth/callback`;
                    console.log('🔐 Initiating Google OAuth:', {
                      redirectTo,
                      supabaseUrl,
                      origin: currentOrigin,
                      hostname: window.location.hostname,
                      fullUrl: window.location.href,
                      note: 'Make sure this redirectTo is in Supabase Redirect URLs list',
                    });
                    
                    const { data, error } = await oauthClient.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo,
                        queryParams: {
                          prompt: 'select_account',
                        },
                        skipBrowserRedirect: false, // Ensure browser redirect happens
                      },
                    });
                    
                    if (error) {
                      console.error('❌ OAuth error:', error);
                      console.error('❌ OAuth error details:', {
                        message: error.message,
                        status: error.status,
                        redirectTo,
                        currentOrigin: window.location.origin,
                      });
                      setMessage({ type: 'error', text: `OAuth error: ${error.message}` });
                      return;
                    }
                    
                    if (data?.url) {
                      console.log('✅ Redirecting to OAuth provider:', data.url);
                      console.log('🔍 OAuth URL details:', {
                        fullUrl: data.url,
                        redirectToInUrl: data.url.includes(encodeURIComponent(redirectTo)),
                        redirectToValue: redirectTo,
                      });
                      // Store redirectTo in sessionStorage as fallback
                      sessionStorage.setItem('oauth_redirect_to', redirectTo);
                      window.location.href = data.url;
                    } else {
                      console.error('❌ No OAuth URL returned');
                      setMessage({ type: 'error', text: 'Failed to initiate OAuth flow. Please check Supabase configuration.' });
                    }
                  } catch (err: any) {
                    console.error('❌ OAuth exception:', err);
                    setMessage({ 
                      type: 'error', 
                      text: `OAuth failed: ${err?.message || 'Unknown error'}. Please verify Supabase configuration.` 
                    });
                  }
                }}
                className="w-full p-4 sm:p-6 border-2 border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-lg transition-all duration-200 text-left group active:scale-[0.98]"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1">Log in with Google SSO</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Quick and secure single sign-on</p>
                  </div>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-indigo-600 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Choice 2: Email and Password */}
              <button
                onClick={() => {
                  setSelectedMethod("email");
                  setEmailFormExpanded(true);
                  setMode("signin");
                }}
                className="w-full p-4 sm:p-6 border-2 border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-lg transition-all duration-200 text-left group active:scale-[0.98]"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1">Log in with Email and Password</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Sign in with your email and password</p>
                  </div>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-indigo-600 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>

              {/* Choice 3: Magic Link */}
              <button
                onClick={() => {
                  setSelectedMethod("magic");
                  setMode("magic");
                }}
                className="w-full p-4 sm:p-6 border-2 border-gray-200 rounded-xl hover:border-indigo-500 hover:shadow-lg transition-all duration-200 text-left group active:scale-[0.98]"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform flex-shrink-0">
                    <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1">Send me a Magic Link</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Passwordless sign-in via email</p>
                  </div>
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-indigo-600 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            </div>
          )}

          {/* Email/Password Form - Expanded */}
          {selectedMethod === "email" && emailFormExpanded && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {mode === "signin" && "Welcome back"}
                  {mode === "signup" && "Create your account"}
                  {mode === "reset" && "Reset your password"}
                </h2>
                <button
                  onClick={() => {
                    setSelectedMethod(null);
                    setEmailFormExpanded(false);
                    setMessage(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Message */}
              {message && (
                <div
                  className={`p-4 rounded-lg text-sm ${
                    message.type === "error"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* Form */}
              <form onSubmit={
                mode === "signin" ? handleSignIn : 
                mode === "signup" ? handleSignUp : 
                handleResetPassword
              }>
                <div className="space-y-4 sm:space-y-5">
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
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-base text-gray-900 placeholder-gray-400"
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
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-base text-gray-900 placeholder-gray-400"
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
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-base text-gray-900 placeholder-gray-400"
                      />
                    </div>
                  )}

                  {/* Forgot password (signin only) */}
                  {mode === "signin" && (
                    <div className="flex justify-end items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setMode("reset");
                          setMessage(null);
                        }}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium py-1"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 sm:py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] text-base"
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
              <div className="mt-6 text-center">
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
          )}

          {/* Magic Link Form */}
          {selectedMethod === "magic" && (
            <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-start justify-between mb-4 sm:mb-6 gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">Launch with Magic Link</h2>
                  <p className="text-sm sm:text-base text-gray-500">
                    Enter your email and we'll send you a secure, passwordless sign-in link. No password needed!
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedMethod(null);
                    setMode("signin");
                    setMessage(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mt-1 flex-shrink-0"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Message */}
              {message && (
                <div
                  className={`p-4 rounded-lg text-sm ${
                    message.type === "error"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}
                >
                  {message.text}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleMagicLink}>
                <div className="space-y-4 sm:space-y-5">
                  {/* Email */}
                  <div>
                    <label htmlFor="magic-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Work Email
                    </label>
                    <input
                      id="magic-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@clearcompany.com"
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-base text-gray-900 placeholder-gray-400"
                    />
                    <p className="mt-1.5 text-xs text-gray-400">
                      Only @clearcompany.com addresses allowed
                    </p>
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-[0.98] text-base"
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
                      "Send magic link"
                    )}
                  </button>
                </div>
              </form>

              {/* Tip */}
              <div className="mt-6 text-center">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    <strong>💡 Tip:</strong> Magic links are faster and more secure. Check your email (including spam) after clicking send.
                  </p>
                </div>
              </div>
            </div>
          )}
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
          <PurpleLoader size="md" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
