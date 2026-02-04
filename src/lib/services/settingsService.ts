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
  if (!res.ok) throw new Error("Failed to fetch AHA fields");
  return res.json();
}

/** POST: fetch custom field definitions from Aha and merge into config; returns updated fields list */
export async function refreshAhaFieldsFromAha() {
  const res = await fetch("/api/settings/aha-fields", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to refresh field list from Aha");
  }
  return res.json();
}

export async function syncAhaFields() {
  const res = await fetch("/api/settings/aha-fields/sync", { method: "POST" });
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || "Failed to synchronize fields");
  }
  return res.json();
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

export async function getLaunchStages() {
  const res = await fetchWithRateLimit("/api/launch-stages", {
    maxRetries: 1,
  });
  if (!res.ok) throw new Error("Failed to fetch launch stages");
  return res.json();
}

export async function addLaunchStage(payload: { name: string; sort_order: number; duration_days: number | null; details: string | null }) {
  const res = await fetch("/api/launch-stages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add stage");
  return res.json();
}

export async function updateLaunchStage(payload: { id: number; name?: string; sort_order?: number; duration_days?: number | null; details?: string | null }) {
  const res = await fetch("/api/launch-stages", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update stage");
  return res.json();
}


export async function deleteLaunchStage(id: number) {
  const res = await fetch(`/api/launch-stages/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete stage");
  return res.json().catch(() => ({}));
}

export async function reorderLaunchStages(stages: any[]) {
  const res = await fetch("/api/launch-stages", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stages }),
  });
  if (!res.ok) throw new Error("Failed to reorder stages");
  return res.json();
}
