// Lightweight service wrappers around settings-related API endpoints.
// Keep fetch semantics and JSON shapes identical to current usage in page.tsx

import { debugLog } from "@/lib/debug";
import { fetchWithRateLimit } from "@/lib/fetch-with-rate-limit";

export async function getSettings() {
  const res = await fetchWithRateLimit(`/api/settings?t=${Date.now()}`, {
    maxRetries: 1,
  });
  if (!res.ok) {
    let errorMessage = "Failed to fetch settings";
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
      if (errorData.details) {
        errorMessage += `: ${errorData.details}`;
      }
    } catch {
      errorMessage = `Failed to fetch settings: ${res.status} ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function patchSettings(payload: any) {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let errorMessage = "Failed to save settings";
    let errorData: any = null;
    try {
      const responseText = await res.text();
      if (responseText) {
        errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorData.details || errorMessage;
        if (errorData.details && typeof errorData.details === 'object') {
          errorMessage += `: ${JSON.stringify(errorData.details)}`;
        } else if (errorData.details && typeof errorData.details === 'string') {
          errorMessage += `: ${errorData.details}`;
        }
        if (errorData.code) {
          errorMessage += ` (code: ${errorData.code})`;
        }
      } else {
        errorMessage = `Failed to save settings: ${res.status} ${res.statusText} (empty response)`;
      }
    } catch (parseError) {
      // If response is not JSON, use status text
      errorMessage = `Failed to save settings: ${res.status} ${res.statusText}`;
      if (parseError instanceof Error) {
        errorMessage += ` (parse error: ${parseError.message})`;
      }
    }
    console.error("patchSettings error:", {
      status: res.status,
      statusText: res.statusText,
      errorMessage,
      errorData,
      payload
    });
    throw new Error(errorMessage);
  }
  const result = await res.json();
  console.log('[settingsService] patchSettings response:', {
    hasResult: !!result,
    hasPendoAppNames: !!(result?.pendo_app_names),
    pendoAppNames: result?.pendo_app_names,
    allKeys: result ? Object.keys(result) : []
  });
  return result;
}

export async function getUsers() {
  const res = await fetchWithRateLimit("/api/users", {
    maxRetries: 1,
  });
  if (!res.ok) {
    let errorMessage = "Failed to fetch users";
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
      if (errorData.details) {
        errorMessage += `: ${errorData.details}`;
      }
    } catch {
      errorMessage = `Failed to fetch users: ${res.status} ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return res.json();
}

export async function getPods() {
  const res = await fetchWithRateLimit("/api/admin/pods", {
    maxRetries: 1,
  });
  if (!res.ok) throw new Error("Failed to fetch pods");
  return res.json();
}

export async function getReleases(includeArchived: boolean = false) {
  const url = includeArchived ? "/api/releases?include_archived=true" : "/api/releases";
  const res = await fetchWithRateLimit(url, {
    maxRetries: 1,
  });
  if (!res.ok) throw new Error("Failed to fetch releases");
  return res.json();
}

export async function addRelease(payload: { release_name: string; launch_date: string }) {
  const res = await fetch("/api/releases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add release");
  return res.json();
}

export async function deleteRelease(id: number) {
  const res = await fetch(`/api/releases/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete release");
  return res.json().catch(() => ({}));
}

export async function updateRelease(id: number, payload: { release_name: string; launch_date: string }) {
  const res = await fetch(`/api/releases/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update release");
  return res.json();
}

export async function getAhaFields() {
  const res = await fetchWithRateLimit("/api/settings/aha-fields", {
    maxRetries: 1,
  });
  if (!res.ok) {
    // Handle non-JSON error responses
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch AHA fields");
      } catch (e) {
        if (e instanceof Error && e.message.includes("Failed to fetch")) {
          throw e;
        }
        throw new Error("Failed to fetch AHA fields");
      }
    } else {
      const statusText = res.status === 504 
        ? "Request timed out"
        : res.status === 502
        ? "Bad gateway"
        : `Server error (${res.status})`;
      throw new Error(`${statusText}. Failed to fetch AHA fields`);
    }
  }
  return res.json();
}

