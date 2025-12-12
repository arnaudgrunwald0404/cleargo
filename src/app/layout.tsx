import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Header } from "@/components/Header";
import { createClient } from "@/lib/supabase/server";
import { resolveRole } from "@/lib/roles";
import type { Role } from "@/lib/roles-constants";
import { theme } from "@/lib/mantine-theme";

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

  // AUTH DISABLED: Use mock superadmin
  const { getMockSuperAdminProfile } = await import('@/lib/auth-mock');
  const profile = getMockSuperAdminProfile();
  email = profile.email;
  avatarUrl = profile.avatar_url || null;
  role = 'SUPERADMIN' as Role;
  
  /* AUTH DISABLED
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    email = user?.email || null;

    if (email) {
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
  } catch {
    // Continue rendering without user data
  }
  */
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased ${email ? 'pt-[8px]' : ''}`}
      >
        <MantineProvider theme={theme}>
          <Notifications />
          {email && <Header email={email} role={role} imageUrl={avatarUrl} />}
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
