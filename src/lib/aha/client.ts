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

/** Error subclass for non-retryable Aha API responses (4xx except 429). */
class AhaApiError extends Error {
    status: number;
    nonRetryable = true;
    constructor(status: number, body: string) {
        super(`Aha API error ${status}: ${body}`);
        this.status = status;
        this.name = 'AhaApiError';
    }
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

            // Don't retry on client errors (4xx except 429) — these are permanent failures
            if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                const errorText = await response.text();
                throw new AhaApiError(response.status, errorText);
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
            // Never retry non-retryable API errors (4xx except 429) or DNS failures
            const isNonRetryable = (error as any).nonRetryable || (error as any).code === 'ENOTFOUND';
            if (isNonRetryable || attempt >= maxRetries) {
                throw error;
            }
            const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
            console.warn(`Aha API request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`, error);
            await sleep(delay);
        }
    }

    throw lastError || new Error('Aha API request failed');
}

export async function getEpicIntegrations(epicId: string): Promise<any> {
    // Fetch integrations separately via the integrations endpoint
    try {
        const url = `${BASE_URL}/epics/${epicId}/integrations`;
        const response = await fetchWithRetry<any>(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${AHA_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        
        console.log('\n' + '🔗'.repeat(40));
        console.log('🔗🔗🔗 FETCHED INTEGRATIONS SEPARATELY 🔗🔗🔗');
        console.log('🔗'.repeat(40));
        console.log(`📋 Epic ID: ${epicId}`);
        console.log(`📦 Integrations response type:`, typeof response);
        console.log(`📦 Integrations response:`, JSON.stringify(response, null, 2));
        console.log('🔗'.repeat(40) + '\n');
        
        return response;
    } catch (error: any) {
        // If endpoint doesn't exist or returns 404, that's okay - integrations might not be available
        if (error?.status === 404 || error.message?.includes('404') || error.message?.includes('Not Found')) {
            console.log(`Integrations endpoint not found for ${epicId} — skipping`);
        } else {
            console.log(`⚠️ Could not fetch integrations separately for ${epicId}:`, error.message);
        }
        return null;
    }
}

export async function getEpicIntegrationFields(epicId: string, integrationId?: string): Promise<any> {
    // Try to get integration fields - this might require knowing the integration ID first
    try {
        // First, get list of integrations
        const integrations = await getEpicIntegrations(epicId);
        if (!integrations) return null;
        
        // If integrations is an array, try to get fields for each
        if (Array.isArray(integrations) && integrations.length > 0) {
            const allFields: any[] = [];
            for (const integration of integrations) {
                const integrationIdToUse = integrationId || integration?.id || integration?.integration_id;
                if (integrationIdToUse) {
                    try {
                        const url = `${BASE_URL}/epics/${epicId}/integrations/${integrationIdToUse}/fields`;
                        const fieldsResponse = await fetchWithRetry<any>(url, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${AHA_API_TOKEN}`,
                                'Content-Type': 'application/json',
                            },
                        });
                        allFields.push({ integration, fields: fieldsResponse });
                    } catch (fieldError: any) {
                        console.log(`⚠️ Could not fetch fields for integration ${integrationIdToUse}:`, fieldError.message);
                    }
                }
            }
            return allFields.length > 0 ? allFields : integrations;
        }
        
        return integrations;
    } catch (error: any) {
        console.log(`⚠️ Could not fetch integration fields for ${epicId}:`, error.message);
        return null;
    }
}

export async function getEpic(epicId: string): Promise<AhaEpic> {
    // Request all necessary fields including custom_fields to ensure pod and other custom fields are loaded
    const fields = [
        'id',
        'reference_num',
        'name',
        'url',
        'description',
        'integrations',
        'workflow_status',
        'assigned_to_user',
        'tags',
        'custom_fields',
        'release'
    ].join(',');
    
    const url = `${BASE_URL}/epics/${epicId}?fields=${encodeURIComponent(fields)}`;
    const response = await fetchWithRetry<any>(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${AHA_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
    });
    
    // Try to fetch integrations separately if not in main response
    const epicData = response.epic || response;
    if (epicData && (!epicData.integrations || epicData.integrations === null || epicData.integrations === undefined)) {
        console.log('🔍 Integrations field is null/undefined, trying separate endpoint...');
        const integrationsData = await getEpicIntegrations(epicId);
        if (integrationsData) {
            // Attach integrations to epic data
            epicData.integrations = integrationsData;
            console.log('✅ Successfully fetched integrations via separate endpoint');
        } else {
            console.log('⚠️ No integrations found via separate endpoint either');
        }
    } else if (epicData?.integrations) {
        console.log('✅ Integrations found in main response');
    }
    
    // Log RAW response structure first
    console.log('\n' + '🔍'.repeat(40));
    console.log('🔍🔍🔍 RAW AHA API RESPONSE STRUCTURE 🔍🔍🔍');
    console.log('🔍'.repeat(40));
    console.log('📋 Response keys:', Object.keys(response));
    console.log('📦 Full response (first 1000 chars):', JSON.stringify(response).substring(0, 1000));
    console.log('🔍'.repeat(40) + '\n');
    
    // Log integrations field for debugging - MAKE IT OBVIOUS!
    if (epicData) {
        const hasIntegrations = 'integrations' in epicData;
        const integrationsValue = epicData.integrations;
        const integrationsType = typeof integrationsValue;
        const integrationsStringified = integrationsValue ? JSON.stringify(integrationsValue).substring(0, 500) : 'null/undefined';
        
        console.log('\n' + '='.repeat(80));
        console.log('🔗🔗🔗 INTEGRATIONS FIELD DEBUG 🔗🔗🔗');
        console.log('='.repeat(80));
        console.log(`📋 Epic ID: ${epicData.reference_num || epicData.id}`);
        console.log(`✅ Has integrations field: ${hasIntegrations ? 'YES ✅' : 'NO ❌'}`);
        console.log(`📦 Integrations value:`, integrationsValue);
        console.log(`🔤 Type: ${integrationsType}`);
        console.log(`📝 Stringified (first 500 chars):`, integrationsStringified);
        if (integrationsValue) {
            console.log(`🎯 Full integrations object:`, JSON.stringify(integrationsValue, null, 2));
        }
        
        // Check for integration fields in the response
        console.log('\n🔍 Checking for integration-related fields in response...');
        const allKeys = Object.keys(epicData);
        const integrationRelatedKeys = allKeys.filter(k => 
            k.toLowerCase().includes('integration') || 
            k.toLowerCase().includes('jira') ||
            k.toLowerCase().includes('external') ||
            k.toLowerCase().includes('link')
        );
        console.log(`🔑 Integration-related keys found:`, integrationRelatedKeys);
        if (integrationRelatedKeys.length > 0) {
            integrationRelatedKeys.forEach(key => {
                console.log(`  📦 ${key}:`, epicData[key]);
                if (epicData[key]) {
                    console.log(`     Type: ${typeof epicData[key]}, IsArray: ${Array.isArray(epicData[key])}`);
                    console.log(`     Stringified:`, JSON.stringify(epicData[key]).substring(0, 500));
                }
            });
        }
        
        // Check custom_fields for integration data
        if (epicData.custom_fields) {
            console.log('\n🔍 Checking custom_fields for integration data...');
            const customFieldsArray = Array.isArray(epicData.custom_fields) 
                ? epicData.custom_fields 
                : Object.values(epicData.custom_fields);
            const integrationCustomFields = customFieldsArray.filter((cf: any) => 
                cf?.key?.toLowerCase().includes('integration') ||
                cf?.key?.toLowerCase().includes('jira') ||
                cf?.name?.toLowerCase().includes('integration') ||
                cf?.name?.toLowerCase().includes('jira') ||
                cf?.key?.toLowerCase().includes('link')
            );
            if (integrationCustomFields.length > 0) {
                console.log(`✅ Found ${integrationCustomFields.length} integration-related custom fields:`);
                integrationCustomFields.forEach((cf: any) => {
                    console.log(`  📦 ${cf.name || cf.key}:`, cf.value);
                    console.log(`     Value type: ${typeof cf.value}, IsArray: ${Array.isArray(cf.value)}`);
                    if (cf.value) {
                        console.log(`     Value stringified:`, JSON.stringify(cf.value).substring(0, 500));
                    }
                });
            } else {
                console.log(`❌ No integration-related custom fields found`);
            }
            
            // Also log ALL custom fields to see what we have
            console.log('\n🔍 ALL custom_fields (for debugging):');
            customFieldsArray.forEach((cf: any, idx: number) => {
                console.log(`  [${idx}] Key: ${cf?.key || 'N/A'}, Name: ${cf?.name || 'N/A'}, Value:`, cf?.value);
            });
        }
        
        // Deep dive into integrations field structure
        if (integrationsValue !== null && integrationsValue !== undefined) {
            console.log('\n🔍 DEEP DIVE INTO INTEGRATIONS FIELD STRUCTURE:');
            console.log(`  Type: ${integrationsType}`);
            console.log(`  Is Array: ${Array.isArray(integrationsValue)}`);
            console.log(`  Is Object: ${integrationsValue !== null && typeof integrationsValue === 'object' && !Array.isArray(integrationsValue)}`);
            if (Array.isArray(integrationsValue)) {
                console.log(`  Array length: ${integrationsValue.length}`);
                integrationsValue.forEach((item: any, idx: number) => {
                    console.log(`  [${idx}]:`, item);
                    console.log(`      Type: ${typeof item}`);
                    if (typeof item === 'object' && item !== null) {
                        console.log(`      Keys:`, Object.keys(item));
                        Object.keys(item).forEach(key => {
                            console.log(`        ${key}:`, item[key], `(type: ${typeof item[key]})`);
                        });
                    }
                });
            } else if (typeof integrationsValue === 'object' && integrationsValue !== null) {
                console.log(`  Object keys:`, Object.keys(integrationsValue));
                Object.keys(integrationsValue).forEach(key => {
                    console.log(`    ${key}:`, integrationsValue[key], `(type: ${typeof integrationsValue[key]})`);
                });
            }
        }
        
        console.log('='.repeat(80) + '\n');
    }
    
    // Handle different response structures
    if (response.epic) {
        return response.epic;
    } else if (response.id || response.reference_num) {
        // Response is the epic object directly
        return response;
    } else {
        throw new Error(`Unexpected Aha API response structure for epic ${epicId}`);
    }
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
        'description',
        'integrations',
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

export async function getReleases(params?: { per_page?: number; page?: number; product?: string }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.per_page) queryParams.set('per_page', params.per_page.toString());
    if (params?.page) queryParams.set('page', params.page.toString());
    
    // Request fields including custom_fields and standard date fields to get external release dates
    const fields = ['id', 'reference_num', 'name', 'start_date', 'end_date', 'releases_date_external', 'release_date_external', 'releases_date_internal', 'release_date_internal', 'custom_fields', 'cohort2_date', 'release_phases'].join(',');
    queryParams.set('fields', fields);
    
    let url = `${BASE_URL}/releases`;
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

export async function getReleaseEpics(releaseId: string, params?: { per_page?: number; page?: number }): Promise<any> {
    const queryParams = new URLSearchParams();
    if (params?.per_page) queryParams.set('per_page', params.per_page.toString());
    if (params?.page) queryParams.set('page', params.page.toString());
    
    // Request all necessary fields including custom_fields and integrations to ensure all fields are loaded
    const fields = [
        'id',
        'reference_num',
        'name',
        'url',
        'description',
        'integrations',
        'workflow_status',
        'assigned_to_user',
        'tags',
        'custom_fields',
        'release'
    ].join(',');
    queryParams.set('fields', fields);
    
    let url = `${BASE_URL}/releases/${releaseId}/epics`;
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
    // Test connection by fetching current user info
    const url = `${BASE_URL}/me`;
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
        getReleases,
        getReleaseEpics,
        updateEpicCustomFields,
        getCustomFields,
        getEpicIntegrations,
        testConnection,
    };
}
