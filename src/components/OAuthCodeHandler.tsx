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
    if (code) {
      // Immediately redirect to callback route
      const callbackUrl = `/auth/callback?code=${encodeURIComponent(code)}`;
      console.log('🔄 Root page: Redirecting OAuth code to callback:', callbackUrl);
      window.location.replace(callbackUrl);
    }
  }, [code]);

  return null; // This component doesn't render anything
}
