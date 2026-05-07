import { sanitizePivotCellString } from '@/lib/aha/pivotNormalizer';
import type { RoadmapItem } from '@/types/roadmap';

/**
 * Strip Aha status-pill HTML from pivot-backed snapshot strings (pod, GTM, epic title).
 * Safe for plain text (no-op when no tags).
 */
export function sanitizeRoadmapHtmlCell(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  return sanitizePivotCellString(raw).trim();
}

/** Fields sufficient to resolve the snapshot display title (GTM vs Epic name). */
export type DisplayNameFields = Pick<RoadmapItem, 'gtm_name' | 'aha_name' | 'aha_key'>;

/** Returns GTM name when set; otherwise Epic name; otherwise Aha key. */
export function getDisplayName(item: DisplayNameFields): string {
  const gtm = sanitizeRoadmapHtmlCell(item.gtm_name);
  if (gtm) return gtm;
  const epic = sanitizeRoadmapHtmlCell(item.aha_name);
  if (epic) return epic;
  return sanitizeRoadmapHtmlCell(item.aha_key);
}

/** Fields sufficient to resolve pod line (GTM module vs Dev backlog pod). */
export type DisplayPodFields = Pick<RoadmapItem, 'gtm_module' | 'aha_pod'>;

/** Returns GTM module when set; otherwise Dev Backlog/Pod. May be empty. */
export function getDisplayPod(item: DisplayPodFields): string {
  const gtm = sanitizeRoadmapHtmlCell(item.gtm_module);
  if (gtm) return gtm;
  return sanitizeRoadmapHtmlCell(item.aha_pod);
}

/**
 * Snapshot "Contact" comes from Epic assignee email in the pivot; Aha may embed HTML (status pills).
 * Strip tags/entities, then email local-part, or first word when there is no "@".
 */
export function formatSnapshotContactDisplay(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  const cleaned = sanitizeRoadmapHtmlCell(raw);
  if (!cleaned) return '';
  const at = cleaned.indexOf('@');
  if (at > 0) return cleaned.slice(0, at).trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts[0] ?? '';
}
