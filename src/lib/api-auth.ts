import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

/**
 * Get the authenticated user's email from either Supabase auth or lr_session cookie.
 * This supports both standard Supabase authentication (Google SSO, email/password)
 * and magic link authentication (lr_session cookie).
 * 
 * @returns The user's email if authenticated, null otherwise
 */
export async function getAuthenticatedUserEmail(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    // Check for custom lr_session cookie (used by magic link)
    const session = await getSession();
    const sessionEmail = session?.email;
    
    // Use email from Supabase auth or from lr_session cookie
    return user?.email || sessionEmail || null;
  } catch (error) {
    console.error("Error getting authenticated user email:", error);
    return null;
  }
}

/**
 * Get the authenticated user's email and throw an error if not authenticated.
 * Useful for API routes that require authentication.
 * 
 * @throws Error if user is not authenticated
 * @returns The user's email
 */
export async function requireAuth(): Promise<string> {
  const email = await getAuthenticatedUserEmail();
  if (!email) {
    throw new Error("Unauthorized");
  }
  return email;
}
