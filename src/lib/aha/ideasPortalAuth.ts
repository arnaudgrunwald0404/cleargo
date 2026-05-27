import type { SupabaseClient } from "@supabase/supabase-js";
import { getAhaIdeasPortalUrl } from "@/lib/aha/ideasPortal";
import {
  buildAhaIdeasPortalJwtCallbackUrl,
  createAhaIdeasPortalJwt,
  splitAhaPortalName,
} from "@/lib/aha/ideasPortalJwt";

export type IdeasPortalAuthResult = {
  callbackUrl: string;
  email: string;
};

/**
 * Build portal SSO JWT callback URL for the signed-in ClearGO user.
 * Used by ideas-portal-sso (redirect) and ideas-portal-jwt (embed pre-auth).
 */
export async function buildIdeasPortalAuthForEmail(
  supabase: SupabaseClient,
  effectiveEmail: string,
  options?: { returnTo?: string | null; state?: string | null }
): Promise<IdeasPortalAuthResult> {
  const { data: profile, error } = await supabase
    .from("app_user")
    .select("id, email, first_name, last_name, name")
    .eq("email", effectiveEmail)
    .single();

  if (error || !profile?.id) {
    throw new Error("User profile not found");
  }

  const { first_name, last_name } = splitAhaPortalName(profile);
  const jwt = await createAhaIdeasPortalJwt({
    id: profile.id,
    email: profile.email,
    first_name,
    last_name,
  });

  const returnTo =
    options?.returnTo && options.returnTo.startsWith("/") && !options.returnTo.startsWith("//")
      ? options.returnTo
      : "/";

  const callbackUrl = buildAhaIdeasPortalJwtCallbackUrl(getAhaIdeasPortalUrl(), jwt, {
    returnTo,
    state: options?.state ?? null,
  });

  return { callbackUrl, email: profile.email };
}
