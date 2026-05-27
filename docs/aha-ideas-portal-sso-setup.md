# Aha Ideas portal — JWT SSO setup (ClearGO)

ClearGO opens the ideas portal in a **new browser tab** from the **Feedback** nav item (`/api/integrations/aha/ideas-portal-sso?return_to=/`). Uses `AHA_IDEAS_WIDGET_JWT_SECRET`.

Portal settings: `https://clearco.aha.io/settings/account/idea_portals/7642711658240547395`

Bookmarked `/feedback` URLs redirect through the same SSO route in the current tab.

## 1. Access — require login

| Setting | Value |
|--------|--------|
| **Submission** | Full ideas portal |
| **Access** | **Private** (not Public) |

## 2. Users — self-registration

| Setting | Value |
|--------|--------|
| **Self-registration** | `*.clearcompany.com` |
| **Employees** | `*.clearcompany.com` (optional) |

## 3. Users → SSO — JSON Web Token

1. **Add new provider** → Type: **JSON Web Token** → Save.
2. **Uncheck “Access for Aha! Ideas users”** (critical). If checked, `@clearcompany.com` users who exist in Aha are sent to `secure.aha.io` instead of your Remote login URL.
3. **Remote login URL**:

   | Environment | Remote login URL |
   |-------------|------------------|
   | Production | `https://cleargo.netlify.app/api/integrations/aha/ideas-portal-sso` |
   | Local / ngrok | `https://YOUR-SUBDOMAIN.ngrok-free.dev/api/integrations/aha/ideas-portal-sso` (set `NEXT_PUBLIC_APP_URL` to match) |

4. Copy **JWT secret** → `AHA_IDEAS_WIDGET_JWT_SECRET`.
5. Copy **Callback URL** → `AHA_IDEAS_PORTAL_JWT_CALLBACK_URL` (e.g. `https://clearco.identity.aha.io/idea_portal_provider/jwt_callback/...`).
6. **Enable SSO** and select this provider on the portal (not “None”).

## 4. Verify

1. Log into ClearGO → click **Feedback** in the nav → new tab opens the ideas portal with your name (not Guest).
2. Submit a test idea — **Created by** should be your user, not Guest.

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| Redirect to `secure.aha.io` / login blocked | Uncheck **Access for Aha! Ideas users** on JWT provider. |
| Still Guest | Portal **Private** + JWT enabled; callback URL and secret match env. |
| 503 on SSO | Missing `AHA_IDEAS_WIDGET_JWT_SECRET`. |

## Code reference

- Portal SSO: `src/app/api/integrations/aha/ideas-portal-sso/route.ts`
- Nav: `src/components/Sidebar.tsx`, `src/components/Header.tsx`
- Constant: `AHA_IDEAS_PORTAL_SSO_PATH` in `src/lib/aha/ideasPortal.ts`
