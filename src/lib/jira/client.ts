import { getSettings, updateSettings } from '@/lib/settings-db';

const JIRA_API_VERSION = '3';

export interface JiraEpic {
    id: string;
    key: string;
    self: string;
    fields: {
        summary: string;
        description?: string;
        status?: {
            name: string;
            statusCategory?: {
                name: string;
            };
        };
        [key: string]: any;
    };
}

export interface JiraSearchResponse {
    expand?: string;
    startAt?: number;
    maxResults?: number;
    total?: number;
    nextPageToken?: string; // New pagination token for /search/jql endpoint
    issues: Array<{
        id: string;
        key: string;
        self: string;
        fields: {
            summary: string;
            description?: string;
            status?: {
                name: string;
                statusCategory?: {
                    name: string;
                };
            };
            [key: string]: any;
        };
    }>;
}

/**
 * Get Jira domain from settings
 */
async function getJiraDomain(): Promise<string> {
    const settings = await getSettings();
    const domain = settings.jira_domain?.trim();
    
    if (!domain) {
        throw new Error('Jira domain not configured. Please set it in Settings > Integrations > Jira');
    }
    
    // Remove protocol if present
    return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

/**
 * Fetch Cloud ID from Jira using the tenant_info endpoint
 * According to Atlassian docs: https://support.atlassian.com/jira/kb/retrieve-my-atlassian-sites-cloud-id/
 * This endpoint can be accessed without authentication, but Basic Auth also works
 * This is a one-time operation that stores the Cloud ID in settings
 */
async function fetchCloudId(): Promise<string> {
    const domain = await getJiraDomain();
    const email = await getJiraEmail();
    const apiToken = await getJiraApiToken();
    
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    const domainUrl = `https://${domain}`;
    
    // Try tenant_info endpoint first (works without auth, but we'll use Basic Auth for consistency)
    // According to Atlassian docs, this endpoint returns: {"cloudId":"your_cloud_id"}
    let response = await fetch(`${domainUrl}/_edge/tenant_info`, {
        method: 'GET',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
        },
    });
    
    // If that fails, try without auth (some instances allow unauthenticated access)
    if (!response.ok && response.status === 401) {
        console.log('⚠️ tenant_info requires auth, trying without...');
        response = await fetch(`${domainUrl}/_edge/tenant_info`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Failed to fetch Cloud ID from tenant_info: ${response.status}`, errorText);
        throw new Error(`Failed to fetch Cloud ID: ${response.status} ${errorText.substring(0, 200)}`);
    }
    
    const tenantInfo = await response.json();
    const cloudId = tenantInfo.cloudId;
    
    if (!cloudId) {
        console.error('Tenant info response:', JSON.stringify(tenantInfo, null, 2));
        throw new Error(`Cloud ID not found in tenant_info response. Response: ${JSON.stringify(tenantInfo)}`);
    }
    
    // Store Cloud ID in settings for future use
    await updateSettings({ jira_cloud_id: cloudId });
    
    console.log(`✅ Fetched and stored Jira Cloud ID: ${cloudId} for domain: ${domain}`);
    return cloudId;
}

/**
 * Get Jira base URL using domain (for Basic Auth)
 * Note: Cloud ID-based URLs (https://api.atlassian.com/ex/jira/{cloudId}) are only for OAuth Bearer tokens
 * Basic Auth with API tokens uses domain-based URLs (https://{domain}/rest/api/3/...)
 */
async function getJiraBaseUrl(): Promise<string> {
    const domain = await getJiraDomain();
    return `https://${domain}`;
}

/**
 * Get Jira API token from settings
 */
async function getJiraApiToken(): Promise<string> {
    const settings = await getSettings();
    const token = settings.jira_api_token?.trim();
    
    if (!token) {
        throw new Error('Jira API token not configured. Please set it in Settings > Integrations > Jira');
    }
    
    return token;
}

/**
 * Get Jira email from settings (for Basic Auth)
 * API tokens require email:token format for Basic Auth
 */
async function getJiraEmail(): Promise<string> {
    const settings = await getSettings();
    const email = settings.jira_email?.trim();
    
    if (!email) {
        throw new Error('Jira email not configured. Please set it in Settings > Integrations > Jira. API tokens require the associated email for Basic Auth.');
    }
    
    return email;
}

/**
 * Make authenticated request to Jira API
 */
async function jiraRequest<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const baseUrl = await getJiraBaseUrl();
    const apiToken = await getJiraApiToken();
    
    // For API tokens, we need email + token for Basic Auth (email:token format)
    const email = await getJiraEmail();
    
    // Validate credentials are not empty after trimming
    if (!email || !apiToken) {
        throw new Error('Jira credentials are empty. Please configure email and API token in Settings > Integrations > Jira');
    }
    
    const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
    
    const url = `${baseUrl}/rest/api/${JIRA_API_VERSION}${endpoint}`;
    
    console.log(`🔐 Making Jira API request to: ${url}`);
    console.log(`📧 Using email: ${email.substring(0, 3)}*** (hidden)`);
    console.log(`🔑 Token length: ${apiToken.length} characters`);
    console.log(`🌐 Using domain-based URL (Basic Auth)`);
    
    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Jira API error ${response.status}:`, errorText);
        
        if (response.status === 401) {
            throw new Error(`Jira authentication failed (401). Please verify your email and API token are correct in Settings > Integrations > Jira. Error: ${errorText.substring(0, 200)}`);
        }
        
        throw new Error(`Jira API error ${response.status}: ${errorText}`);
    }
    
    return response.json();
}

/**
 * Search for Jira epics by name
 * Tries multiple search strategies:
 * 1. Exact match (case-sensitive)
 * 2. Exact match with trimmed whitespace
 * 3. Case-insensitive contains match
 */
export async function searchJiraEpicsByName(epicName: string): Promise<JiraEpic[]> {
    if (!epicName || !epicName.trim()) {
        return [];
    }

    // Normalize the epic name - trim whitespace
    const trimmedName = epicName.trim();
    const escapedName = trimmedName.replace(/"/g, '\\"');
    
    console.log(`🔍 Searching Jira for epic: "${epicName}" (trimmed: "${trimmedName}")`);
    
    // Strategy 1: Try exact match first (case-sensitive)
    try {
        const exactJql = `issueType = Epic AND summary = "${escapedName}"`;
        console.log(`📝 [Strategy 1] Exact match JQL: ${exactJql}`);
        
        // Use new /search/jql endpoint (replaces deprecated /search endpoint)
        const exactResponse = await jiraRequest<JiraSearchResponse>(
            `/search/jql?jql=${encodeURIComponent(exactJql)}&fields=summary,description,status`
        );
        
        if (exactResponse.issues && exactResponse.issues.length > 0) {
            console.log(`✅ Found ${exactResponse.issues.length} matching Jira epic(s) via exact match`);
            return exactResponse.issues.map(issue => ({
                id: issue.id,
                key: issue.key,
                self: issue.self,
                fields: issue.fields,
            }));
        }
    } catch (error) {
        console.log(`⚠️ Exact match search failed, trying alternatives...`, error);
    }

    // Strategy 2: Try case-insensitive contains match
    // Jira's ~ operator does case-insensitive contains
    try {
        const containsJql = `issueType = Epic AND summary ~ "${escapedName}"`;
        console.log(`📝 [Strategy 2] Contains match JQL: ${containsJql}`);
        
        // Use new /search/jql endpoint (replaces deprecated /search endpoint)
        const containsResponse = await jiraRequest<JiraSearchResponse>(
            `/search/jql?jql=${encodeURIComponent(containsJql)}&fields=summary,description,status`
        );
        
        if (containsResponse.issues && containsResponse.issues.length > 0) {
            // Filter to find exact matches (case-insensitive)
            const exactMatches = containsResponse.issues.filter(issue => 
                issue.fields.summary?.trim().toLowerCase() === trimmedName.toLowerCase()
            );
            
            if (exactMatches.length > 0) {
                console.log(`✅ Found ${exactMatches.length} exact match(es) via contains search`);
                return exactMatches.map(issue => ({
                    id: issue.id,
                    key: issue.key,
                    self: issue.self,
                    fields: issue.fields,
                }));
            }
            
            // If no exact match, return all matches (user can see what was found)
            console.log(`⚠️ Found ${containsResponse.issues.length} partial match(es), but no exact match`);
            console.log(`   Matches found:`, containsResponse.issues.map(i => `"${i.fields.summary}" (${i.key})`));
            
            // Return the first match anyway (might be what user wants)
            return containsResponse.issues.slice(0, 1).map(issue => ({
                id: issue.id,
                key: issue.key,
                self: issue.self,
                fields: issue.fields,
            }));
        }
    } catch (error) {
        console.error('Error in contains match search:', error);
    }

    console.log(`❌ No Jira epic found matching name: "${epicName}"`);
    return [];
}

/**
 * Get a specific Jira epic by key
 */
export async function getJiraEpic(epicKey: string): Promise<JiraEpic> {
    try {
        const response = await jiraRequest<JiraEpic>(
            `/issue/${epicKey}?fields=summary,description,status`
        );
        return response;
    } catch (error) {
        console.error(`Error fetching Jira epic ${epicKey}:`, error);
        throw error;
    }
}

/**
 * Test Jira connection
 */
export async function testJiraConnection(): Promise<{ success: boolean; message: string; user?: any }> {
    try {
        const response = await jiraRequest<any>('/myself');
        return {
            success: true,
            message: 'Successfully connected to Jira',
            user: response,
        };
    } catch (error: any) {
        return {
            success: false,
            message: error.message || 'Failed to connect to Jira',
        };
    }
}

/**
 * Search for Jira issues using a JQL query
 * Returns issues matching the JQL query
 */
export async function searchJiraIssues(jql: string, fields: string[] = ['summary', 'status', 'key']): Promise<JiraSearchResponse['issues']> {
    if (!jql || !jql.trim()) {
        return [];
    }

    try {
        const fieldsParam = fields.join(',');
        const response = await jiraRequest<JiraSearchResponse>(
            `/search/jql?jql=${encodeURIComponent(jql)}&fields=${encodeURIComponent(fieldsParam)}`
        );
        
        return response.issues || [];
    } catch (error) {
        console.error(`Error searching Jira issues with JQL "${jql}":`, error);
        throw error;
    }
}

/**
 * Match AHA epics with Jira epics by name
 */
export async function matchAhaEpicsWithJira(ahaEpicNames: string[]): Promise<Record<string, JiraEpic[]>> {
    const matches: Record<string, JiraEpic[]> = {};
    
    for (const epicName of ahaEpicNames) {
        try {
            const jiraEpics = await searchJiraEpicsByName(epicName);
            if (jiraEpics.length > 0) {
                matches[epicName] = jiraEpics;
            }
        } catch (error) {
            console.error(`Error matching epic "${epicName}":`, error);
            // Continue with other epics even if one fails
        }
    }
    
    return matches;
}
