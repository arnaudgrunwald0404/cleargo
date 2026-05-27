import { randomBytes } from "crypto";
import { SignJWT } from "jose";
import { formatAhaIdeasWidgetUserName } from "@/lib/aha/ideasWidget";

export type AhaIdeasPortalJwtUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
};

function getPortalJwtSecret(): Uint8Array {
  const secret =
    process.env.AHA_IDEAS_PORTAL_JWT_SECRET?.trim() ||
    process.env.AHA_IDEAS_WIDGET_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "AHA_IDEAS_PORTAL_JWT_SECRET or AHA_IDEAS_WIDGET_JWT_SECRET is not configured"
    );
  }
  return new TextEncoder().encode(secret);
}

/** Split display name into Aha portal SSO first/last fields. */
export function splitAhaPortalName(profile: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email: string;
}): Pick<AhaIdeasPortalJwtUser, "first_name" | "last_name"> {
  const first = profile.first_name?.trim();
  const last = profile.last_name?.trim();
  if (first || last) {
    return {
      first_name: first || "User",
      last_name: last || "",
    };
  }

  const display = formatAhaIdeasWidgetUserName(profile);
  if (display.includes(" ")) {
    const parts = display.split(/\s+/);
    return {
      first_name: parts[0] || "User",
      last_name: parts.slice(1).join(" "),
    };
  }

  const local = profile.email.split("@")[0] || "User";
  return { first_name: local, last_name: "" };
}

/**
 * HS256 JWT for Aha Ideas portal SSO (Remote login URL flow).
 * @see https://support.aha.io/aha-ideas/support-articles/portal-single-sign-on/configure-sso-ideas-portal-json~7444664138938879741
 */
export async function createAhaIdeasPortalJwt(
  user: AhaIdeasPortalJwtUser
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const jti = `${iat}/${randomBytes(32).toString("base64url")}`;

  return new SignJWT({
    iat,
    jti,
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email.toLowerCase(),
    sub: user.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(getPortalJwtSecret());
}

/**
 * JWT callback base from Aha identity provider settings (Users → SSO → Callback URL).
 * Example: https://clearco.identity.aha.io/idea_portal_provider/jwt_callback/7644603561049421993
 * Do not use cleargo.ideas.aha.io/auth/jwt/callback when Aha shows an identity.aha.io URL.
 */
export function getAhaIdeasPortalJwtCallbackBase(): string | null {
  const configured = process.env.AHA_IDEAS_PORTAL_JWT_CALLBACK_URL?.trim();
  return configured || null;
}

export function buildAhaIdeasPortalJwtCallbackUrl(
  portalBaseUrl: string,
  jwt: string,
  options?: { returnTo?: string | null; state?: string | null }
): string {
  const callbackBase =
    getAhaIdeasPortalJwtCallbackBase() ||
    `${portalBaseUrl.replace(/\/$/, "")}/auth/jwt/callback`;

  const url = new URL(callbackBase);
  url.searchParams.set("jwt", jwt);
  if (options?.returnTo) {
    url.searchParams.set("return_to", options.returnTo);
  }
  if (options?.state) {
    url.searchParams.set("state", options.state);
  }
  return url.toString();
}
