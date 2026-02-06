import { verifyToken } from '@/lib/jwt';
import { isSuperAdmin } from '@/lib/auth-helpers';

const IMPERSONATE_COOKIE_NAME = 'cleargo_impersonate';

export { IMPERSONATE_COOKIE_NAME };

type ImpersonatePayload = { email: string; t: string; iat?: number };

/**
 * Verify impersonation JWT and return impersonated email and iat, or null if invalid.
 */
export async function getImpersonatedEmail(
  cookieValue: string | undefined
): Promise<{ email: string; iat: number } | null> {
  if (!cookieValue?.trim()) return null;
  try {
    const payload = await verifyToken<ImpersonatePayload>(cookieValue);
    if (payload.t !== 'impersonate' || typeof payload.email !== 'string') return null;
    const iat = typeof payload.iat === 'number' ? payload.iat : Math.floor(Date.now() / 1000);
    return { email: payload.email.toLowerCase().trim(), iat };
  } catch {
    return null;
  }
}

/**
 * Return the effective user email: impersonated if cookie is valid and real user is super admin, else real user.
 */
export async function getEffectiveUserEmail(
  realUserEmail: string | null,
  cookieValue: string | undefined
): Promise<string> {
  if (!realUserEmail) return '';
  const parsed = await getImpersonatedEmail(cookieValue);
  if (!parsed || !isSuperAdmin(realUserEmail)) return realUserEmail;
  return parsed.email;
}
