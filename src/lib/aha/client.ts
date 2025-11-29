import type { AhaEpic, AhaWriteBackPayload } from './types';

const AHA_DOMAIN = process.env.AHA_DOMAIN;
const AHA_API_TOKEN = process.env.AHA_API_TOKEN;

if (!AHA_DOMAIN || !AHA_API_TOKEN) {
    throw new Error('AHA_DOMAIN and AHA_API_TOKEN must be set in environment variables');
}

const BASE_URL = `https://${AHA_DOMAIN}/api/v1`;

interface RetryOptions {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    retryOptions: RetryOptions = {}
): Promise<T> {
    const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000 } = retryOptions;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);

            if (response.ok) {
                return await response.json();
            }

            // Don't retry on client errors (4xx except 429)
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                const errorText = await response.text();
                throw new Error(`Aha API error ${response.status}: ${errorText}`);
            }

            // Retry on server errors (5xx) or rate limiting (429)
            if (attempt < maxRetries) {
                const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
                console.warn(`Aha API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
                await sleep(delay);
                continue;
            }

            const errorText = await response.text();
            throw new Error(`Aha API error ${response.status}: ${errorText}`);
        } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries && (error as any).code !== 'ENOTFOUND') {
                const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
                console.warn(`Aha API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, error);
                await sleep(delay);
                continue;
            }
            throw error;
        }
    }

    throw lastError || new Error('Aha API request failed');
}

export async function getEpic(epicId: string): Promise<AhaEpic> {
    // Request all necessary fields including custom_fields to ensure pod and other custom fields are loaded
    const fields = [
        'id',
        'reference_num',
        'name',
        'url',
        'workflow_status',
        'assigned_to_user',
        'tags',
        'custom_fields',
        'release'
    ].join(',');
    
    const url = `${BASE_URL}/epics/${epicId}?fields=${encodeURIComponent(fields)}`;
    const response = await fetchWithRetry<{ epic: AhaEpic }>(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
    return response.epic;
}

export async function updateEpicCustomFields(
    epicId: string,
    customFields: Record<string, any>
): Promise<void> {
    const url = `${BASE_URL}/epics/${epicId}`;
    const payload: AhaWriteBackPayload = {
        epic: {
            custom_fields: customFields,
        },
    };

    await fetchWithRetry(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
}

export async function getCustomFields(): Promise<any> {
    // This endpoint fetches custom field definitions for discovery
    const url = `${BASE_URL}/custom_field_definitions`;
    return await fetchWithRetry(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
}

export async function getProducts(): Promise<any> {
    // List all products (workspaces) accessible with this API token
    const url = `${BASE_URL}/products`;
    return await fetchWithRetry(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
}

export async function getEpics(params?: { per_page?: number; page?: number; product?: string }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.per_page) queryParams.set('per_page', params.per_page.toString());
    if (params?.page) queryParams.set('page', params.page.toString());
    
    // Request all necessary fields including custom_fields to ensure pod and other custom fields are loaded
    const fields = [
        'id',
        'reference_num',
        'name',
        'url',
        'workflow_status',
        'assigned_to_user',
        'tags',
        'custom_fields',
        'release'
    ].join(',');
    queryParams.set('fields', fields);

    // If product is specified, use product-specific endpoint
    let url;
    if (params?.product) {
        url = `${BASE_URL}/products/${params.product}/epics`;
    } else {
        url = `${BASE_URL}/epics`;
    }

    if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
    }

    return await fetchWithRetry(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
}

export async function testConnection(): Promise<any> {
    // Test connection by fetching account info
    const url = `${BASE_URL}/account`;
    return await fetchWithRetry(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
}

// Factory function for API endpoint usage
export function getAhaClient() {
    return {
        getEpic,
        getEpics,
        getProducts,
        updateEpicCustomFields,
        getCustomFields,
        testConnection,
    };
}
