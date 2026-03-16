"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { createClient } from '@/lib/supabase/client';
import type { Role } from '@/lib/roles-constants';

interface SidebarWrapperProps {
  serverEmail?: string | null;
  serverRole?: Role | null;
  serverImageUrl?: string | null;
}

export function SidebarWrapper({ serverEmail, serverRole, serverImageUrl }: SidebarWrapperProps) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(serverEmail || null);
  const [role, setRole] = useState<Role | null>(serverRole || null);
  const [imageUrl, setImageUrl] = useState<string | null>(serverImageUrl || null);
  const isPublicPage = pathname === '/login' || pathname?.includes('/setup-password');

  const [shouldShow, setShouldShow] = useState(!!serverEmail);
  const [isLoading, setIsLoading] = useState(!serverEmail && !isPublicPage);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (isPublicPage) {
          setIsLoading(false);
          return;
        }

        if (serverEmail) {
          setShouldShow(true);
          setEmail(serverEmail);
          if (serverRole) setRole(serverRole);
          if (serverImageUrl) setImageUrl(serverImageUrl);
          setIsLoading(false);
          return;
        }

        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        try {
          const { fetchWithRateLimit } = await import('@/lib/fetch-with-rate-limit');
          const res = await fetchWithRateLimit('/api/me', { credentials: 'include', maxRetries: 1 });
          if (res.ok) {
            const data = await res.json();
            const profile = data.user;
            if (profile) {
              setShouldShow(true);
              if (!email && profile.email) setEmail(profile.email);
              if (profile.avatar_url) setImageUrl(profile.avatar_url);
              if (!role) {
                const roles = profile.roles as string[] | null;
                const legacyRole = profile.role as string | null;
                if (roles && roles.length > 0) setRole(roles[0] as Role);
                else if (legacyRole) setRole(legacyRole as Role);
              }
            }
          } else if (res.status === 401) {
            if (!serverEmail) setShouldShow(false);
          }
        } catch (apiError) {
          console.error('Failed to fetch profile from /api/me:', apiError);
          if (!error && user) {
            setShouldShow(true);
            if (!email && user.email) setEmail(user.email);
          } else if (!serverEmail) {
            setShouldShow(false);
          }
        }
      } catch (error) {
        console.error('SidebarWrapper auth check failed:', error);
        setShouldShow(!!serverEmail);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, [serverEmail, serverRole, serverImageUrl, isPublicPage]);

  // Set sidebar class and CSS variable (padding is on .sidebar-content-area via CSS, not body)
  useEffect(() => {
    const show = !isPublicPage && (shouldShow || isLoading);
    if (show) {
      document.body.style.paddingTop = '0';
      document.body.classList.add('has-sidebar');
      document.documentElement.style.setProperty('--sidebar-width', '240px');
    } else {
      document.body.classList.remove('has-sidebar');
      document.documentElement.style.setProperty('--sidebar-width', '0px');
    }
    return () => {
      document.body.classList.remove('has-sidebar');
    };
  }, [shouldShow, isLoading, isPublicPage]);

  if (isPublicPage) return null;
  if (isLoading && !serverEmail) return null;
  if (!shouldShow) return null;

  return <Sidebar email={email} role={role} imageUrl={imageUrl} />;
}
