import { getSettings, updateSettings } from '@/lib/settings-db';
import { callRovoTool } from './mcp-client';

async function getJiraDomain(): Promise<string | null> {
    try {
        const settings = await getSettings();
        return settings.jira_domain?.trim() || null;
    } catch {
        return null;
    }
}

const ROVO_MCP_SERVER_URL = 'https://mcp.atlassian.com/v1/mcp';

export interface RovoSearchOptions {
    query: string;
    contentType?: 'jira' | 'confluence' | 'both';
    limit?: number;
}

export interface RovoSearchResult {
    id: string;
    title: string;
    url: string;
    type: 'jira' | 'confluence';
    summary?: string;
}

export interface RovoSummarizeOptions {
    contentId: string;
    contentType: 'jira' | 'confluence';
}

export interface RovoSummarizeResult {
    summary: string;
    contentId: string;
    contentType: 'jira' | 'confluence';
}

/**
 * Get ROVO access token from settings
 */
async function getRovoAccessToken(): Promise<string> {
    const settings = await getSettings();
    const token = settings.rovo_access_token?.trim();
    
    if (!token) {
        throw new Error('ROVO access token not configured. Please connect ROVO in Settings > Integrations > ROVO');
    }
    
    return token;
}

/**
 * Check if ROVO token is expired
 */
async function isTokenExpired(): Promise<boolean> {
    const settings = await getSettings();
    const expiresAt = settings.rovo_token_expires_at;
    
    if (!expiresAt) {
        return true; // No expiration date means token is invalid
    }
    
    const expirationDate = new Date(expiresAt);
    const now = new Date();
    
    // Consider token expired if it expires within 5 minutes
    return expirationDate.getTime() - now.getTime() < 5 * 60 * 1000;
}

/**
 * Refresh ROVO access token using refresh token
 */
async function refreshAccessToken(): Promise<void> {
    const settings = await getSettings();
    const refreshToken = settings.rovo_refresh_token?.trim();
    
    if (!refreshToken) {
        throw new Error('ROVO refresh token not available. Please reconnect ROVO in Settings > Integrations > ROVO');
    }
    
    // Note: ROVO MCP Server token refresh endpoint would be called here
    // For now, we'll throw an error and require re-authentication
    // This will be implemented once we have the exact refresh endpoint
    throw new Error('Token refresh not yet implemented. Please reconnect ROVO.');
}

/**
 * Get valid access token, refreshing if necessary
 */
async function getValidAccessToken(): Promise<string> {
    if (await isTokenExpired()) {
        try {
            await refreshAccessToken();
        } catch (error) {
            // If refresh fails, user needs to reconnect
            throw new Error('ROVO token expired. Please reconnect ROVO in Settings > Integrations > ROVO');
        }
    }
    
    return await getRovoAccessToken();
}

// Note: The old rovoRequest function has been replaced with MCP SDK client calls
// All requests now go through the MCP protocol using callRovoTool()

/**
 * Search Jira issues and/or Confluence pages using ROVO
 */
export async function searchRovo(options: RovoSearchOptions): Promise<RovoSearchResult[]> {
    const { query, contentType = 'both', limit = 10 } = options;
    
    if (!query || !query.trim()) {
        return [];
    }
    
    try {
        // Get Jira domain for context
        const jiraDomain = await getJiraDomain().catch(() => null);
        
        // Get redirect URL for OAuth provider
        const settings = await getSettings();
        const redirectUrl = process.env.NEXT_PUBLIC_APP_URL 
            ? `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/rovo/oauth`
            : '/api/integrations/rovo/oauth';
        
        // Use MCP SDK client to call the search tool
        const result = await callRovoTool(
            'search', // Tool name - may need to be adjusted based on ROVO's actual tool names
            {
                query: query.trim(),
                contentType,
                limit,
                site: jiraDomain || undefined,
            },
            redirectUrl
        );
        
        // Parse MCP tool result
        if (result.content && Array.isArray(result.content)) {
            return result.content.map((item: any) => {
                // Handle different content types from MCP
                const textContent = typeof item === 'string' ? item : item.text || item.content;
                const jsonContent = textContent ? JSON.parse(textContent) : item;
                
                return {
                    id: jsonContent.id || jsonContent.key || '',
                    title: jsonContent.title || jsonContent.summary || '',
                    url: jsonContent.url || jsonContent.self || '',
                    type: jsonContent.type || (jsonContent.key ? 'jira' : 'confluence'),
                    summary: jsonContent.summary || jsonContent.excerpt,
                };
            });
        }
        
        return [];
    } catch (error: any) {
        console.error('Error searching ROVO:', error);
        
        // If it's an authentication error, provide helpful message
        if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
            throw new Error('ROVO authentication required. Please reconnect ROVO in Settings > Integrations > ROVO');
        }
        
        throw error;
    }
}

