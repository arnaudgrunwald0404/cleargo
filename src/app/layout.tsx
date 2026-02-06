import type { Metadata } from "next";
import { Inter, Roboto_Mono, Marcellus } from "next/font/google";
import "./globals.css";
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HeaderWrapper } from "@/components/HeaderWrapper";
import { TableScopeWrapper } from "@/components/TableScopeWrapper";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { createClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/roles";
import type { Role } from "@/lib/roles-constants";
import { theme } from "@/lib/mantine-theme";
import { FeatureFlagsProvider } from "@/contexts/FeatureFlagsContext";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { getEffectiveUserEmail, IMPERSONATE_COOKIE_NAME } from "@/lib/auth/impersonation";

// Force dynamic rendering for the root layout since it uses cookies for auth
export const dynamic = 'force-dynamic';

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const marcellus = Marcellus({
  weight: "400",
  variable: "--font-marcellus",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ClearGO",
  description: "Launch Readiness Console",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let email: string | null = null;
  let avatarUrl: string | null = null;
  let role: Role | null = null;

  try {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    // Check for custom lr_session cookie (used by magic link)
    const session = await getSession();
    const sessionEmail = session?.email;
    
    const realUserEmail = user?.email || sessionEmail;
    const cookieStore = await cookies();
    const impersonateCookie = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
    const effectiveEmail = realUserEmail ? await getEffectiveUserEmail(realUserEmail.toLowerCase(), impersonateCookie) : '';

    if (effectiveEmail) {
      email = effectiveEmail;

      try {
        const { data: profile } = await supabase
          .from('app_user')
          .select('avatar_url')
          .eq('email', email)
          .single();
        avatarUrl = profile?.avatar_url || null;
      } catch {
        // Continue without avatar URL
      }

      try {
        role = await resolveRole(email);
      } catch {
        // Continue without role
      }
    }
  } catch (error) {
    // If auth check fails, HeaderWrapper will handle client-side check
    console.error('Server-side auth check failed:', error);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${marcellus.variable} antialiased`}
      >
        <MantineProvider theme={theme}>
          <FeatureFlagsProvider>
            <Notifications />
            <HeaderWrapper serverEmail={email} serverRole={role} serverImageUrl={avatarUrl} />
            <div style={{ minHeight: '100vh', background: 'var(--color-platinum)' }}>
              <TableScopeWrapper>{children}</TableScopeWrapper>
            </div>
            <ImpersonationBanner />
          </FeatureFlagsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
