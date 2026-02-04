import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HeaderWrapper } from "@/components/HeaderWrapper";
import { createClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/roles";
import type { Role } from "@/lib/roles-constants";
import { theme } from "@/lib/mantine-theme";
import { EpicScopeProvider } from "@/lib/contexts/EpicScopeContext";
import { FeatureFlagsProvider } from "@/contexts/FeatureFlagsContext";
import { getSession } from "@/lib/auth";

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
    
    // Use email from Supabase auth or from lr_session cookie
    const userEmail = user?.email || sessionEmail;
    
    if (userEmail) {
      email = userEmail;

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <MantineProvider theme={theme}>
          <FeatureFlagsProvider>
            <EpicScopeProvider>
              <Notifications />
              <HeaderWrapper serverEmail={email} serverRole={role} serverImageUrl={avatarUrl} />
              {children}
            </EpicScopeProvider>
          </FeatureFlagsProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
