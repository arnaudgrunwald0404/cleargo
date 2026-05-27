/** Official Aha embedded ideas portal loader (from portal Branding → Embedded). */
export const AHA_IDEAS_EMBEDDED_SCRIPT_SRC =
  "https://secure.aha.io/assets/idea_portals/embedded/application.js";

export const AHA_IDEAS_PORTAL_DEFAULT_URL = "https://cleargo.ideas.aha.io";

/** ClearGO route that JWT-signs the user and redirects to the ideas portal (use with target="_blank"). */
export const AHA_IDEAS_PORTAL_SSO_PATH =
  "/api/integrations/aha/ideas-portal-sso?return_to=/";

/** Portal base URL with trailing slash (required by data-portal-url). */
export function getAhaIdeasPortalUrl(): string {
  const configured = process.env.NEXT_PUBLIC_AHA_IDEAS_PORTAL_URL?.trim();
  const base = (configured || AHA_IDEAS_PORTAL_DEFAULT_URL).replace(/\/$/, "");
  return `${base}/`;
}
