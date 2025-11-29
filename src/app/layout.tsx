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
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email;

  let avatarUrl = null;
  if (email) {
    const { data: profile } = await supabase
      .from('app_user')
      .select('avatar_url')
      .eq('email', email)
      .single();
    avatarUrl = profile?.avatar_url;
  }

  const role = email ? await resolveRole(email) : null;
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
