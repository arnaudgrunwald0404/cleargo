"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { createClient } from '@/lib/supabase/client';
import type { Role } from '@/lib/roles-constants';

interface HeaderWrapperProps {
  serverEmail?: string | null;
  serverRole?: Role | null;
  serverImageUrl?: string | null;
}

export function HeaderWrapper({ serverEmail, serverRole, serverImageUrl }: HeaderWrapperProps) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(serverEmail || null);
  const [role, setRole] = useState<Role | null>(serverRole || null);
  const [imageUrl, setImageUrl] = useState<string | null>(serverImageUrl || null);
  // Initialize shouldShow based on server data - if server provided email, user is likely authenticated
  const [shouldShow, setShouldShow] = useState(!!serverEmail);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First check if server provided email (from layout.tsx)
        if (serverEmail) {
          setShouldShow(true);
          setEmail(serverEmail);
          if (serverRole) setRole(serverRole);
          if (serverImageUrl) setImageUrl(serverImageUrl);
        }
        
        // Try Supabase auth
        const supabase = createClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        
        // Check /api/me which supports both Supabase auth and lr_session cookie
          try {
            const res = await fetch('/api/me', { credentials: 'include' });
            if (res.ok) {
              const data = await res.json();
              const profile = data.user;
              
              if (profile) {
              // User is authenticated (via either method)
              setShouldShow(true);
              
                // Set email if not already set
                if (!email && profile.email) {
                  setEmail(profile.email);
                }
                
                // Set avatar if available
                if (profile.avatar_url) {
                  setImageUrl(profile.avatar_url);
                }
                
                // Set role if available (prioritize roles array, fallback to role string)
                if (!role) {
                  const roles = profile.roles as string[] | null;
                  const legacyRole = profile.role as string | null;
                  
                  if (roles && roles.length > 0) {
                    setRole(roles[0] as Role);
                  } else if (legacyRole) {
                    setRole(legacyRole as Role);
                  }
                }
              }
          } else if (res.status === 401) {
            // Not authenticated
            if (!serverEmail) {
              setShouldShow(false);
            }
            }
          } catch (apiError) {
            console.error('Failed to fetch profile from /api/me:', apiError);
          // If Supabase auth worked, use that
          if (!error && user) {
            setShouldShow(true);
            if (!email && user.email) {
              setEmail(user.email);
          }
          } else if (!serverEmail) {
          setShouldShow(false);
          }
        }
      } catch (error) {
        console.error('HeaderWrapper auth check failed:', error);
        // If server provided data, show header anyway
        setShouldShow(!!serverEmail);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [serverEmail, serverRole, serverImageUrl]);

  // Hide header on login page
  const isPublicPage = pathname === '/login' || pathname?.includes('/setup-password');
  
  // Update body padding when header visibility changes
  useEffect(() => {
    const shouldShowHeader = shouldShow && !isLoading && !isPublicPage;
    if (shouldShowHeader) {
      document.body.style.paddingTop = '64px';
    } else {
      document.body.style.paddingTop = '';
    }
    
    return () => {
      // Cleanup on unmount
      document.body.style.paddingTop = '';
    };
  }, [shouldShow, isLoading, isPublicPage]);

  // Hide header on login page
  if (isPublicPage) {
    return null;
  }

  // Don't render anything while loading to avoid flash
  if (isLoading) {
    return null;
  }

  // Only show header if user is authenticated
  if (!shouldShow) {
    return null;
  }

  return <Header email={email} role={role} imageUrl={imageUrl} />;
}

