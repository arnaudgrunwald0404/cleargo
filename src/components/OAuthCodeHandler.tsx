"use client";

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Client component to handle OAuth code redirects
 * This ensures the redirect happens immediately on the client side
 * before any other components try to process the code
 */
export function OAuthCodeHandler() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  useEffect(() => {
    // Check for code in URL
    if (code) {
      // Immediately redirect to callback route
      const callbackUrl = `/auth/callback?code=${encodeURIComponent(code)}`;
      console.log('🔄 OAuthCodeHandler: Redirecting OAuth code to callback:', callbackUrl);
      window.location.replace(callbackUrl);
      return;
    }
    
    // Debug: Log all search params to see what Supabase is sending
    const allParams: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      allParams[key] = value;
    });
    if (Object.keys(allParams).length > 0) {
      console.log('🔍 OAuthCodeHandler: All search params:', allParams);
    }
    
    // Check if we're coming from a Supabase redirect (check referrer)
    if (typeof window !== 'undefined' && document.referrer) {
      const referrerUrl = new URL(document.referrer);
      if (referrerUrl.hostname.includes('supabase.co')) {
        console.log('🔍 OAuthCodeHandler: Coming from Supabase redirect:', document.referrer);
        // Check if there's a code in the referrer URL
        const referrerCode = referrerUrl.searchParams.get('code');
        if (referrerCode) {
          const callbackUrl = `/auth/callback?code=${encodeURIComponent(referrerCode)}`;
          console.log('🔄 OAuthCodeHandler: Found code in referrer, redirecting:', callbackUrl);
          window.location.replace(callbackUrl);
        }
      }
    }
  }, [code, searchParams]);

  return null; // This component doesn't render anything
}