/** POST: fetch custom field definitions from Aha and merge into config; returns updated fields list */
export async function refreshAhaFieldsFromAha() {
  const res = await fetch("/api/settings/aha-fields", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    // Handle non-JSON error responses (e.g., HTML error pages from Netlify timeouts)
    let errorData: any = {};
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        errorData = await res.json();
      } catch (e) {
        // If JSON parsing fails, use status-based error message
        errorData = {};
      }
    } else {
      // For HTML or other non-JSON responses
      const statusText = res.status === 504 
        ? "Request timed out. The refresh operation may have taken too long."
        : res.status === 502
        ? "Bad gateway. The server may be temporarily unavailable."
        : `Server error (${res.status})`;
      throw new Error(statusText);
    }
    throw new Error(errorData.error || "Failed to refresh field list from Aha");
  }
  return res.json();
}

const MAX_SYNC_ITERATIONS = 100; // Safety cap: 100 batches × 10 epics = 1000 epics max per run

export async function syncAhaFields() {
  let totalSynced = 0;
  let totalFailed = 0;
  let total = 0;
  const allErrors: Array<{ aha_id: string; name: string; error: string }> = [];
  let iteration = 0;
  let lastMessage = "";
  let cursor: string | null = null;

  while (iteration < MAX_SYNC_ITERATIONS) {
    const res: Response = await fetch("/api/settings/aha-fields/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cursor ? { cursor } : {}),
    });
    if (!res.ok) {
      let errorData: any = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          errorData = await res.json();
        } catch (e) {
          errorData = {};
        }
      } else {
        const statusText = res.status === 504
          ? "Request timed out. The sync operation may have taken too long."
          : res.status === 502
          ? "Bad gateway. The server may be temporarily unavailable."
          : `Server error (${res.status})`;
        throw new Error(statusText);
      }
      throw new Error(errorData.error || "Failed to synchronize fields");
    }

    const data = await res.json();
    totalSynced += data.synced ?? 0;
    totalFailed += data.failed ?? 0;
    total = data.total ?? total;
    if (Array.isArray(data.errors)) allErrors.push(...data.errors);
    lastMessage = data.message ?? "";

    const remaining = data.remaining ?? 0;
    const partial = data.partial === true;
    cursor = data.lastProcessedId ?? null;

    if (!partial || remaining <= 0) {
      return {
        success: true,
        message: iteration === 0 ? lastMessage : `Synchronized ${totalSynced} epic${totalSynced !== 1 ? "s" : ""}${totalFailed > 0 ? `, ${totalFailed} failed` : ""}.`,
        synced: totalSynced,
        failed: totalFailed,
        total,
        processed: totalSynced + totalFailed,
        remaining: 0,
        partial: false,
        errors: allErrors.length > 0 ? allErrors : undefined,
      };
    }

    iteration++;
    await new Promise((r) => setTimeout(r, 300));
  }

  return {
    success: true,
    message: `Synchronized ${totalSynced} epics (stopped after ${MAX_SYNC_ITERATIONS} batches). ${total - totalSynced - totalFailed} may still remain.`,
    synced: totalSynced,
    failed: totalFailed,
    total,
    processed: totalSynced + totalFailed,
    remaining: total - totalSynced - totalFailed,
    partial: true,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

export async function getEmailTemplates() {
  const res = await fetchWithRateLimit("/api/settings/email-templates", {
    maxRetries: 1,
  });
  if (!res.ok) throw new Error("Failed to fetch email templates");
  return res.json();
}

export async function patchEmailTemplates(payload: any) {
  debugLog({ location: 'settingsService.ts:patchEmailTemplates', message: 'patchEmailTemplates API call START', data: { payloadKeys: Object.keys(payload) }, hypothesisId: 'C' });
  const res = await fetchWithRateLimit("/api/settings/email-templates", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    maxRetries: 1,
  });
  debugLog({ location: 'settingsService.ts:patchEmailTemplates', message: 'patchEmailTemplates API response', data: { ok: res.ok, status: res.status, statusText: res.statusText }, hypothesisId: 'C' });
  if (!res.ok) {
    let errorMessage = "Failed to save email templates";
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorData.details || errorMessage;
      if (errorData.details && typeof errorData.details === 'object') {
        errorMessage += `: ${JSON.stringify(errorData.details)}`;
      } else if (errorData.details) {
        errorMessage += `: ${errorData.details}`;
      }
    } catch (e) {
      // If response is not JSON, use status text
      errorMessage = `Failed to save email templates: ${res.status} ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return res.json().catch(() => ({}));
}

export async function getPermissions() {
  const res = await fetchWithRateLimit("/api/settings/permissions", {
    maxRetries: 1,
  });
  if (!res.ok) throw new Error("Failed to fetch permissions");
  return res.json();
}

export async function patchPermissions(payload: { rules: Record<string, string[]> }) {
  const res = await fetch("/api/settings/permissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let errorMessage = "Failed to save permissions";
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = `Failed to save permissions: ${res.status} ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return res.json().catch(() => ({}));
}

export type ReleaseStagesScope = 'release_schedule' | 'ui_rollout';

export async function getReleaseStages(scope?: ReleaseStagesScope) {
  const url = scope ? `/api/release-stages?scope=${encodeURIComponent(scope)}` : "/api/release-stages";
  const res = await fetchWithRateLimit(url, {
    maxRetries: 1,
  });
  if (!res.ok) return { stages: [] };
  return res.json();
}

export async function addReleaseStage(payload: {
  name: string;
  sort_order: number;
  duration_days: number | null;
  details: string | null;
  scope?: ReleaseStagesScope;
  level_durations?: Record<string, { min_days: number; max_days: number }> | null;
  is_gate?: boolean;
}) {
  const res = await fetch("/api/release-stages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add stage");
  return res.json();
}

export async function updateReleaseStage(payload: {
  id: number;
  name?: string;
  sort_order?: number;
  duration_days?: number | null;
  details?: string | null;
  scope?: ReleaseStagesScope;
  level_durations?: Record<string, { min_days: number; max_days: number }> | null;
  is_gate?: boolean;
}) {
  const res = await fetch("/api/release-stages", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update stage");
  return res.json();
}


export async function deleteReleaseStage(id: number) {
  const res = await fetch(`/api/release-stages/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete stage");
  return res.json().catch(() => ({}));
}

export async function reorderReleaseStages(stages: any[]) {
  const res = await fetch("/api/release-stages", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stages }),
  });
  if (!res.ok) throw new Error("Failed to reorder stages");
  return res.json();
}

// ── Launch Criteria ──────────────────────────────────────────────────────────

export async function getLaunchCriteria() {
  const res = await fetchWithRateLimit("/api/launch-criteria", { maxRetries: 1 });
  if (!res.ok) return { criteria: [] };
  return res.json();
}

export async function addLaunchCriterion(payload: {
  label: string;
  description?: string;
  phase?: string;
  gate?: string;
  tier_applicability?: string[];
  sort_order?: number;
  default_owner_email?: string;
  default_due_offset_days?: number;
}) {
  const res = await fetch("/api/launch-criteria", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add launch criterion");
  return res.json();
}

export async function updateLaunchCriterion(id: string, payload: Record<string, any>) {
  const res = await fetch(`/api/launch-criteria/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update launch criterion");
  return res.json();
}

export async function deleteLaunchCriterion(id: string) {
  const res = await fetch(`/api/launch-criteria/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete launch criterion");
  return res.json().catch(() => ({}));
}

// ── Launch Schedule ──────────────────────────────────────────────────────────

export async function getLaunchSchedule(includeArchived: boolean = false) {
  const url = includeArchived ? "/api/launch-schedule?include_archived=true" : "/api/launch-schedule";
  const res = await fetchWithRateLimit(url, { maxRetries: 1 });
  if (!res.ok) return { schedules: [] };
  return res.json();
}

export async function addLaunchScheduleEntry(payload: { release_name: string; launch_date?: string }) {
  const res = await fetch("/api/launch-schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add launch schedule entry");
  return res.json();
}

export async function updateLaunchScheduleEntry(id: number, payload: Record<string, any>) {
  const res = await fetch(`/api/launch-schedule/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update launch schedule entry");
  return res.json();
}

export async function deleteLaunchScheduleEntry(id: number) {
  const res = await fetch(`/api/launch-schedule/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete launch schedule entry");
  return res.json().catch(() => ({}));
}
