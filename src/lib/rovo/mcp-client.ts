/**
 * ROVO MCP Client using @modelcontextprotocol/sdk
 * This provides proper MCP protocol support for ROVO MCP Server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthTokens, OAuthClientMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getSettings, updateSettings } from '@/lib/settings-db';

const ROVO_MCP_SERVER_URL = 'https://mcp.atlassian.com/v1/mcp';

/**
 * OAuth provider for ROVO MCP Server
 * Implements OAuthClientProvider to handle authentication
 */
class RovoOAuthProvider implements OAuthClientProvider {
    private _redirectUrl: string | URL;
    private sessionId: string;

    constructor(redirectUrl: string | URL, sessionId: string) {
        this._redirectUrl = redirectUrl;
        this.sessionId = sessionId;
    }

    get redirectUrl(): string | URL {
        return this._redirectUrl;
    }

    get clientMetadata(): OAuthClientMetadata {
        return {
            client_name: 'ClearGO ROVO Integration',
            redirect_uris: [typeof this._redirectUrl === 'string' ? this._redirectUrl : this._redirectUrl.toString()],
            // ROVO uses dynamic client registration, so we don't need client_id/client_secret
        };
    }

    state(): string {
        return Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64');
    }

    async clientInformation() {
        // ROVO uses dynamic client registration
        // Return undefined to trigger registration
        return undefined;
    }

    async saveClientInformation(clientInformation: any): Promise<void> {
        // Store client information if needed
        // For dynamic registration, this might not be necessary
        console.log('ROVO client information received:', clientInformation);
    }

    async tokens(): Promise<OAuthTokens | undefined> {
        const settings = await getSettings();
        const accessToken = settings.rovo_access_token?.trim();
        const refreshToken = settings.rovo_refresh_token?.trim();
        const expiresAt = settings.rovo_token_expires_at;

        if (!accessToken) {
            return undefined;
        }

        // Check if token is expired
        if (expiresAt) {
            const expirationDate = new Date(expiresAt);
            const now = new Date();
            if (expirationDate.getTime() - now.getTime() < 5 * 60 * 1000) {
                // Token expires within 5 minutes, try to refresh
                if (refreshToken) {
                    // TODO: Implement token refresh
                    return undefined; // Force re-auth for now
                }
                return undefined;
            }
        }

        return {
            access_token: accessToken,
            refresh_token: refreshToken || undefined,
            token_type: 'Bearer',
            expires_in: expiresAt ? Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000) : undefined,
        };
    }

    async saveTokens(tokens: OAuthTokens): Promise<void> {
        const expiresIn = tokens.expires_in || 3600;
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + expiresIn);

        await updateSettings({
            rovo_access_token: tokens.access_token,
            rovo_refresh_token: tokens.refresh_token || null,
            rovo_token_expires_at: expiresAt.toISOString(),
        });
    }

    async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
        // For web apps, we can't redirect directly from server-side code
        // Instead, we'll throw a special error that the OAuth route can catch
        // and handle the redirect
        const error: any = new Error('ROVO_OAuth_Redirect_Required');
        error.authorizationUrl = authorizationUrl.toString();
        throw error;
    }

    async saveCodeVerifier(codeVerifier: string): Promise<void> {
        // Store code verifier in settings temporarily
        // This is a workaround - ideally this would be in a session
        await updateSettings({
            // Store in a temporary field if needed
            // For now, we'll rely on the OAuth route to handle PKCE
        });
    }

    async codeVerifier(): Promise<string> {
        // Retrieve code verifier
        // This should match what was stored in saveCodeVerifier
        // For now, we'll rely on the OAuth route to handle PKCE
        throw new Error('PKCE code verifier handling should be done in OAuth route');
    }
}

/**
 * Create and connect an MCP client to ROVO MCP Server
 */
async function createRovoMCPClient(redirectUrl: string): Promise<Client> {
    const sessionId = `rovo-${Date.now()}`;
    const authProvider = new RovoOAuthProvider(redirectUrl, sessionId);
    
    const client = new Client(
        {
            name: 'cleargo-rovo-client',
            version: '1.0.0',
        },
        {
            capabilities: {},
        }
    );

    // Use Streamable HTTP transport instead of SSE for serverless compatibility
    // SSE requires persistent connections and session state, which don't work in serverless environments
    const transport = new StreamableHTTPClientTransport(
        new URL(ROVO_MCP_SERVER_URL),
        {
            authProvider,
        }
    );

    try {
        // Connect the client to the transport
        // This may trigger OAuth flow if tokens are missing/invalid
        // Note: In serverless environments, SSE connections may not work properly
        // StreamableHTTPClientTransport uses SSE internally but handles it better than SSEClientTransport
        await client.connect(transport);
    } catch (error: any) {
        // If OAuth redirect is required, re-throw with the authorization URL
        if (error.message === 'ROVO_OAuth_Redirect_Required' && error.authorizationUrl) {
            throw error;
        }
        
        // Log the error for debugging
        console.error('Error connecting ROVO MCP client:', error);
        
        // Check if it's a serverless compatibility issue
        if (error.message?.includes('EventSource') || error.message?.includes('SSE') || error.message?.includes('stream')) {
            throw new Error(
                'ROVO MCP connection failed. The MCP SDK transport may not be fully compatible with serverless environments. ' +
                'Error: ' + (error.message || 'Unknown error')
            );
        }
        
        // Otherwise, close the client and re-throw
        try {
            await client.close();
        } catch (closeError) {
            // Ignore close errors
        }
        throw error;
    }

    return client;
}

/**
 * Execute an MCP tool call using the ROVO MCP client
 * Note: In serverless environments, connections are short-lived
 */
async function callRovoTool(
    toolName: string,
    args: Record<string, any>,
    redirectUrl: string
): Promise<any> {
    let client: Client | null = null;
    
    try {
        client = await createRovoMCPClient(redirectUrl);
        
        // List available tools first to verify connection
        const tools = await client.listTools();
        console.log('Available ROVO tools:', tools.tools.map(t => t.name));

        // Find the tool we want to call
        const tool = tools.tools.find(t => t.name === toolName);
        if (!tool) {
            throw new Error(`Tool "${toolName}" not found. Available tools: ${tools.tools.map(t => t.name).join(', ')}`);
        }

        // Call the tool
        const result = await client.callTool({
            name: toolName,
            arguments: args,
        });

        return result;
    } catch (error: any) {
        console.error(`Error calling ROVO tool ${toolName}:`, error);
        
        // If it's an OAuth redirect error, re-throw it
        if (error.message === 'ROVO_OAuth_Redirect_Required' && error.authorizationUrl) {
            throw error;
        }
        
        // Re-throw other errors
        throw error;
    } finally {
        // Always clean up the transport connection
        if (client) {
            try {
                await client.close();
            } catch (closeError) {
                console.error('Error closing ROVO client:', closeError);
            }
        }
    }
}

export { createRovoMCPClient, callRovoTool, RovoOAuthProvider };