/**
 * Summarize a Jira issue or Confluence page using ROVO
 */
export async function summarizeRovo(options: RovoSummarizeOptions): Promise<RovoSummarizeResult> {
    const { contentId, contentType } = options;
    
    if (!contentId) {
        throw new Error('Content ID is required for summarization');
    }
    
    try {
        // Get Jira domain for context
        const jiraDomain = await getJiraDomain().catch(() => null);
        
        // Get redirect URL for OAuth provider
        const redirectUrl = process.env.NEXT_PUBLIC_APP_URL 
            ? `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/rovo/oauth`
            : '/api/integrations/rovo/oauth';
        
        // Use MCP SDK client to call the summarize tool
        const result = await callRovoTool(
            'summarize', // Tool name - may need to be adjusted based on ROVO's actual tool names
            {
                contentId,
                contentType,
                site: jiraDomain || undefined,
            },
            redirectUrl
        );
        
        // Parse MCP tool result
        if (result.content && result.content.length > 0) {
            const firstContent = result.content[0];
            const summaryText = typeof firstContent === 'string' 
                ? firstContent 
                : firstContent.text || firstContent.content || JSON.stringify(firstContent);
            
            return {
                summary: summaryText,
                contentId,
                contentType,
            };
        }
        
        throw new Error('Invalid response format from ROVO summarize');
    } catch (error: any) {
        console.error('Error summarizing ROVO:', error);
        
        // If it's an authentication error, provide helpful message
        if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
            throw new Error('ROVO authentication required. Please reconnect ROVO in Settings > Integrations > ROVO');
        }
        
        throw error;
    }
}

/**
 * Test ROVO connection using MCP SDK client
 */
export async function testRovoConnection(): Promise<{ success: boolean; message: string }> {
    try {
        const redirectUrl = process.env.NEXT_PUBLIC_APP_URL 
            ? `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/rovo/oauth`
            : '/api/integrations/rovo/oauth';
        
        // Create client and try to list tools
        const { createRovoMCPClient } = await import('./mcp-client');
        const client = await createRovoMCPClient(redirectUrl);
        
        try {
            const tools = await client.listTools();
            await client.close();
            
            return {
                success: true,
                message: `Successfully connected to ROVO MCP Server. Found ${tools.tools.length} available tools.`,
            };
        } catch (error: any) {
            await client.close().catch(() => {});
            throw error;
        }
    } catch (error: any) {
        console.error('ROVO connection test error:', error);
        
        // Provide more specific error messages
        if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
            return {
                success: false,
                message: 'ROVO authentication failed. Token is invalid or expired. Please reconnect ROVO.',
            };
        }
        
        return {
            success: false,
            message: error.message || 'Failed to connect to ROVO MCP Server',
        };
    }
}

/**
 * Store ROVO tokens in settings
 */
export async function storeRovoTokens(
    accessToken: string,
    refreshToken: string | null,
    expiresIn: number
): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);
    
    await updateSettings({
        rovo_access_token: accessToken,
        rovo_refresh_token: refreshToken,
        rovo_token_expires_at: expiresAt.toISOString(),
    });
}

/**
 * Clear ROVO tokens from settings
 */
export async function clearRovoTokens(): Promise<void> {
    await updateSettings({
        rovo_access_token: null,
        rovo_refresh_token: null,
        rovo_token_expires_at: null,
    });
}
