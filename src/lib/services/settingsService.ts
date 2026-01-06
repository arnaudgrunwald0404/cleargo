// Lightweight service wrappers around settings-related API endpoints.
// Keep fetch semantics and JSON shapes identical to current usage in page.tsx

import { debugLog } from '@/lib/debug';

export async function getSettings() {
  const res = await fetch(`/api/settings?t=${Date.now()}`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

export async function patchSettings(payload: any) {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}

export async function getUsers() {
  const res = await fetch('/api/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  return res.json();
}

export async function getPods() {
  const res = await fetch('/api/admin/pods');
  if (!res.ok) throw new Error('Failed to fetch pods');
  return res.json();
}

export async function getReleases() {
  const res = await fetch('/api/releases');
  if (!res.ok) throw new Error('Failed to fetch releases');
  return res.json();
}

export async function addRelease(payload: { release_name: string; launch_date: string }) {
  const res = await fetch('/api/releases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to add release');
  return res.json();
}

export async function deleteRelease(id: number) {
  const res = await fetch(`/api/releases/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete release');
  return res.json().catch(() => ({}));
}

export async function updateRelease(
  id: number,
  payload: { release_name: string; launch_date: string }
) {
  const res = await fetch(`/api/releases/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update release');
  return res.json();
}

export async function getAhaFields() {
  const res = await fetch('/api/settings/aha-fields');
  if (!res.ok) throw new Error('Failed to fetch AHA fields');
  return res.json();
}

export async function syncAhaFields() {
  const res = await fetch('/api/settings/aha-fields/sync', { method: 'POST' });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to synchronize fields');
  }
  return res.json();
}

export async function getEmailTemplates() {
  const res = await fetch('/api/settings/email-templates');
  if (!res.ok) throw new Error('Failed to fetch email templates');
  return res.json();
}

export async function patchEmailTemplates(payload: any) {
  debugLog({
    location: 'settingsService.ts:patchEmailTemplates',
    message: 'patchEmailTemplates API call START',
    data: { payloadKeys: Object.keys(payload) },
    hypothesisId: 'C',
  });
  const res = await fetch('/api/settings/email-templates', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  debugLog({
    location: 'settingsService.ts:patchEmailTemplates',
    message: 'patchEmailTemplates API response',
    data: { ok: res.ok, status: res.status, statusText: res.statusText },
    hypothesisId: 'C',
  });
  if (!res.ok) throw new Error('Failed to save email templates');
  return res.json().catch(() => ({}));
}

export async function getPermissions() {
  const res = await fetch('/api/settings/permissions');
  if (!res.ok) throw new Error('Failed to fetch permissions');
  return res.json();
}

export async function patchPermissions(payload: { rules: Record<string, string[]> }) {
  const res = await fetch('/api/settings/permissions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save permissions');
  return res.json().catch(() => ({}));
}

export async function getLaunchStages() {
  const res = await fetch('/api/epic-stages');
  if (!res.ok) throw new Error('Failed to fetch launch stages');
  return res.json();
}

export async function addLaunchStage(payload: {
  name: string;
  sort_order: number;
  duration_days: number | null;
  details: string | null;
}) {
  const res = await fetch('/api/epic-stages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to add stage');
  return res.json();
}

export async function updateLaunchStage(payload: {
  id: number;
  name?: string;
  sort_order?: number;
  duration_days?: number | null;
  details?: string | null;
}) {
  const res = await fetch('/api/epic-stages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update stage');
  return res.json();
}

export async function deleteLaunchStage(id: number) {
  const res = await fetch(`/api/epic-stages/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete stage');
  return res.json().catch(() => ({}));
}

export async function reorderLaunchStages(stages: any[]) {
  const res = await fetch('/api/epic-stages', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stages }),
  });
  if (!res.ok) throw new Error('Failed to reorder stages');
  return res.json();
}
