/** Public Aha! workspace host for epic deep links (client-safe). */
const DEFAULT_AHA_HOST = 'clearco.aha.io';

export function getAhaWorkspaceHost(): string {
  const fromEnv = process.env.NEXT_PUBLIC_AHA_DOMAIN?.trim();
  return fromEnv || DEFAULT_AHA_HOST;
}

export function ahaEpicUrl(ahaKey: string): string {
  const key = ahaKey.trim();
  if (!key) return '';
  return `https://${getAhaWorkspaceHost()}/epics/${encodeURIComponent(key)}`;
}
