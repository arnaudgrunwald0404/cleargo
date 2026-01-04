/**
 * Audit log helper
 * For now, logs to console. Will be wired to DB table later.
 */
export async function auditLog(event: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}): Promise<void> {
  // TODO: wire to DB table or logging service
  console.info('[AUDIT]', JSON.stringify(event));
}

