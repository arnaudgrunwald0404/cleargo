import type { AhaPivotListResponse } from "./pivotNormalizer";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch one page of the custom pivot report without importing `client.ts` (avoids module-load env throw). */
export async function fetchAhaPivotPage(url: string): Promise<AhaPivotListResponse> {
  const domain = process.env.AHA_DOMAIN;
  const token = process.env.AHA_API_TOKEN;
  if (!domain || !token) {
    throw new Error("AHA_DOMAIN and AHA_API_TOKEN must be set for roadmap snapshot ingestion");
  }

  const maxRetries = 3;
  const initialDelay = 1000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });

      if (response.ok) {
        return (await response.json()) as AhaPivotListResponse;
      }

      const errorText = await response.text();
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(`Aha pivot non-retryable ${response.status}: ${errorText}`);
      }

      if (attempt < maxRetries) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), 10000);
        await sleep(delay);
        continue;
      }
      throw new Error(`Aha pivot error ${response.status}: ${errorText}`);
    } catch (err) {
      lastError = err as Error;
      if (attempt >= maxRetries) break;
      await sleep(Math.min(initialDelay * Math.pow(2, attempt), 10000));
    }
  }

  throw lastError || new Error("Aha pivot fetch failed");
}

/**
 * Next page URL from current URL + response pagination (same logic as n8n "Get Next Page").
 */
export function nextPivotPageUrl(currentRequestUrl: string, page: AhaPivotListResponse): string | null {
  const pagination = Array.isArray(page.pagination) ? page.pagination[0] : page.pagination;
  if (!pagination || pagination.total_pages <= 0) return null;
  if (pagination.current_page >= pagination.total_pages) return null;

  const nextPage = pagination.current_page + 1;
  if (currentRequestUrl.includes("page=")) {
    return currentRequestUrl.replace(/page=\d+/, `page=${nextPage}`);
  }
  const sep = currentRequestUrl.includes("?") ? "&" : "?";
  return `${currentRequestUrl}${sep}page=${nextPage}`;
}
