import type { Role } from './roles';

/**
 * Require that user has one of the allowed roles
 * Throws error with status 403 if user doesn't have required role
 */
export function requireRole(userRoles: Role[], allowed: Role[]): void {
  const ok = allowed.some(r => userRoles.includes(r));
  if (!ok) {
    const err = new Error('Forbidden');
    // @ts-ignore
    err.status = 403;
    throw err;
  }
}

