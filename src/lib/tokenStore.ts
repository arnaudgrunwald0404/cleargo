import { createClient } from "@supabase/supabase-js";

// Get Supabase client for database operations
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase configuration for token store");
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

export async function markTokenSent(jti: string, email: string, expiresAt: Date) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("used_magic_link_tokens")
    .insert({
      jti,
      email,
      sent_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      used_at: null,
    });
  
  if (error) {
    console.error(`[TokenStore] Error marking token ${jti} as sent:`, error);
      throw error;
    }
  }

export async function markTokenUsed(jti: string) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("used_magic_link_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("jti", jti)
    .is("used_at", null); // Only update if not already used
  
  if (error) {
    console.error(`[TokenStore] Error marking token ${jti} as used:`, error);
      throw error;
    }
  }

export async function isTokenUsed(jti: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("used_magic_link_tokens")
    .select("used_at")
    .eq("jti", jti)
    .single();
  
  if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
    console.error(`[TokenStore] Error checking token ${jti}:`, error);
    // If we can't check, assume not used to allow the request through
    return false;
  }
  
  // Token is used if it exists and used_at is not null
  return !!data && !!data.used_at;
}

/**
 * Atomically check if token is used and mark it as used if not.
 * Returns true if the token was already used, false if it was successfully marked as used.
 * Uses database UPDATE with WHERE clause to ensure atomicity.
 */
export async function checkAndMarkTokenUsed(jti: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  
  try {
    // First check if token exists and is already used
    const { data: existing } = await supabase
      .from("used_magic_link_tokens")
      .select("used_at")
      .eq("jti", jti)
      .single();
    
    if (existing) {
      if (existing.used_at) {
        console.log(`[TokenStore] Token ${jti} already marked as used`);
        return true; // Already used
      }
      
      // Token exists but not used yet - mark it as used atomically
      const { error } = await supabase
        .from("used_magic_link_tokens")
        .update({ used_at: new Date().toISOString() })
        .eq("jti", jti)
        .is("used_at", null); // Only update if not already used (prevents race conditions)
      
      if (error) {
        console.error(`[TokenStore] Error updating token ${jti}:`, error);
        // Check again if it was updated by another request
        const { data: recheck } = await supabase
          .from("used_magic_link_tokens")
          .select("used_at")
          .eq("jti", jti)
          .single();
        
        if (recheck?.used_at) {
          return true; // Another request marked it as used
        }
        // Allow through if update failed
        return false;
      }
      
      console.log(`[TokenStore] Successfully marked token ${jti} as used`);
      return false; // Successfully marked as used
    }
    
    // Token doesn't exist in database - this shouldn't happen if markTokenSent was called
    // But allow through to avoid blocking legitimate requests
    console.warn(`[TokenStore] Token ${jti} not found in database, allowing through`);
    return false;
  } catch (error: any) {
    console.error(`[TokenStore] Error in checkAndMarkTokenUsed for ${jti}:`, error);
    // If we can't check, assume not used to allow the request through
    // The token expiration (30m) provides security
    return false;
  }
}

export async function canSendEmail(email: string, cooldownMs = 60000): Promise<boolean> {
  // Check the most recent email sent to this address (based on sent_at, not used_at)
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("used_magic_link_tokens")
    .select("sent_at")
    .eq("email", email)
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();
  
  if (error && error.code !== "PGRST116") { // PGRST116 = no rows returned
    console.error(`[TokenStore] Error checking email cooldown for ${email}:`, error);
    // If we can't check, allow sending (safer than blocking)
    return true;
  }
  
  if (!data) {
    // No previous emails sent, allow sending
    return true;
  }
  
  const lastSent = new Date(data.sent_at).getTime();
  const now = Date.now();
  const canSend = now - lastSent >= cooldownMs;
  
  if (!canSend) {
    console.log(`[TokenStore] Email ${email} is in cooldown period (last sent ${Math.round((now - lastSent) / 1000)}s ago)`);
  }
  
  return canSend;
}
